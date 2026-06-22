# One Click Dub -> RunPod Serverless-Compatible Backend
# Pipeline: yt-dlp -> ffmpeg audio extraction -> OpenAI Whisper/faster-whisper ASR -> Smart Chunking
# -> Google/NLLB-200 translation -> optional CATT Arabic tashkeel -> Edge/OmniVoice TTS -> audio timeline mix -> final audio overlay.

import os
import re
import json
import time
import uuid
import wave
import math
import shutil
import base64
import asyncio
import subprocess
import threading
from pathlib import Path
from typing import Dict, Any, Optional, List

import requests
from fastapi import FastAPI, BackgroundTasks, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

ROOT = Path(os.environ.get('OCD_ROOT', '/runpod-volume'))
JOBS_DIR = ROOT / 'ocd_custom_jobs'
OUTPUTS_DIR = ROOT / 'ocd_custom_outputs'
JOBS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

jobs: Dict[str, Dict[str, Any]] = {}
OCD_SERVER_FIX_VERSION = '2026-06-22-runpod-serverless-fish-s2-pro-autostart-health-wait'

# NLLB-200 globals. Lazy-loaded only for Quality/Pro, not for Fast.
_NLLB_TOKENIZER = None
_NLLB_MODEL = None
_NLLB_DEVICE = None
_NLLB_MODEL_ID = None
_OPENAI_WHISPER_CACHE = {}
_FASTER_WHISPER_CACHE = {}
_MULTI_PUNCT_MODEL = None
_MULTI_PUNCT_MODEL_ID = None
_MULTI_PUNCT_PIPE = None
_MULTI_PUNCT_DISABLED_REASON = None


NLLB_LANG_MAP = {
    'auto': None,
    'en': 'eng_Latn', 'ar': 'arb_Arab', 'fr': 'fra_Latn', 'es': 'spa_Latn',
    'de': 'deu_Latn', 'it': 'ita_Latn', 'pt': 'por_Latn', 'ru': 'rus_Cyrl',
    'tr': 'tur_Latn', 'hi': 'hin_Deva', 'ur': 'urd_Arab', 'fa': 'pes_Arab',
    'ja': 'jpn_Jpan', 'ko': 'kor_Hang', 'zh': 'zho_Hans', 'zh-cn': 'zho_Hans',
    'id': 'ind_Latn', 'ms': 'zsm_Latn', 'vi': 'vie_Latn', 'th': 'tha_Thai',
    'he': 'heb_Hebr', 'nl': 'nld_Latn', 'pl': 'pol_Latn', 'uk': 'ukr_Cyrl',
}

app = FastAPI(title='One Click Dub Custom Backend')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/outputs/{filename}')
def serve_output(filename: str, request: Request):
    # Strict filename guard: never allow path traversal.
    safe = Path(filename).name
    path = OUTPUTS_DIR / safe
    if safe != filename or not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail='Output file not found')

    suffix = path.suffix.lower()
    media_type = 'audio/mpeg' if suffix == '.mp3' else 'audio/mp4' if suffix in ('.m4a', '.mp4') else 'application/octet-stream'
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Content-Disposition': f'inline; filename="{safe}"',
        'X-One-Click-Dub-Fix': OCD_SERVER_FIX_VERSION,
    }
    return FileResponse(str(path), media_type=media_type, headers=headers)


@app.head('/outputs/{filename}')
def head_output(filename: str):
    safe = Path(filename).name
    path = OUTPUTS_DIR / safe
    if safe != filename or not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail='Output file not found')
    suffix = path.suffix.lower()
    media_type = 'audio/mpeg' if suffix == '.mp3' else 'audio/mp4' if suffix in ('.m4a', '.mp4') else 'application/octet-stream'
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Content-Type': media_type,
        'Content-Length': str(path.stat().st_size),
        'X-One-Click-Dub-Fix': OCD_SERVER_FIX_VERSION,
    }
    return Response(status_code=200, headers=headers)


class DubRequest(BaseModel):
    url: str
    sourceLanguage: str = 'auto'
    targetLanguage: str = 'ar'
    voiceName: str = 'ar-SA-HamedNeural'
    whisperModel: str = 'large'  # fast=openai-whisper large by default, quality=medium, pro preview=turbo
    cuda: bool = True
    subtitleType: int = 0
    modelName: str = 'fast'       # fast=edge | quality=omnivoice | pro=fish-speech-s2-pro
    ttsType: Optional[int] = None  # 0 Edge | 2 OmniVoice | 3 Fish S2-Pro
    translationEngine: Optional[str] = None  # fast=google | quality/pro=nllb200
    pageUrl: Optional[str] = None
    referer: Optional[str] = None
    cookieString: Optional[str] = None


def public_base_url() -> str:
    return os.environ.get('PUBLIC_BASE_URL', '').rstrip('/')


def lang_short(code: str, default: str = 'en') -> str:
    c = str(code or '').strip().replace('_', '-').lower()
    if not c or c == 'auto':
        return 'auto'
    if c.startswith('zh'):
        return 'zh-CN' if 'tw' not in c and 'hk' not in c else 'zh-TW'
    return c.split('-')[0] or default


def normalize_model(req: DubRequest) -> str:
    m = str(req.modelName or 'fast').lower().strip()
    if m in ('pro', 'fish', 'fish-speech', 'fish-speech-s1-mini', 'professional'):
        return 'pro'
    if m in ('quality', 'omnivoice', 'thinker'):
        return 'quality'
    if req.ttsType == 2:
        return 'quality'
    return 'fast'


def redact_cmd_args(args: List[str]) -> List[str]:
    """Return a log-safe command list. Never print raw cookies/tokens in errors."""
    out = []
    skip_next = False
    for i, a in enumerate(args):
        if skip_next:
            skip_next = False
            continue
        a = str(a)
        low = a.lower()
        if low in ('--add-header', '--cookies'):
            out.append(a)
            if i + 1 < len(args):
                nxt = str(args[i + 1])
                if nxt.lower().startswith('cookie:'):
                    out.append('Cookie: <redacted>')
                elif low == '--cookies':
                    out.append('<cookies-file>')
                else:
                    out.append(nxt)
                skip_next = True
            continue
        if low.startswith('cookie:'):
            out.append('Cookie: <redacted>')
        else:
            out.append(a)
    return out


def run_cmd(args: List[str], cwd=None, env=None, timeout=None) -> str:
    p = subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
    )
    if p.returncode != 0:
        safe_args = redact_cmd_args(args)
        raise RuntimeError(f"Command failed ({p.returncode}): {' '.join(map(str, safe_args))}\n{p.stdout[-5000:]}")
    return p.stdout



def sanitize_header_value(value: Optional[str], max_len: int = 12000) -> str:
    value = str(value or '').strip()
    if not value:
        return ''
    value = value.replace('\r', ' ').replace('\n', ' ')
    return value[:max_len]

def ffprobe_duration(path: Path) -> float:
    out = run_cmd([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(path)
    ], timeout=60).strip()
    try:
        return float(out)
    except Exception:
        return 0.0




def env_bool(name: str, default: str = '0') -> bool:
    """Read a boolean env var using common true/false spellings."""
    return str(os.environ.get(name, default)).strip().lower() in ('1', 'true', 'yes', 'on')


def delete_path_later(path: Path, delay_sec: float, label: str = ''):
    """Delete a file/folder after a delay without blocking the current job response."""
    try:
        path = Path(path)
        delay_sec = max(0.0, float(delay_sec or 0.0))
    except Exception:
        return

    def _delete():
        try:
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            elif path.exists():
                path.unlink(missing_ok=True)
            print(f'[OCD] cleaned {label or path}: {path}')
        except Exception as e:
            print(f'[OCD] cleanup failed for {path}: {e!r}')

    timer = threading.Timer(delay_sec, _delete)
    timer.daemon = True
    timer.start()



def clear_omnivoice_prompt_cache_for_ref(ref_audio: Optional[str]):
    """Remove cached OmniVoice clone prompts for one temporary reference audio."""
    ref_audio = str(ref_audio or '').strip()
    if not ref_audio:
        return
    try:
        cache = globals().get('_OMNIVOICE_PROMPT_CACHE', {})
        for key in list(cache.keys()):
            try:
                if key and str(key[0]) == ref_audio:
                    cache.pop(key, None)
            except Exception:
                pass
    except Exception as e:
        print('[OCD] OmniVoice prompt cache cleanup failed:', repr(e))


def clear_omnivoice_prompt_cache_later(ref_audio: Optional[str], delay_sec: float):
    try:
        delay_sec = max(0.0, float(delay_sec or 0.0))
    except Exception:
        delay_sec = 0.0
    timer = threading.Timer(delay_sec, lambda: clear_omnivoice_prompt_cache_for_ref(ref_audio))
    timer.daemon = True
    timer.start()


def create_omnivoice_auto_ref_audio(audio_wav: Path, raw_segments: List[Dict[str, Any]], job_dir: Path, job: Dict[str, Any]) -> Optional[Path]:
    """Create one per-job reference sample from the current video's own voice.

    Used by OmniVoice Quality and Fish S2-Pro when auto-clone is enabled.

    The sample is saved inside the job folder, so two concurrent videos never share the same
    cloned voice reference. We do not blindly cut the first seconds of the file; we use Whisper
    timestamps to start from the first meaningful speech segment and collect a short speech span.
    """
    if not (env_bool('OCD_OMNIVOICE_AUTO_CLONE', '1') or env_bool('OCD_FISH_AUTO_CLONE', '1')):
        return None
    try:
        audio_wav = Path(audio_wav)
        job_dir = Path(job_dir)
        if not audio_wav.exists() or not raw_segments:
            return None

        min_sec = float(os.environ.get('OCD_OMNIVOICE_AUTO_REF_MIN_SEC', '6'))
        max_sec = float(os.environ.get('OCD_OMNIVOICE_AUTO_REF_MAX_SEC', '14'))
        pad_before = float(os.environ.get('OCD_OMNIVOICE_AUTO_REF_PAD_BEFORE', '0.08'))
        pad_after = float(os.environ.get('OCD_OMNIVOICE_AUTO_REF_PAD_AFTER', '0.18'))
        min_text_chars = int(os.environ.get('OCD_OMNIVOICE_AUTO_REF_MIN_TEXT_CHARS', '8'))

        chosen = []
        start = None
        end = None
        for seg in raw_segments:
            txt = clean_text(seg.get('text', ''))
            s = max(0.0, float(seg.get('start', 0.0)))
            e = max(s, float(seg.get('end', 0.0)))
            dur = e - s
            # Skip empty, ultra-short, or clearly useless ASR segments.
            if dur < 0.45 or len(txt) < min_text_chars:
                continue
            if start is None:
                start = max(0.0, s - pad_before)
                end = min(e + pad_after, start + max_sec)
                chosen.append(seg)
            else:
                # Prefer the first continuous speech area; stop at long gaps.
                if s - end > 1.8 and (end - start) >= min_sec:
                    break
                end = min(max(end, e + pad_after), start + max_sec)
                chosen.append(seg)
            if start is not None and (end - start) >= max_sec:
                break
            if start is not None and (end - start) >= min_sec and len(chosen) >= 2:
                break

        if start is None or end is None or (end - start) < 1.2:
            return None

        ref_path = job_dir / 'omnivoice_auto_ref.wav'
        # Convert to a clean mono 24 kHz wav because OmniVoice voice cloning is usually more
        # stable with a consistent reference format.
        run_cmd([
            'ffmpeg', '-y', '-ss', f'{start:.3f}', '-to', f'{end:.3f}', '-i', str(audio_wav),
            '-vn', '-ac', '1', '-ar', '24000',
            '-af', 'highpass=f=70,lowpass=f=7600,dynaudnorm=f=150:g=9',
            '-c:a', 'pcm_s16le', str(ref_path)
        ], timeout=180)
        if not ref_path.exists() or ref_path.stat().st_size < 2048:
            return None
        job['omnivoiceAutoClone'] = True
        job['omnivoiceAutoCloneMode'] = 'per-job-from-current-video'
        job['omnivoiceAutoCloneRef'] = str(ref_path)
        job['omnivoiceAutoCloneSpan'] = {'start': round(start, 3), 'end': round(end, 3), 'duration': round(end - start, 3)}
        job['omnivoiceAutoCloneSegments'] = len(chosen)
        job['autoCloneRefText'] = clean_text(' '.join(clean_text(x.get('text', '')) for x in chosen))
        return ref_path
    except Exception as e:
        job['omnivoiceAutoClone'] = False
        job['omnivoiceAutoCloneError'] = str(e)
        print('[OCD] OmniVoice auto clone ref failed:', repr(e))
        return None

def atempo_filter(factor: float) -> str:
    factor = max(0.5, min(4.0, float(factor or 1.0)))
    parts = []
    while factor > 2.0:
        parts.append('atempo=2.0')
        factor /= 2.0
    while factor < 0.5:
        parts.append('atempo=0.5')
        factor /= 0.5
    parts.append(f'atempo={factor:.4f}')
    return ','.join(parts)


def newest_video_after(paths, start_ts: float) -> Optional[Path]:
    candidates = []
    for root in paths:
        root = Path(root)
        if not root.exists():
            continue
        for ext in ('*.mp4', '*.mkv', '*.mov', '*.webm'):
            for p in root.rglob(ext):
                try:
                    st = p.stat()
                    if st.st_size > 1024 * 100 and st.st_mtime >= start_ts - 2:
                        candidates.append(p)
                except FileNotFoundError:
                    pass
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def newest_media_after(paths, start_ts: float) -> Optional[Path]:
    """Find the newest audio/video file created by yt-dlp.
    One Click Dub only needs an input media file that ffmpeg can decode; downloading audio-only
    is faster and avoids YouTube video-format failures.
    """
    candidates = []
    media_exts = (
        '*.m4a', '*.mp3', '*.webm', '*.opus', '*.ogg', '*.wav', '*.aac',
        '*.mp4', '*.mkv', '*.mov', '*.flv'
    )
    for root in paths:
        root = Path(root)
        if not root.exists():
            continue
        for ext in media_exts:
            for f in root.rglob(ext):
                try:
                    st = f.stat()
                    # Skip tiny thumbnails/fragments; keep real media.
                    if st.st_size > 32 * 1024 and st.st_mtime >= start_ts - 2:
                        candidates.append(f)
                except FileNotFoundError:
                    pass
    if not candidates:
        return None
    candidates.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return candidates[0]


def _write_netscape_cookie_file(raw_cookie: str, out_path: Path, domain: str = '.youtube.com') -> Optional[Path]:
    """Write request cookies to a temporary Netscape cookies.txt file.
    This is safer than passing `--add-header Cookie: ...` and prevents cookie leakage in logs.
    Disabled by default; enable with OCD_YTDLP_USE_REQUEST_COOKIES=1 only when needed.
    """
    raw_cookie = sanitize_header_value(raw_cookie, 20000)
    if not raw_cookie:
        return None
    rows = ['# Netscape HTTP Cookie File\n']
    for part in raw_cookie.split(';'):
        part = part.strip()
        if not part or '=' not in part:
            continue
        name, value = part.split('=', 1)
        name = name.strip()
        value = value.strip()
        if not name:
            continue
        # domain, include_subdomains, path, secure, expiry, name, value
        rows.append(f'{domain}\tTRUE\t/\tTRUE\t2147483647\t{name}\t{value}\n')
    if len(rows) <= 1:
        return None
    out_path.write_text(''.join(rows), encoding='utf-8')
    try:
        os.chmod(out_path, 0o600)
    except Exception:
        pass
    return out_path


def build_ytdlp_base_args(referer: str = '', cookie_file: Optional[Path] = None) -> List[str]:
    """Base yt-dlp flags for RunPod/RunPod.
    Key fix: use remote EJS challenge solver when available and never request video unless needed.
    """
    args = [
        'python', '-m', 'yt_dlp',
        '--no-playlist',
        '--force-ipv4',
        '--no-warnings',
        '--user-agent', os.environ.get(
            'OCD_YTDLP_UA',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        ),
        '--extractor-args', os.environ.get('OCD_YTDLP_EXTRACTOR_ARGS', 'youtube:player_client=default,android,web'),
    ]
    if env_bool('OCD_YTDLP_REMOTE_EJS', '1'):
        args += ['--remote-components', os.environ.get('OCD_YTDLP_REMOTE_COMPONENTS', 'ejs:github')]
    if referer:
        args += ['--referer', referer, '--add-header', f'Referer: {referer}']
    if cookie_file:
        args += ['--cookies', str(cookie_file)]
    return args


def download_input_media_with_ytdlp(url: str, job_dir: Path, start_ts: float, referer: str = '', raw_cookie: str = '') -> Path:
    """Download audio-first media for the dub pipeline.

    Previous bug: requesting `bv*+ba` forced a video download and failed on many YouTube URLs
    when the n-signature challenge was not solved, resulting in "Only images are available".
    This function tries audio-only formats first, uses the remote EJS solver, and falls back
    gracefully if a given yt-dlp option is unavailable.
    """
    cookie_file = None
    if env_bool('OCD_YTDLP_USE_REQUEST_COOKIES', '0') and raw_cookie:
        cookie_file = _write_netscape_cookie_file(raw_cookie, job_dir / 'cookies.txt')

    out_tpl = str(job_dir / 'input.%(ext)s')
    base = build_ytdlp_base_args(referer=referer, cookie_file=cookie_file)
    format_chain = os.environ.get('OCD_YTDLP_FORMAT', 'ba[ext=m4a]/bestaudio[ext=m4a]/bestaudio/best')

    attempts = [
        base + ['-f', format_chain, '-o', out_tpl, url],
        # If the installed yt-dlp build does not know --remote-components, retry without it.
        [a for pair in zip(base, base[1:] + ['']) for a in []],
    ]

    # Build clean fallback without --remote-components pair.
    no_remote = []
    skip = False
    for a in base:
        if skip:
            skip = False
            continue
        if a == '--remote-components':
            skip = True
            continue
        no_remote.append(a)
    attempts[1] = no_remote + ['-f', format_chain, '-o', out_tpl, url]

    # Broader final fallback.
    attempts.append(no_remote + ['-f', 'bestaudio/best', '-o', out_tpl, url])

    last_error = None
    for idx, args in enumerate(attempts, start=1):
        try:
            print(f'[OCD] yt-dlp attempt {idx}/{len(attempts)}: audio-first download')
            run_cmd(args, timeout=int(os.environ.get('OCD_YTDLP_TIMEOUT', '1800')))
            media = newest_media_after([job_dir], start_ts)
            if media:
                print(f'[OCD] yt-dlp downloaded media: {media} ({media.stat().st_size} bytes)')
                return media
            last_error = RuntimeError('yt-dlp finished but no decodable media file was created')
        except Exception as e:
            last_error = e
            print(f'[OCD] yt-dlp attempt {idx} failed: {str(e)[-1200:]}')
            # Continue to next strategy.

    raise RuntimeError(f'yt-dlp could not download audio/video media for this URL. Last error: {last_error}')


EDGE_DEFAULT_VOICES = {
    'ar': 'ar-SA-HamedNeural',
    'en': 'en-US-RogerNeural',
    'fr': 'fr-FR-HenriNeural',
    'es': 'es-ES-AlvaroNeural',
    'de': 'de-DE-ConradNeural',
    'it': 'it-IT-DiegoNeural',
    'pt': 'pt-BR-AntonioNeural',
    'ru': 'ru-RU-DmitryNeural',
    'ja': 'ja-JP-KeitaNeural',
    'ko': 'ko-KR-InJoonNeural',
    'zh': 'zh-CN-YunxiNeural',
    'hi': 'hi-IN-MadhurNeural',
    'tr': 'tr-TR-AhmetNeural',
}


# ---------------- Arabic Tashkeel / Diacritization ----------------
# Optional CATT integration. Install in RunPod with: pip install catt-tashkeel
# CATT is loaded lazily once, then reused for all TTS chunks.
_CATT_MODEL = None
_CATT_MODEL_KIND = None
_CHATTERBOX_MODEL = None
_CHATTERBOX_MODEL_ID = None
_OMNIVOICE_MODEL = None
_OMNIVOICE_MODEL_ID = None
_OMNIVOICE_PROMPT_CACHE = {}
CHATTERBOX_PROFILE_PRESETS = {
    # Chatterbox does not ship a fixed named-voice list. These profiles tune generation style.
    # To clone a specific voice, place a reference file in /runpod-volume/chatterbox_refs/ and use its filename.
    'default': {'exaggeration': 0.50, 'cfg_weight': 0.50},
    'warm-narrator': {'exaggeration': 0.45, 'cfg_weight': 0.45},
    'clear-presenter': {'exaggeration': 0.40, 'cfg_weight': 0.50},
    'expressive-story': {'exaggeration': 0.70, 'cfg_weight': 0.35},
    'calm-learning': {'exaggeration': 0.35, 'cfg_weight': 0.35},
    'ref-voice.wav': {'exaggeration': 0.50, 'cfg_weight': 0.35},
}


OMNIVOICE_DESIGN_PRESETS = {
    # Voice Design presets: no reference audio required.
    # These are reliable to start with, especially when you do not have a ref wav.
    'design-male-deep-ar': 'male, middle-aged, low pitch',
    'design-male-warm-ar': 'male, young adult, moderate pitch',
    'design-female-soft-ar': 'female, young adult, moderate pitch',
    'design-female-bright-ar': 'female, young adult, high pitch',
    'design-narrator-ar': 'male, middle-aged, low pitch',
    # Voice Clone/reference roles: put the wav file in /runpod-volume/omnivoice_refs/.
    'nverguo.wav': 'nverguo.wav',
}

OMNIVOICE_VALID_EN_INSTRUCT_ITEMS = {
    'american accent', 'australian accent', 'british accent', 'canadian accent',
    'child', 'chinese accent', 'elderly', 'female', 'high pitch',
    'indian accent', 'japanese accent', 'korean accent', 'low pitch',
    'male', 'middle-aged', 'moderate pitch', 'portuguese accent',
    'russian accent', 'teenager', 'very high pitch', 'very low pitch',
    'whisper', 'young adult',
}


def sanitize_omnivoice_instruct(instruct: str) -> str:
    """OmniVoice accepts only a small fixed list of instruct tags."""
    parts = [p.strip().lower() for p in str(instruct or '').split(',') if p.strip()]
    valid = [p for p in parts if p in OMNIVOICE_VALID_EN_INSTRUCT_ITEMS]
    if not valid:
        return 'male, middle-aged, low pitch'
    # Preserve order while removing duplicates.
    seen = set()
    out = []
    for p in valid:
        if p not in seen:
            out.append(p)
            seen.add(p)
    return ', '.join(out)
ARABIC_DIACRITICS_RE = re.compile(r'[\u064B-\u0652\u0670]')
ARABIC_LETTERS_RE = re.compile(r'[\u0600-\u06FF]')


def is_arabic_lang(code: str) -> bool:
    return str(code or '').strip().lower().replace('_', '-').startswith('ar')


def strip_arabic_diacritics(text: str) -> str:
    return ARABIC_DIACRITICS_RE.sub('', str(text or ''))


def should_use_catt(target_lang: str) -> bool:
    flag = str(os.environ.get('OCD_USE_CATT_TASHKEEL', '1')).strip().lower()
    return flag not in ('0', 'false', 'no', 'off') and is_arabic_lang(target_lang)


def get_catt_model():
    global _CATT_MODEL, _CATT_MODEL_KIND
    wanted = str(os.environ.get('OCD_CATT_MODEL', 'eo')).strip().lower()
    # eo = faster, ed = more accurate but slower
    if wanted not in ('eo', 'ed'):
        wanted = 'eo'
    if _CATT_MODEL is not None and _CATT_MODEL_KIND == wanted:
        return _CATT_MODEL
    from catt_tashkeel import CATTEncoderDecoder, CATTEncoderOnly
    _CATT_MODEL = CATTEncoderDecoder() if wanted == 'ed' else CATTEncoderOnly()
    _CATT_MODEL_KIND = wanted
    return _CATT_MODEL


def apply_catt_tashkeel_batch(texts: List[str]) -> List[str]:
    """Return diacritized Arabic texts. Fallback to original text on any CATT failure."""
    cleaned = [clean_text(t) for t in texts]
    if not cleaned:
        return cleaned
    try:
        model = get_catt_model()
        # CATT expects Arabic text; we pass one chunk per TTS segment.
        out = model.do_tashkeel_batch(cleaned, verbose=False)
        if isinstance(out, str):
            out = [out]
        out = list(out)
        # Guard against unexpected output length.
        if len(out) != len(cleaned):
            return cleaned
        result = []
        for original, shaped in zip(cleaned, out):
            shaped = clean_text(shaped)
            # Avoid empty/broken output.
            result.append(shaped if shaped and ARABIC_LETTERS_RE.search(shaped) else original)
        return result
    except Exception as e:
        print('[OCD] CATT tashkeel failed; continuing without tashkeel:', repr(e))
        return cleaned


def edge_voice_for(target_lang: str, requested: str) -> str:
    requested = str(requested or '').strip()
    # Edge accepts voices like ar-SA-HamedNeural. Reject OmniVoice/sample filenames.
    if requested.endswith('Neural') and '-' in requested and not requested.lower().endswith(('.wav', '.mp3')):
        return requested
    key = lang_short(target_lang, 'en')
    return EDGE_DEFAULT_VOICES.get(key, EDGE_DEFAULT_VOICES.get(key.split('-')[0], 'en-US-RogerNeural'))


def srt_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds or 0.0))
    ms = int(round((seconds - int(seconds)) * 1000))
    total = int(seconds)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    return f'{h:02}:{m:02}:{s:02},{ms:03}'


def write_srt(path: Path, chunks: List[Dict[str, Any]], field: str = 'text'):
    with open(path, 'w', encoding='utf-8') as f:
        for i, c in enumerate(chunks, 1):
            text = str(c.get(field) or c.get('text') or '').strip()
            f.write(f'{i}\n{srt_time(c["start"])} --> {srt_time(c["end"])}\n{text}\n\n')


def clean_text(text: str) -> str:
    text = re.sub(r'\s+', ' ', str(text or '')).strip()
    return text



ARABIC_LETTER_CHECK_RE = re.compile(r'[\u0600-\u06FF]')
ARABIC_QUESTION_START_RE = re.compile(r'^(هل|أين|اين|متى|كيف|لماذا|لما|من|ما|ماذا|كم|أي|اي|أيه|ايه)\b')


def is_arabic_text(text: str) -> bool:
    text = str(text or '')
    letters = re.findall(r'[A-Za-z\u0600-\u06FF]', text)
    if not letters:
        return False
    arabic = len(ARABIC_LETTER_CHECK_RE.findall(text))
    return arabic / max(1, len(letters)) >= 0.35


def strip_duplicate_spaces_before_punct(text: str) -> str:
    text = re.sub(r'\s+([،؛:؟!?.])', r'\1', str(text or ''))
    text = re.sub(r'([،؛:؟!?.]){2,}', r'\1', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def simple_arabic_punctuation_fallback(text: str) -> str:
    """Light fallback only when the Arabic research repo is unavailable.
    It is intentionally conservative: it avoids rewriting words and only adds sentence-ending punctuation.
    """
    text = strip_duplicate_spaces_before_punct(text)
    if not text:
        return text
    if text[-1] in '،؛:؟!?.':
        return text
    if ARABIC_QUESTION_START_RE.search(text):
        return text + '؟'
    return text + '.'


def run_external_punctuation_command(text: str, command: str, timeout: int = 90) -> Optional[str]:
    """Run a user-provided punctuation command that reads text from stdin and prints restored text.
    Example command:
      python /runpod-volume/arabic-punctuation-restoration-nlp/predict_cli.py
    """
    command = str(command or '').strip()
    if not command or not text.strip():
        return None
    try:
        p = subprocess.run(
            command,
            input=text,
            shell=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
        )
        if p.returncode == 0:
            out = strip_duplicate_spaces_before_punct(p.stdout)
            return out if out else None
        print('[OCD] External punctuation command failed:', p.stderr[-1200:], flush=True)
    except Exception as e:
        print('[OCD] External punctuation command exception:', repr(e), flush=True)
    return None


def restore_arabic_punctuation(text: str) -> Dict[str, str]:
    """Arabic punctuation adapter.

    The mina360 repository is a research/notebook project. Its README states that the trained
    checkpoint is not included, so this backend supports it through OCD_ARABIC_PUNCT_COMMAND
    after you train/export a CLI from that repo. Without that command, we use a conservative
    fallback so the pipeline never crashes.
    """
    original = clean_text(text)
    if not original:
        return {'text': original, 'engine': 'empty'}

    cmd = os.environ.get('OCD_ARABIC_PUNCT_COMMAND', '').strip()
    if cmd:
        out = run_external_punctuation_command(original, cmd, timeout=int(os.environ.get('OCD_PUNCT_TIMEOUT', '90')))
        if out:
            return {'text': out, 'engine': 'arabic-punctuation-restoration-nlp-command'}

    # Optional: if user wants to force no fallback, return original.
    if os.environ.get('OCD_ARABIC_PUNCT_REQUIRE_MODEL', '0') == '1':
        return {'text': original, 'engine': 'arabic-punctuation-restoration-nlp-missing-checkpoint'}

    return {'text': simple_arabic_punctuation_fallback(original), 'engine': 'arabic-fallback-conservative'}



def _punctuation_model_id() -> str:
    # Default model used by deepmultilingualpunctuation. Use OCD_MULTI_PUNCT_MODEL to override.
    return os.environ.get('OCD_MULTI_PUNCT_MODEL', 'oliverguhr/fullstop-punctuation-multilang-large').strip() or 'oliverguhr/fullstop-punctuation-multilang-large'


def get_multilingual_punctuation_pipe():
    """Transformers-v5-compatible punctuation pipeline.

    deepmultilingualpunctuation 1.0.1 creates a HF token-classification pipeline with
    grouped_entities=False. That keyword breaks on Transformers v5 and caused repeated
    failures/loading in RunPod. This direct implementation keeps the same FullStop model but
    uses aggregation_strategy='none' and caches the pipeline once per server process.
    """
    global _MULTI_PUNCT_PIPE, _MULTI_PUNCT_MODEL_ID, _MULTI_PUNCT_DISABLED_REASON
    if _MULTI_PUNCT_DISABLED_REASON:
        raise RuntimeError(_MULTI_PUNCT_DISABLED_REASON)
    model_id = _punctuation_model_id()
    if _MULTI_PUNCT_PIPE is not None and _MULTI_PUNCT_MODEL_ID == model_id:
        return _MULTI_PUNCT_PIPE
    try:
        import torch
        from transformers import pipeline
        device = 0 if torch.cuda.is_available() else -1
        print(f'[OCD] Loading punctuation model once: {model_id} device={device}', flush=True)
        try:
            _MULTI_PUNCT_PIPE = pipeline('token-classification', model=model_id, aggregation_strategy='none', device=device)
        except TypeError:
            _MULTI_PUNCT_PIPE = pipeline('ner', model=model_id, aggregation_strategy='none', device=device)
        _MULTI_PUNCT_MODEL_ID = model_id
        print(f'[OCD] Punctuation model ready: {model_id}', flush=True)
        return _MULTI_PUNCT_PIPE
    except Exception as e:
        _MULTI_PUNCT_DISABLED_REASON = f'punctuation model load failed: {repr(e)}'
        print('[OCD] Punctuation model disabled for this server run:', _MULTI_PUNCT_DISABLED_REASON, flush=True)
        raise


def punct_preprocess_words(text: str) -> List[str]:
    # Same core behavior as deepmultilingualpunctuation: remove punctuation except decimal separators.
    text = re.sub(r'(?<!\d)[.,;:!?؟،؛](?!\d)', '', clean_text(text))
    return [w for w in text.split() if w.strip()]


def overlap_chunks(lst: List[str], n: int, stride: int = 0):
    step = max(1, n - stride)
    for i in range(0, len(lst), step):
        yield lst[i:i + n]


def predict_punctuation_labels(words: List[str]) -> List[List[Any]]:
    pipe = get_multilingual_punctuation_pipe()
    chunk_size = int(os.environ.get('OCD_PUNCT_CHUNK_WORDS', '180'))
    overlap = int(os.environ.get('OCD_PUNCT_OVERLAP_WORDS', '5'))
    if len(words) <= chunk_size:
        overlap = 0
    batches = list(overlap_chunks(words, chunk_size, overlap))
    if batches and len(batches[-1]) <= overlap:
        batches.pop()
    tagged_words: List[List[Any]] = []
    for batch_i, batch in enumerate(batches):
        current_overlap = 0 if batch_i == len(batches) - 1 else overlap
        text = ' '.join(batch)
        result = pipe(text)
        if not result:
            for word in batch[:len(batch)-current_overlap]:
                tagged_words.append([word, '0', 0.0])
            continue
        char_index = 0
        result_index = 0
        score = 0.0
        for word in batch[:len(batch)-current_overlap]:
            char_index += len(word) + 1
            label = '0'
            while result_index < len(result) and char_index > int(result[result_index].get('end', 0)):
                label = result[result_index].get('entity') or result[result_index].get('entity_group') or '0'
                score = float(result[result_index].get('score', 0.0) or 0.0)
                result_index += 1
            tagged_words.append([word, label, score])
    return tagged_words


def punctuation_prediction_to_text(prediction: List[List[Any]]) -> str:
    out = []
    for word, label, _score in prediction:
        label = str(label)
        # HF may return LABEL_0 etc. Normalize common patterns defensively.
        if label.startswith('LABEL_'):
            label = label.replace('LABEL_', '')
        if label in ('COMMA', 'comma'):
            label = ','
        elif label in ('PERIOD', 'period', 'FULLSTOP', 'fullstop'):
            label = '.'
        elif label in ('QUESTION', 'question'):
            label = '?'
        elif label in ('COLON', 'colon'):
            label = ':'
        elif label in ('HYPHEN', 'hyphen'):
            label = '-'
        out.append(word)
        if label in '.,?-:':
            out[-1] = out[-1] + label
    return strip_duplicate_spaces_before_punct(' '.join(out))


def restore_multilingual_punctuation(text: str) -> Dict[str, str]:
    global _MULTI_PUNCT_DISABLED_REASON
    original = clean_text(text)
    if not original:
        return {'text': original, 'engine': 'empty'}
    if _MULTI_PUNCT_DISABLED_REASON:
        # Do not keep retrying and reloading on every chunk. This was the source of the long delay.
        fallback = simple_arabic_punctuation_fallback(original)
        return {'text': fallback, 'engine': 'deepmultilingualpunctuation-disabled-fallback'}
    try:
        min_words = int(os.environ.get('OCD_PUNCT_MIN_WORDS', '7'))
        words = punct_preprocess_words(original)
        if len(words) < min_words:
            fallback = simple_arabic_punctuation_fallback(original)
            return {'text': fallback, 'engine': 'punctuation-short-fallback'}
        pred = predict_punctuation_labels(words)
        out = punctuation_prediction_to_text(pred)
        return {'text': out or original, 'engine': 'deepmultilingualpunctuation-hf-direct'}
    except Exception as e:
        # Disable after first failure, so one incompatible transformers/library call does not waste minutes.
        _MULTI_PUNCT_DISABLED_REASON = repr(e)
        print('[OCD] deepmultilingualpunctuation direct mode failed once; disabling for this server run:', repr(e), flush=True)
        fallback = simple_arabic_punctuation_fallback(original)
        return {'text': fallback, 'engine': 'deepmultilingualpunctuation-failed-once-fallback'}


def restore_source_punctuation_for_chunks(chunks: List[Dict[str, Any]], source_lang: str, job: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Restore punctuation after ASR and before translation/TTS.

    Uses a Transformers-v5-compatible direct implementation of the FullStop/deepmultilingualpunctuation
    model. The model is loaded once and reused. If it fails once, it is disabled for the current
    server run and a conservative fallback is used instead of retrying every chunk.
    """
    if os.environ.get('OCD_USE_PUNCTUATION', '1') == '0':
        if job is not None:
            job['punctuation'] = 'disabled'
        return chunks
    out: List[Dict[str, Any]] = []
    engines: Dict[str, int] = {}
    started = time.time()
    for c in chunks:
        c = dict(c)
        text = clean_text(c.get('text'))
        if not text:
            out.append(c)
            continue
        res = restore_multilingual_punctuation(text)
        c['textBeforePunctuation'] = text
        c['text'] = clean_text(res.get('text') or text)
        c['punctuationEngine'] = res.get('engine', 'unknown')
        engines[c['punctuationEngine']] = engines.get(c['punctuationEngine'], 0) + 1
        out.append(c)
    if job is not None:
        job['punctuation'] = 'enabled'
        job['punctuationEngines'] = engines
        job['punctuationMode'] = 'deepmultilingualpunctuation-hf-direct-v5-compatible'
        job['punctuationElapsedSec'] = round(time.time() - started, 2)
    return out

def smart_chunk_segments(segments: List[Dict[str, Any]], model: str) -> List[Dict[str, Any]]:
    # OmniVoice is more stable when each TTS request is neither too short nor too long.
    # Long chunks make it skip words; tiny chunks make the voice color drift.
    if model == 'quality':
        max_duration = float(os.environ.get('OCD_OMNIVOICE_CHUNK_MAX_SECONDS', '8.0'))
        max_chars = int(os.environ.get('OCD_OMNIVOICE_CHUNK_MAX_CHARS', '220'))
        max_gap = float(os.environ.get('OCD_OMNIVOICE_CHUNK_MAX_GAP', '0.55'))
        max_lines = int(os.environ.get('OCD_OMNIVOICE_CHUNK_MAX_LINES', '4'))
    elif model == 'pro':
        max_duration, max_chars, max_gap, max_lines = 9.0, 360, 0.65, 4
    else:
        max_duration, max_chars, max_gap, max_lines = 22.0, 760, 0.95, 8

    chunks: List[Dict[str, Any]] = []
    current = None

    def flush():
        nonlocal current
        if current and clean_text(current.get('text')):
            current['text'] = clean_text(current['text'])
            chunks.append(current)
        current = None

    for seg in segments:
        text = clean_text(seg.get('text'))
        if not text:
            continue
        start = float(seg.get('start') or 0.0)
        end = float(seg.get('end') or start)
        if end <= start:
            end = start + 0.5

        if current is None:
            current = {'start': start, 'end': end, 'text': text, 'lines': 1}
            continue

        gap = start - float(current['end'])
        proposed_duration = end - float(current['start'])
        proposed_chars = len(current['text']) + 1 + len(text)
        proposed_lines = int(current.get('lines', 1)) + 1
        sentence_break = bool(re.search(r'[.!?؟。]$', current['text']))

        should_split = (
            gap > max_gap or
            proposed_duration > max_duration or
            proposed_chars > max_chars or
            proposed_lines > max_lines or
            (sentence_break and proposed_duration > max_duration * 0.55 and proposed_chars > max_chars * 0.45)
        )
        if should_split:
            flush()
            current = {'start': start, 'end': end, 'text': text, 'lines': 1}
        else:
            current['end'] = end
            current['text'] = clean_text(current['text'] + ' ' + text)
            current['lines'] = proposed_lines

    flush()
    return chunks


def clean_tts_text(text: str) -> str:
    """Clean text before sending it to TTS to reduce skipped words and odd prosody."""
    text = clean_text(text)
    # Remove invisible/control characters and keep normal punctuation.
    text = re.sub(r'[\u200b\u200c\u200d\ufeff]', '', text)
    text = re.sub(r'[\r\n\t]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    # Normalize repeated punctuation that often confuses TTS.
    text = re.sub(r'([.!؟?،,؛;:])\1+', r'\1', text)
    text = re.sub(r'\s+([.!؟?،,؛;:])', r'\1', text)
    text = re.sub(r'([،,؛;:])([^\s])', r'\1 \2', text)
    # Do not append a full stop after comma/semicolon/colon.
    # Pause-splitting uses commas/colons as valid boundary markers; adding a dot here
    # produced odd TTS text such as "مرحبا، ." and forced an unnatural sentence pause.
    if text and text[-1] not in '.!?؟،,؛;:':
        text += '.'
    return text


def split_text_for_tts(text: str, max_chars: int = 190) -> List[str]:
    """Split long TTS text on punctuation first, then words."""
    text = clean_tts_text(text)
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    # Split while preserving sentence punctuation.
    parts = re.split(r'(?<=[.!؟?])\s+', text)
    if len(parts) <= 1:
        parts = re.split(r'(?<=[،,؛;:])\s+', text)

    out: List[str] = []
    buf = ''
    for part in parts:
        part = clean_tts_text(part)
        if not part:
            continue
        candidate = clean_text((buf + ' ' + part).strip()) if buf else part
        if len(candidate) <= max_chars:
            buf = candidate
        else:
            if buf:
                out.append(clean_tts_text(buf))
                buf = ''
            # Fallback by words for very long sentence.
            words = part.split()
            wbuf = ''
            for w in words:
                cand = (wbuf + ' ' + w).strip() if wbuf else w
                if len(cand) <= max_chars:
                    wbuf = cand
                else:
                    if wbuf:
                        out.append(clean_tts_text(wbuf))
                    wbuf = w
            if wbuf:
                buf = wbuf
    if buf:
        out.append(clean_tts_text(buf))
    return [x for x in out if clean_text(x)]


def split_chunk_by_tts_text(chunk: Dict[str, Any], field: str, max_chars: int) -> List[Dict[str, Any]]:
    text = clean_tts_text(chunk.get(field) or chunk.get('translatedText') or chunk.get('text') or '')
    parts = split_text_for_tts(text, max_chars=max_chars)
    if len(parts) <= 1:
        c = dict(chunk)
        c[field] = text
        return [c]

    start = float(chunk.get('start') or 0.0)
    end = float(chunk.get('end') or start + 1.0)
    total_duration = max(0.6, end - start)
    total_weight = sum(max(1, len(x)) for x in parts)
    pos = start
    output: List[Dict[str, Any]] = []
    for idx, part in enumerate(parts):
        if idx == len(parts) - 1:
            part_end = end
        else:
            part_duration = total_duration * (max(1, len(part)) / max(1, total_weight))
            part_end = min(end, pos + max(0.75, part_duration))
        c = dict(chunk)
        c['start'] = pos
        c['end'] = max(part_end, pos + 0.45)
        c[field] = clean_tts_text(part)
        c['splitFromLongText'] = True
        output.append(c)
        pos = c['end']
    return output


def refine_omnivoice_tts_chunks(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Post-process translated chunks specifically for OmniVoice stability.

    Goals:
    - avoid long text that causes skipped words,
    - merge tiny text that causes voice-color drift,
    - keep timeline approximately aligned.
    """
    max_chars = int(os.environ.get('OCD_OMNIVOICE_TTS_MAX_CHARS', '190'))
    min_chars = int(os.environ.get('OCD_OMNIVOICE_TTS_MIN_CHARS', '35'))
    max_seconds = float(os.environ.get('OCD_OMNIVOICE_TTS_MAX_SECONDS', '8.5'))
    field = 'ttsText'

    # First split long chunks.
    expanded: List[Dict[str, Any]] = []
    for c in chunks:
        expanded.extend(split_chunk_by_tts_text(c, field, max_chars=max_chars))

    # Then merge very small adjacent chunks when safe.
    refined: List[Dict[str, Any]] = []
    for c in expanded:
        c = dict(c)
        c[field] = clean_tts_text(c.get(field) or c.get('translatedText') or c.get('text') or '')
        if not c[field]:
            continue
        if refined:
            prev = refined[-1]
            combined_text = clean_tts_text(str(prev.get(field) or '') + ' ' + c[field])
            combined_duration = float(c['end']) - float(prev['start'])
            gap = float(c['start']) - float(prev['end'])
            if len(prev.get(field, '')) < min_chars and len(combined_text) <= max_chars and combined_duration <= max_seconds and gap <= 0.65:
                prev[field] = combined_text
                prev['end'] = c['end']
                prev['mergedSmallChunk'] = True
                continue
        refined.append(c)

    for idx, c in enumerate(refined, 1):
        c['ttsIndex'] = idx
    return refined



def punctuation_pause_seconds(text: str) -> float:
    """Return an explicit timeline pause for punctuation at the end of a TTS sub-chunk."""
    if str(os.environ.get('OCD_TTS_PUNCT_PAUSES', '1')).lower() not in ('1', 'true', 'yes', 'on'):
        return 0.0
    t = clean_text(text)
    if not t:
        return 0.0
    last = t[-1]
    if last in '.!?؟':
        return float(os.environ.get('OCD_TTS_PAUSE_SENTENCE', '0.48'))
    if last in '،,':
        return float(os.environ.get('OCD_TTS_PAUSE_COMMA', '0.22'))
    if last in '؛;:':
        return float(os.environ.get('OCD_TTS_PAUSE_SEMICOLON', '0.32'))
    return 0.0


def split_text_by_pause_punctuation(text: str) -> List[Dict[str, Any]]:
    """Split text into speech parts and attach a desired pause after punctuation.

    This converts punctuation into actual silence in the output timeline. TTS engines often
    do not pause reliably at punctuation when text is generated chunk-by-chunk.
    """
    text = clean_tts_text(text)
    if not text:
        return []
    min_chars = int(os.environ.get('OCD_TTS_PAUSE_MIN_CHARS', '24'))
    max_parts = int(os.environ.get('OCD_TTS_PAUSE_MAX_PARTS_PER_CHUNK', '6'))
    enable_commas = str(os.environ.get('OCD_TTS_PAUSE_ON_COMMA', '1')).lower() in ('1', 'true', 'yes', 'on')
    split_chars = '.!?؟؛;:' + ('،,' if enable_commas else '')

    parts: List[str] = []
    buf = ''
    for ch in text:
        buf += ch
        if ch in split_chars:
            cleaned = clean_tts_text(buf)
            if cleaned:
                parts.append(cleaned)
            buf = ''
    if clean_text(buf):
        parts.append(clean_tts_text(buf))

    if len(parts) <= 1:
        return [{'text': text, 'pauseAfter': 0.0}]

    # Avoid tiny fragments such as "نعم،" being generated as separate unstable voices.
    merged: List[str] = []
    pending = ''
    for part in parts:
        candidate = clean_text((pending + ' ' + part).strip()) if pending else part
        if len(candidate) < min_chars:
            pending = candidate
            continue
        merged.append(clean_tts_text(candidate))
        pending = ''
    if pending:
        if merged:
            merged[-1] = clean_tts_text(merged[-1] + ' ' + pending)
        else:
            merged.append(clean_tts_text(pending))

    # If punctuation creates too many sub-chunks, group adjacent pieces to protect voice stability.
    while len(merged) > max_parts:
        new_parts: List[str] = []
        i = 0
        while i < len(merged):
            if i + 1 < len(merged):
                new_parts.append(clean_tts_text(merged[i] + ' ' + merged[i + 1]))
                i += 2
            else:
                new_parts.append(merged[i])
                i += 1
        merged = new_parts

    return [{'text': part, 'pauseAfter': punctuation_pause_seconds(part)} for part in merged if clean_text(part)]


def apply_punctuation_pauses_to_chunks(chunks: List[Dict[str, Any]], field: str = 'ttsText') -> List[Dict[str, Any]]:
    """Turn punctuation marks into explicit timeline gaps between TTS sub-chunks."""
    if str(os.environ.get('OCD_TTS_PUNCT_PAUSES', '1')).lower() not in ('1', 'true', 'yes', 'on'):
        return chunks

    pause_ratio_cap = float(os.environ.get('OCD_TTS_PAUSE_MAX_RATIO', '0.32'))
    output: List[Dict[str, Any]] = []

    for chunk in chunks:
        text = clean_tts_text(chunk.get(field) or chunk.get('translatedText') or chunk.get('text') or '')
        pieces = split_text_by_pause_punctuation(text)
        if len(pieces) <= 1:
            c = dict(chunk)
            c[field] = text
            c['pauseAfter'] = 0.0
            output.append(c)
            continue

        start = float(chunk.get('start') or 0.0)
        end = float(chunk.get('end') or start + 1.0)
        total_duration = max(0.75, end - start)
        pauses = [max(0.0, float(piece.get('pauseAfter') or 0.0)) for piece in pieces]
        # Never insert a pause after the final piece inside the original chunk.
        if pauses:
            pauses[-1] = 0.0
        total_pause = sum(pauses)
        max_pause_budget = max(0.0, total_duration * pause_ratio_cap)
        if total_pause > max_pause_budget and total_pause > 0:
            scale = max_pause_budget / total_pause
            pauses = [p * scale for p in pauses]
            total_pause = sum(pauses)

        speech_budget = max(0.45 * len(pieces), total_duration - total_pause)
        weights = [max(1, len(piece['text'])) for piece in pieces]
        weight_sum = max(1, sum(weights))
        pos = start
        for idx, piece in enumerate(pieces):
            speech_dur = speech_budget * (weights[idx] / weight_sum)
            # Keep each speech piece long enough for intelligibility.
            speech_dur = max(0.55, speech_dur)
            c = dict(chunk)
            c['start'] = pos
            c['end'] = min(end, pos + speech_dur) if idx == len(pieces) - 1 else pos + speech_dur
            c[field] = clean_tts_text(piece['text'])
            c['punctuationPauseAfter'] = round(pauses[idx], 3)
            c['splitForPunctuationPause'] = True
            output.append(c)
            pos = c['end'] + pauses[idx]

    # Ensure starts are monotonic and add indices.
    output.sort(key=lambda x: float(x.get('start') or 0.0))
    for idx, c in enumerate(output, 1):
        c['ttsIndex'] = idx
    return output


def google_translate_text(text: str, target_lang: str, source_lang: str = 'auto') -> str:
    text = clean_text(text)
    target = lang_short(target_lang, 'ar')
    source = lang_short(source_lang, 'auto')
    if not text or target == source:
        return text
    # Fast mode: unofficial Google Translate endpoint. Quick, but not guaranteed.
    params = {
        'client': 'gtx',
        'sl': source if source != 'auto' else 'auto',
        'tl': target,
        'dt': 't',
        'q': text,
    }
    r = requests.get('https://translate.googleapis.com/translate_a/single', params=params, timeout=45)
    r.raise_for_status()
    data = r.json()
    translated = ''.join(part[0] for part in data[0] if part and part[0])
    return clean_text(translated) or text


def nllb_code_for(lang: str, default: str = 'eng_Latn') -> str:
    key = lang_short(lang, 'auto').lower()
    if key == 'auto':
        return default
    return NLLB_LANG_MAP.get(key) or NLLB_LANG_MAP.get(key.split('-')[0]) or default


def get_nllb_model():
    """Lazy-load NLLB-200 only when Quality/Pro translation is requested."""
    global _NLLB_TOKENIZER, _NLLB_MODEL, _NLLB_DEVICE, _NLLB_MODEL_ID
    import torch
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

    model_id = os.environ.get('OCD_NLLB_MODEL', 'facebook/nllb-200-distilled-600M')
    if _NLLB_MODEL is not None and _NLLB_MODEL_ID == model_id:
        return _NLLB_TOKENIZER, _NLLB_MODEL, _NLLB_DEVICE

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    _NLLB_TOKENIZER = AutoTokenizer.from_pretrained(model_id)
    dtype = torch.float16 if device == 'cuda' and str(os.environ.get('OCD_NLLB_DTYPE', 'float16')).lower() in ('fp16','float16') else torch.float32
    _NLLB_MODEL = AutoModelForSeq2SeqLM.from_pretrained(model_id, torch_dtype=dtype).to(device)
    _NLLB_MODEL.eval()
    _NLLB_DEVICE = device
    _NLLB_MODEL_ID = model_id
    return _NLLB_TOKENIZER, _NLLB_MODEL, _NLLB_DEVICE


def nllb_translate_text(text: str, target_lang: str, source_lang: str = 'auto') -> str:
    text = clean_text(text)
    if not text:
        return text
    target_short = lang_short(target_lang, 'ar')
    source_short = lang_short(source_lang, 'auto')
    if source_short != 'auto' and source_short == target_short:
        return text

    import torch
    tokenizer, model, device = get_nllb_model()
    src_code = nllb_code_for(source_short, 'eng_Latn')
    tgt_code = nllb_code_for(target_short, 'arb_Arab')

    try:
        tokenizer.src_lang = src_code
    except Exception:
        pass

    inputs = tokenizer(text, return_tensors='pt', truncation=True, max_length=512).to(device)
    forced_bos_token_id = tokenizer.convert_tokens_to_ids(tgt_code)
    with torch.no_grad():
        generated = model.generate(
            **inputs,
            forced_bos_token_id=forced_bos_token_id,
            max_length=512,
            num_beams=int(os.environ.get('OCD_NLLB_BEAMS', '4')),
        )
    translated = tokenizer.batch_decode(generated, skip_special_tokens=True)[0]
    return clean_text(translated) or text


def translate_text(text: str, target_lang: str, source_lang: str = 'auto', engine: str = 'google') -> str:
    engine = str(engine or 'google').lower().strip()
    if engine in ('nllb', 'nllb200', 'nllb-200'):
        return nllb_translate_text(text, target_lang, source_lang)
    return google_translate_text(text, target_lang, source_lang)


async def edge_tts_save(text: str, voice: str, out_path: Path):
    import edge_tts
    communicate = edge_tts.Communicate(text=text, voice=voice)
    await communicate.save(str(out_path))


def chatterbox_language_id_for(target_lang: str) -> str:
    """Chatterbox Multilingual language_id. Fallback to English for unsupported tags."""
    key = lang_short(target_lang, 'en').lower()
    mapping = {
        'ar': 'ar', 'da': 'da', 'de': 'de', 'el': 'el', 'en': 'en',
        'es': 'es', 'fi': 'fi', 'fr': 'fr', 'he': 'he', 'hi': 'hi',
        'it': 'it', 'ja': 'ja', 'ko': 'ko', 'ms': 'ms', 'nl': 'nl',
        'no': 'no', 'pl': 'pl', 'pt': 'pt', 'ru': 'ru', 'sv': 'sv',
        'sw': 'sw', 'tr': 'tr', 'zh': 'zh', 'zh-cn': 'zh', 'zh-tw': 'zh',
    }
    return mapping.get(key, mapping.get(key.split('-')[0], 'en'))


def find_chatterbox_ref_audio(profile: str) -> Optional[str]:
    """Find a reference audio file for Chatterbox voice cloning."""
    profile = str(profile or '').strip()
    if not profile or profile in CHATTERBOX_PROFILE_PRESETS and profile != 'ref-voice.wav':
        return None
    p = Path(profile)
    if p.is_absolute() and p.exists() and p.is_file():
        return str(p)
    search_dirs = [
        Path(os.environ.get('OCD_CHATTERBOX_REFS_DIR', str(ROOT / 'chatterbox_refs'))),
        ROOT / 'chatterbox_refs',
        ROOT / 'omnivoice_refs',
        ROOT,
    ]
    names = [profile]
    if not profile.lower().endswith(('.wav', '.mp3', '.m4a', '.flac', '.ogg')):
        names += [profile + '.wav', profile + '.mp3', profile + '.m4a']
    for d in search_dirs:
        try:
            if not d.exists():
                continue
            for name in names:
                cand = d / name
                if cand.exists() and cand.is_file():
                    return str(cand)
            for name in names:
                found = list(d.rglob(name))[:1]
                if found:
                    return str(found[0])
        except Exception:
            pass
    return None


def resolve_chatterbox_profile(requested: str) -> Dict[str, Any]:
    profile_name = str(requested or '').strip() or os.environ.get('OCD_CHATTERBOX_PROFILE', 'default')
    if not profile_name:
        profile_name = 'default'
    base = dict(CHATTERBOX_PROFILE_PRESETS.get(profile_name, CHATTERBOX_PROFILE_PRESETS['default']))
    base['profile'] = profile_name if profile_name in CHATTERBOX_PROFILE_PRESETS else 'default'
    ref_audio = find_chatterbox_ref_audio(profile_name)
    if ref_audio:
        base['ref_audio'] = ref_audio
        base['profile'] = profile_name
    elif profile_name == 'ref-voice.wav':
        # Safe fallback if the placeholder reference file has not been uploaded yet.
        base['profile'] = 'default'
        base['requestedRefMissing'] = profile_name
    else:
        base['ref_audio'] = None
    base['exaggeration'] = float(os.environ.get('OCD_CHATTERBOX_EXAGGERATION', base.get('exaggeration', 0.5)))
    base['cfg_weight'] = float(os.environ.get('OCD_CHATTERBOX_CFG_WEIGHT', base.get('cfg_weight', 0.5)))
    return base


def get_chatterbox_model():
    """Lazy-load Chatterbox Multilingual V3 once per runtime."""
    global _CHATTERBOX_MODEL, _CHATTERBOX_MODEL_ID
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    t3_model = os.environ.get('OCD_CHATTERBOX_T3_MODEL', 'v3')
    model_id = f'chatterbox-multilingual-{t3_model}'
    if _CHATTERBOX_MODEL is not None and _CHATTERBOX_MODEL_ID == model_id:
        return _CHATTERBOX_MODEL

    if torch.cuda.is_available():
        device = 'cuda'
    elif getattr(torch.backends, 'mps', None) is not None and torch.backends.mps.is_available():
        device = 'mps'
    else:
        device = 'cpu'
    try:
        _CHATTERBOX_MODEL = ChatterboxMultilingualTTS.from_pretrained(device=device, t3_model=t3_model)
    except TypeError:
        _CHATTERBOX_MODEL = ChatterboxMultilingualTTS.from_pretrained(device=device)
    _CHATTERBOX_MODEL_ID = model_id
    return _CHATTERBOX_MODEL


def save_audio_array(out_path: Path, audio, sr: int):
    import numpy as np
    import soundfile as sf
    try:
        import torch
        if isinstance(audio, torch.Tensor):
            audio = audio.detach().cpu().numpy()
    except Exception:
        pass
    arr = np.asarray(audio, dtype=np.float32)
    if arr.ndim == 0:
        arr = arr.reshape(1)
    if arr.ndim == 2 and arr.shape[0] <= 2 and arr.shape[1] > arr.shape[0]:
        arr = arr.T
    if arr.ndim > 2:
        arr = arr.reshape(-1)
    sf.write(str(out_path), arr, int(sr or 24000))


def chatterbox_tts_save(text: str, voice_profile: str, target_lang: str, out_path: Path) -> Dict[str, Any]:
    """Generate one chunk with Chatterbox Multilingual."""
    model = get_chatterbox_model()
    profile = resolve_chatterbox_profile(voice_profile)
    language_id = chatterbox_language_id_for(target_lang)
    gen_kwargs = {
        'language_id': language_id,
        'exaggeration': float(profile.get('exaggeration', 0.5)),
        'cfg_weight': float(profile.get('cfg_weight', 0.5)),
    }
    if profile.get('ref_audio'):
        gen_kwargs['audio_prompt_path'] = profile['ref_audio']
    clean = clean_text(text)
    try:
        audio = model.generate(clean, **gen_kwargs)
    except TypeError:
        # Compatibility with older releases: remove optional style controls, then reference audio if needed.
        fallback = dict(gen_kwargs)
        fallback.pop('exaggeration', None)
        fallback.pop('cfg_weight', None)
        try:
            audio = model.generate(clean, **fallback)
        except TypeError:
            fallback.pop('audio_prompt_path', None)
            audio = model.generate(clean, **fallback)
    sr = int(getattr(model, 'sr', None) or getattr(model, 'sampling_rate', None) or 24000)
    save_audio_array(out_path, audio, sr)
    profile['language_id'] = language_id
    return profile


def omnivoice_language_for(target_lang: str) -> Optional[str]:
    """OmniVoice language label. None lets the model auto-detect when unsure."""
    key = lang_short(target_lang, 'auto').lower()
    mapping = {
        'ar': 'Arabic', 'en': 'English', 'fr': 'French', 'es': 'Spanish',
        'de': 'German', 'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian',
        'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese', 'tr': 'Turkish',
        'hi': 'Hindi', 'ur': 'Urdu', 'fa': 'Persian', 'he': 'Hebrew',
        'id': 'Indonesian', 'ms': 'Malay', 'vi': 'Vietnamese', 'th': 'Thai',
    }
    return mapping.get(key)


def find_omnivoice_ref_audio(role: str) -> Optional[str]:
    """Find a reference wav/mp3/m4a for OmniVoice voice cloning."""
    role = str(role or '').strip()
    if not role or role.startswith('design-'):
        return None
    # Direct absolute path from env/UI.
    p = Path(role)
    if p.is_absolute() and p.exists():
        return str(p)
    search_dirs = [
        Path(os.environ.get('OCD_OMNIVOICE_REFS_DIR', str(ROOT / 'omnivoice_refs'))),
        ROOT / 'omnivoice_refs',
        ROOT / 'pyvideotrans',
        ROOT,
    ]
    names = [role]
    if not role.lower().endswith(('.wav', '.mp3', '.m4a', '.flac', '.ogg')):
        names += [role + '.wav', role + '.mp3', role + '.m4a']
    for d in search_dirs:
        try:
            if not d.exists():
                continue
            for name in names:
                cand = d / name
                if cand.exists() and cand.is_file():
                    return str(cand)
            # Recursive fallback for roles like nverguo.wav.
            for name in names:
                found = list(d.rglob(name))[:1]
                if found:
                    return str(found[0])
        except Exception:
            pass
    return None


def resolve_omnivoice_role(requested: str, auto_ref_audio: Optional[str] = None) -> Dict[str, Any]:
    """Return OmniVoice mode + role/instruct/ref_audio.

    When auto_ref_audio is provided, it wins over fixed samples/design voices. That gives
    each video/job its own cloned reference voice and prevents cross-video voice mixing.
    """
    auto_ref = str(auto_ref_audio or '').strip()
    if auto_ref and env_bool('OCD_OMNIVOICE_AUTO_CLONE', '1'):
        p = Path(auto_ref)
        if p.exists() and p.is_file():
            return {
                'mode': 'clone-auto-per-job',
                'role': 'auto-clone-from-video',
                'instruct': sanitize_omnivoice_instruct(os.environ.get('OCD_OMNIVOICE_INSTRUCT', '').strip()) if os.environ.get('OCD_OMNIVOICE_INSTRUCT', '').strip() else None,
                'ref_audio': str(p),
                'perJob': True,
            }

    role = str(requested or '').strip() or os.environ.get('OCD_OMNIVOICE_ROLE', 'design-male-deep-ar')
    role = role.strip() or 'design-male-deep-ar'

    if role in ('auto-clone-video', 'auto-clone-from-video', 'auto'):
        role = os.environ.get('OCD_OMNIVOICE_FALLBACK_DESIGN', 'design-male-deep-ar')

    if role in OMNIVOICE_DESIGN_PRESETS and role.startswith('design-'):
        return {'mode': 'design', 'role': role, 'instruct': sanitize_omnivoice_instruct(OMNIVOICE_DESIGN_PRESETS[role]), 'ref_audio': None}

    ref_audio = find_omnivoice_ref_audio(role)
    if ref_audio:
        return {'mode': 'clone', 'role': role, 'instruct': sanitize_omnivoice_instruct(os.environ.get('OCD_OMNIVOICE_INSTRUCT', '').strip()) if os.environ.get('OCD_OMNIVOICE_INSTRUCT', '').strip() else None, 'ref_audio': ref_audio}

    # Safe fallback: do not fail just because the old pyVideoTrans role wav is missing.
    fallback_role = os.environ.get('OCD_OMNIVOICE_FALLBACK_DESIGN', 'design-male-deep-ar')
    instruct = sanitize_omnivoice_instruct(OMNIVOICE_DESIGN_PRESETS.get(fallback_role, OMNIVOICE_DESIGN_PRESETS['design-male-deep-ar']))
    return {
        'mode': 'design-fallback',
        'role': fallback_role,
        'requestedRoleMissing': role,
        'instruct': instruct,
        'ref_audio': None,
    }


def get_omnivoice_model():
    """Lazy-load OmniVoice once per RunPod runtime."""
    global _OMNIVOICE_MODEL, _OMNIVOICE_MODEL_ID
    model_id = os.environ.get('OCD_OMNIVOICE_MODEL', 'k2-fsa/OmniVoice')
    if _OMNIVOICE_MODEL is not None and _OMNIVOICE_MODEL_ID == model_id:
        return _OMNIVOICE_MODEL

    import torch
    from omnivoice import OmniVoice

    use_cuda = torch.cuda.is_available()
    dtype_name = os.environ.get('OCD_OMNIVOICE_DTYPE', 'float16' if use_cuda else 'float32').lower()
    dtype = torch.float16 if dtype_name in ('fp16', 'float16') else (torch.bfloat16 if dtype_name in ('bf16', 'bfloat16') else torch.float32)
    device_map = 'cuda:0' if use_cuda else 'cpu'

    # load_asr=True lets OmniVoice transcribe ref_audio automatically when ref_text is omitted.
    try:
        _OMNIVOICE_MODEL = OmniVoice.from_pretrained(
            model_id,
            device_map=device_map,
            dtype=dtype,
            load_asr=True,
        )
    except TypeError:
        # Older builds may not expose load_asr in from_pretrained.
        _OMNIVOICE_MODEL = OmniVoice.from_pretrained(
            model_id,
            device_map=device_map,
            dtype=dtype,
        )
    _OMNIVOICE_MODEL_ID = model_id
    return _OMNIVOICE_MODEL


def omnivoice_tts_save(text: str, voice_role: str, target_lang: str, out_path: Path, target_duration: Optional[float] = None, auto_ref_audio: Optional[str] = None) -> Dict[str, Any]:
    """Generate one chunk with OmniVoice. Supports voice design and ref-audio cloning."""
    import numpy as np
    import soundfile as sf
    try:
        from omnivoice import OmniVoiceGenerationConfig
    except Exception:
        OmniVoiceGenerationConfig = None

    model = get_omnivoice_model()
    voice = resolve_omnivoice_role(voice_role, auto_ref_audio=auto_ref_audio)
    language = omnivoice_language_for(target_lang)

    gen_kwargs = {
        'text': clean_text(text),
    }
    if language:
        gen_kwargs['language'] = language

    # Lower steps = faster. Default changed to 12 because video dubbing needs speed.
    # Raise OCD_OMNIVOICE_STEPS to 24/32 only for offline high-quality renders.
    omni_steps = int(os.environ.get('OCD_OMNIVOICE_STEPS', '12'))
    omni_guidance = float(os.environ.get('OCD_OMNIVOICE_GUIDANCE', '2.0'))
    omni_speed = float(os.environ.get('OCD_OMNIVOICE_SPEED', '1.16'))
    omni_pos_temp = float(os.environ.get('OCD_OMNIVOICE_POSITION_TEMPERATURE', '0.0'))
    omni_class_temp = float(os.environ.get('OCD_OMNIVOICE_CLASS_TEMPERATURE', '0.0'))

    if OmniVoiceGenerationConfig is not None:
        try:
            gen_kwargs['generation_config'] = OmniVoiceGenerationConfig(
                num_step=omni_steps,
                guidance_scale=omni_guidance,
                speed=omni_speed,
                position_temperature=omni_pos_temp,
                class_temperature=omni_class_temp,
                denoise=str(os.environ.get('OCD_OMNIVOICE_DENOISE', '1')).lower() not in ('0', 'false', 'no', 'off'),
                preprocess_prompt=True,
                postprocess_output=True,
            )
        except Exception:
            try:
                gen_kwargs['generation_config'] = OmniVoiceGenerationConfig(
                    num_step=omni_steps,
                    guidance_scale=omni_guidance,
                    denoise=str(os.environ.get('OCD_OMNIVOICE_DENOISE', '1')).lower() not in ('0', 'false', 'no', 'off'),
                    preprocess_prompt=True,
                    postprocess_output=True,
                )
            except Exception:
                pass

    # Prefer not to force duration by default: it can make OmniVoice slow down and skip words.
    # Timeline sync is handled after generation with ffmpeg atempo.
    if target_duration and float(target_duration) > 0 and str(os.environ.get('OCD_OMNIVOICE_USE_DURATION', '0')).lower() in ('1', 'true', 'yes', 'on'):
        gen_kwargs['duration'] = float(target_duration)

    # Some OmniVoice versions accept speed directly on generate rather than in config.
    gen_kwargs['speed'] = omni_speed

    if voice.get('ref_audio'):
        # Create clone prompt once and reuse it for every chunk. This improves speed and
        # reduces color drift across separate TTS chunks.
        ref_text = os.environ.get('OCD_OMNIVOICE_REF_TEXT', '').strip() or None
        cache_key = (voice['ref_audio'], ref_text or '', voice.get('instruct') or '')
        prompt_cache = globals().setdefault('_OMNIVOICE_PROMPT_CACHE', {})
        if cache_key not in prompt_cache:
            prompt_cache[cache_key] = model.create_voice_clone_prompt(
                ref_audio=voice['ref_audio'],
                ref_text=ref_text,
            )
        gen_kwargs['voice_clone_prompt'] = prompt_cache[cache_key]
        if voice.get('instruct'):
            gen_kwargs['instruct'] = sanitize_omnivoice_instruct(voice['instruct'])
    else:
        gen_kwargs['instruct'] = sanitize_omnivoice_instruct(voice.get('instruct') or OMNIVOICE_DESIGN_PRESETS['design-male-deep-ar'])

    try:
        audio = model.generate(**gen_kwargs)
    except TypeError:
        # Compatibility fallback for older OmniVoice versions.
        fallback_kwargs = dict(gen_kwargs)
        fallback_kwargs.pop('duration', None)
        try:
            audio = model.generate(**fallback_kwargs)
        except TypeError:
            fallback_kwargs.pop('speed', None)
            try:
                audio = model.generate(**fallback_kwargs)
            except TypeError:
                fallback_kwargs.pop('generation_config', None)
                audio = model.generate(**fallback_kwargs)

    sr = int(getattr(model, 'sampling_rate', 24000) or 24000)
    arr = audio[0] if isinstance(audio, (list, tuple)) else audio
    arr = np.asarray(arr, dtype=np.float32).reshape(-1)
    sf.write(str(out_path), arr, sr)
    return voice


def convert_tts_to_wav(mp3_path: Path, wav_path: Path, target_duration: float, volume: float = 1.0):
    raw_duration = ffprobe_duration(mp3_path)
    filters = ['aresample=24000']
    try:
        volume = float(volume or 1.0)
    except Exception:
        volume = 1.0
    if abs(volume - 1.0) > 0.02:
        filters.append(f'volume={volume:.3f}')
    # If TTS is much longer than the original chunk, speed it up moderately.
    if target_duration and target_duration > 0.8 and raw_duration > target_duration * 1.12:
        speed = min(1.85, raw_duration / max(0.5, target_duration * 1.03))
        filters.append(atempo_filter(speed))
    run_cmd([
        'ffmpeg', '-y', '-i', str(mp3_path),
        '-vn', '-ac', '1', '-ar', '24000',
        '-af', ','.join(filters),
        '-c:a', 'pcm_s16le', str(wav_path)
    ], timeout=180)


def read_wav_mono(path: Path):
    import numpy as np
    with wave.open(str(path), 'rb') as w:
        channels = w.getnchannels()
        sr = w.getframerate()
        frames = w.getnframes()
        data = w.readframes(frames)
    arr = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        arr = arr.reshape(-1, channels).mean(axis=1)
    return sr, arr


def write_wav_mono(path: Path, sr: int, audio):
    import numpy as np
    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    if peak > 0.98:
        audio = audio / peak * 0.98
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype(np.int16)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def mix_chunks_to_timeline(chunks: List[Dict[str, Any]], wav_paths: List[Path], video_duration: float, out_wav: Path):
    import numpy as np
    sr = 24000
    total_samples = int((max(video_duration, max([c['end'] for c in chunks], default=0)) + 2.0) * sr)
    timeline = np.zeros(total_samples, dtype=np.float32)
    for c, wp in zip(chunks, wav_paths):
        if not wp.exists():
            continue
        wsr, arr = read_wav_mono(wp)
        if wsr != sr:
            raise RuntimeError(f'Unexpected sample rate {wsr} for {wp}')
        start_i = max(0, int(float(c['start']) * sr))
        end_i = min(total_samples, start_i + len(arr))
        if end_i > start_i:
            timeline[start_i:end_i] += arr[:end_i - start_i]
    write_wav_mono(out_wav, sr, timeline)



def _audio_file_to_b64(path: str) -> str:
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')



_FISH_SERVER_PROCESS = None
_FISH_SERVER_LOCK = threading.Lock()


def _fish_health_url() -> str:
    url = os.environ.get('OCD_FISH_LOCAL_URL', 'http://127.0.0.1:8080/v1/tts').strip()
    if url.endswith('/v1/tts'):
        return url[:-len('/v1/tts')] + '/v1/health'
    return url.rstrip('/') + '/v1/health'


def is_fish_server_ready(timeout: float = 2.0) -> bool:
    try:
        import requests as _requests
        r = _requests.get(_fish_health_url(), timeout=timeout)
        return r.status_code < 500 and 'ok' in (r.text.lower() + str(r.status_code)) or r.status_code == 200
    except Exception:
        return False


def ensure_fish_local_server_ready() -> None:
    """Start/wait for the local Fish S2-Pro API server used by Pro mode.

    RunPod Serverless workers can cold-start with only the Python handler alive.
    This function prevents Pro from failing with Connection refused by starting
    /app/start_fish_s2_local_server.sh lazily if needed and waiting for /v1/health.
    """
    global _FISH_SERVER_PROCESS
    if is_fish_server_ready(timeout=2.0):
        return

    if not env_bool('OCD_AUTOSTART_FISH_ON_PRO', '1'):
        raise RuntimeError(
            'Fish S2-Pro local server is not reachable and OCD_AUTOSTART_FISH_ON_PRO=0. '
            'Start Fish local server inside the worker at http://127.0.0.1:8080/v1/tts.'
        )

    with _FISH_SERVER_LOCK:
        if is_fish_server_ready(timeout=2.0):
            return
        script = os.environ.get('OCD_FISH_START_SCRIPT', '/app/start_fish_s2_local_server.sh')
        log_path = os.environ.get('OCD_FISH_LOG_PATH', '/tmp/ocd_fish_server.log')
        if _FISH_SERVER_PROCESS is None or getattr(_FISH_SERVER_PROCESS, 'poll', lambda: 0)() is not None:
            print(f'[OCD][Fish] Starting local server via {script}; log={log_path}')
            log_f = open(log_path, 'ab', buffering=0)
            _FISH_SERVER_PROCESS = subprocess.Popen(['bash', script], stdout=log_f, stderr=subprocess.STDOUT)

    timeout_sec = int(os.environ.get('OCD_FISH_STARTUP_TIMEOUT_SEC', '900'))
    start = time.time()
    while time.time() - start < timeout_sec:
        if is_fish_server_ready(timeout=5.0):
            print('[OCD][Fish] Local server is ready')
            return
        time.sleep(5)

    tail = ''
    try:
        log_path = os.environ.get('OCD_FISH_LOG_PATH', '/tmp/ocd_fish_server.log')
        if Path(log_path).exists():
            tail = Path(log_path).read_text(errors='ignore')[-5000:]
    except Exception:
        pass
    raise RuntimeError(
        'Fish S2-Pro local server did not become ready. '
        'Check /tmp/ocd_fish_server.log inside the RunPod worker. Last log tail:\n' + tail
    )

def fish_tts_save(text: str, out_path: Path, target_lang: str = 'auto', ref_audio: Optional[str] = None, ref_text: str = '') -> Dict[str, Any]:
    """Generate speech using a LOCAL Fish Audio S2-Pro server only.

    This RunPod Serverless build intentionally does NOT call Fish Audio cloud/API.
    Start a Fish/SGLang/vLLM-compatible local HTTP server inside the same container
    and expose it at OCD_FISH_LOCAL_URL, default http://127.0.0.1:8080/v1/tts.
    """
    import requests as _requests
    out_path = Path(out_path)
    model_name = str(os.environ.get('OCD_FISH_MODEL', 's2-pro')).strip() or 's2-pro'
    local_url = os.environ.get('OCD_FISH_LOCAL_URL', 'http://127.0.0.1:8080/v1/tts').strip()
    timeout = int(os.environ.get('OCD_FISH_TTS_TIMEOUT', '900'))
    # Fish local server selects the base model at startup from --llama-checkpoint-path.
    # Official local API request only needs text and optional reference audio/text.
    payload: Dict[str, Any] = {'text': text}
    if ref_audio and Path(ref_audio).exists():
        payload['reference_audio'] = _audio_file_to_b64(str(ref_audio))
        if ref_text:
            payload['reference_text'] = ref_text

    ensure_fish_local_server_ready()
    try:
        resp = _requests.post(local_url, json=payload, timeout=timeout)
    except Exception as e:
        raise RuntimeError(
            'Fish S2-Pro local server is not reachable. This build does not use Fish API. '
            f'Start local Fish server inside the worker at {local_url}. Original error: {repr(e)}'
        )

    content_type = (resp.headers.get('content-type') or '').lower()
    data = resp.content or b''
    if resp.status_code >= 400:
        txt = data[:1400].decode('utf-8', errors='ignore')
        raise RuntimeError(f'Fish S2-Pro local server failed HTTP {resp.status_code}: {txt}')

    # Compatible with both raw-audio responses and JSON/base64 responses.
    if 'application/json' in content_type:
        js = resp.json()
        b64 = js.get('audio') or js.get('audio_base64') or js.get('audioBase64') or js.get('data')
        if not b64:
            raise RuntimeError(f'Fish local server returned JSON without audio: {str(js)[:1000]}')
        data = base64.b64decode(b64)
    if len(data) < 512:
        raise RuntimeError(f'Fish local server returned tiny audio: {len(data)} bytes')
    out_path.write_bytes(data)
    return {'mode': 'local-http-only', 'model': model_name, 'bytes': len(data), 'refAudio': bool(ref_audio), 'url': local_url}

def process_job(job_id: str, req: DubRequest):
    job = jobs[job_id]
    job_dir = JOBS_DIR / job_id
    tts_dir = job_dir / 'tts'
    job_dir.mkdir(parents=True, exist_ok=True)
    tts_dir.mkdir(parents=True, exist_ok=True)
    start_ts = time.time()
    model = normalize_model(req)
    omnivoice_auto_ref_audio: Optional[Path] = None

    try:
        # Model behavior in this custom backend:
        # Fast    = Google Translate + Edge TTS   + original OpenAI Whisper large
        # Quality = NLLB-200         + OmniVoice  + faster-whisper medium
        # Pro     = NLLB-200         + Fish Audio S2-Pro + Whisper turbo
        if model == 'pro':
            req.whisperModel = os.environ.get('OCD_PRO_WHISPER_MODEL', 'turbo')
        elif model == 'quality':
            req.whisperModel = os.environ.get('OCD_QUALITY_WHISPER_MODEL', 'medium')
        else:
            req.whisperModel = os.environ.get('OCD_FAST_WHISPER_MODEL', req.whisperModel or 'large')

        job['modelName'] = model
        job['whisperModel'] = req.whisperModel

        job.update(status='downloading', progress=5, message=f'Downloading audio with yt-dlp · model={model} · whisper={req.whisperModel}')
        referer = sanitize_header_value(req.referer or req.pageUrl or req.url, 3000)
        cookie = sanitize_header_value(req.cookieString, 20000)
        input_path = download_input_media_with_ytdlp(
            req.url,
            job_dir=job_dir,
            start_ts=start_ts,
            referer=referer,
            raw_cookie=cookie,
        )

        video_duration = ffprobe_duration(input_path)
        job.update(status='extracting', progress=14, message=f'Extracting audio with ffmpeg from {input_path.name}')
        audio_wav = job_dir / 'audio_16k.wav'
        run_cmd([
            'ffmpeg', '-y', '-i', str(input_path),
            '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', str(audio_wav)
        ], timeout=600)

        selected_whisper = req.whisperModel or ('turbo' if model == 'pro' else 'medium' if model == 'quality' else 'large')
        req.whisperModel = selected_whisper
        job['whisperModel'] = selected_whisper
        device = 'cuda' if req.cuda else 'cpu'
        asr_lang = lang_short(req.sourceLanguage, 'auto')
        raw_segments = []

        if model == 'fast':
            # Fast now uses the original OpenAI Whisper package, not faster-whisper.
            # This is more accurate, but slower and heavier. Use T4/A10+ GPU for large.
            selected_whisper = os.environ.get('OCD_FAST_WHISPER_MODEL', selected_whisper or 'large')
            selected_whisper = str(selected_whisper or 'large').strip()
            req.whisperModel = selected_whisper
            job['whisperModel'] = selected_whisper
            job['asrEngine'] = 'openai-whisper'
            job.update(status='asr', progress=22, message=f'Transcribing with original OpenAI Whisper ({selected_whisper})')
            try:
                import whisper as openai_whisper
            except Exception as ie:
                raise RuntimeError('openai-whisper is not installed. Run: python -m pip install -U openai-whisper') from ie
            global _OPENAI_WHISPER_CACHE
            cache_key = (selected_whisper, device)
            if cache_key not in _OPENAI_WHISPER_CACHE:
                _OPENAI_WHISPER_CACHE[cache_key] = openai_whisper.load_model(selected_whisper, device=device)
            model_obj = _OPENAI_WHISPER_CACHE[cache_key]
            transcribe_kwargs = {
                'language': None if asr_lang == 'auto' else asr_lang,
                'verbose': False,
                'fp16': bool(device == 'cuda'),
                'condition_on_previous_text': False,
                'temperature': 0,
            }
            result = model_obj.transcribe(str(audio_wav), **transcribe_kwargs)
            for seg in result.get('segments', []) or []:
                raw_segments.append({
                    'start': float(seg.get('start', 0.0)),
                    'end': float(seg.get('end', 0.0)),
                    'text': clean_text(seg.get('text', '')),
                })
        else:
            job['asrEngine'] = 'faster-whisper'
            job.update(status='asr', progress=22, message=f'Transcribing with faster-whisper ({selected_whisper})')
            from faster_whisper import WhisperModel
            compute_type = os.environ.get('OCD_WHISPER_COMPUTE_TYPE') or ('float16' if req.cuda else 'int8')
            global _FASTER_WHISPER_CACHE
            cache_key = (selected_whisper, device, compute_type)
            if cache_key not in _FASTER_WHISPER_CACHE:
                print(f'[OCD] FASTER-WHISPER CACHE: loading {selected_whisper} once on {device} ({compute_type})')
                _FASTER_WHISPER_CACHE[cache_key] = WhisperModel(selected_whisper, device=device, compute_type=compute_type)
            else:
                print(f'[OCD] FASTER-WHISPER CACHE: using cached {selected_whisper} on {device} ({compute_type})')
            model_obj = _FASTER_WHISPER_CACHE[cache_key]
            segments_iter, info = model_obj.transcribe(
                str(audio_wav),
                language=None if asr_lang == 'auto' else asr_lang,
                vad_filter=True,
                beam_size=5,
            )
            for s in segments_iter:
                raw_segments.append({'start': float(s.start), 'end': float(s.end), 'text': clean_text(s.text)})
        if not raw_segments:
            raise RuntimeError('Whisper did not return any speech segments')
        (job_dir / 'asr_segments.json').write_text(json.dumps(raw_segments, ensure_ascii=False, indent=2), encoding='utf-8')

        if ((model == 'quality' and env_bool('OCD_OMNIVOICE_AUTO_CLONE', '1')) or (model == 'pro' and env_bool('OCD_FISH_AUTO_CLONE', '1'))):
            clone_for = 'Fish S2-Pro' if model == 'pro' else 'OmniVoice'
            job.update(status='voice-clone', progress=31, message=f'Preparing per-job {clone_for} voice sample from this video')
            omnivoice_auto_ref_audio = create_omnivoice_auto_ref_audio(audio_wav, raw_segments, job_dir, job)
            if omnivoice_auto_ref_audio:
                job['voiceClone'] = 'auto-per-job-from-current-video'
            else:
                job['voiceClone'] = 'fallback-design-or-selected-role'

        job.update(status='chunking', progress=35, message='Smart chunking subtitles for fewer TTS calls')
        chunks = smart_chunk_segments(raw_segments, model)
        write_srt(job_dir / 'source_chunks_before_punctuation.srt', chunks, 'text')
        job.update(status='punctuation', progress=38, message='Restoring punctuation before translation/TTS')
        chunks = restore_source_punctuation_for_chunks(chunks, req.sourceLanguage, job)
        write_srt(job_dir / 'source_chunks.srt', chunks, 'text')
        (job_dir / 'punctuated_source_chunks.json').write_text(json.dumps(chunks, ensure_ascii=False, indent=2), encoding='utf-8')
        job['message'] = f'Smart chunking + punctuation: {len(raw_segments)} ASR segments -> {len(chunks)} TTS chunks'
        job['rawSegments'] = len(raw_segments)
        job['ttsChunks'] = len(chunks)

        translation_engine = str(req.translationEngine or ('nllb200' if model in ('quality', 'pro') else 'google')).lower().strip()
        job['translationEngine'] = translation_engine
        job.update(status='translating', progress=42, message=f'Translating {len(chunks)} chunks · {translation_engine}')
        target = lang_short(req.targetLanguage, 'ar')
        source = lang_short(req.sourceLanguage, 'auto')
        translated_chunks = []
        for i, c in enumerate(chunks, 1):
            try:
                tr = translate_text(c['text'], target, source, translation_engine)
            except Exception as te:
                tr = c['text']
                c['translationWarning'] = str(te)
            c = dict(c)
            c['translatedText'] = tr
            translated_chunks.append(c)
            if i % 3 == 0 or i == len(chunks):
                job.update(progress=min(58, 42 + int(i / max(1, len(chunks)) * 16)), message=f'Translating chunks {i}/{len(chunks)}')
        chunks = translated_chunks

        # Optional Arabic tashkeel with CATT. This improves pronunciation for Arabic TTS.
        # It must run after translation and before TTS.
        if should_use_catt(target):
            job.update(status='tashkeel', progress=59, message='Adding Arabic diacritics with CATT before TTS')
            original_tts_texts = [c.get('translatedText') or c.get('text') or '' for c in chunks]
            tashkeel_texts = apply_catt_tashkeel_batch(original_tts_texts)
            for c, shaped in zip(chunks, tashkeel_texts):
                c['ttsText'] = clean_tts_text(shaped)
            write_srt(job_dir / 'tashkeel_chunks.srt', chunks, 'ttsText')
            job['tashkeel'] = 'catt'
            job['tashkeelModel'] = os.environ.get('OCD_CATT_MODEL', 'eo')
        else:
            for c in chunks:
                c['ttsText'] = clean_tts_text(c.get('translatedText') or c.get('text') or '')
            job['tashkeel'] = 'disabled-or-not-arabic'

        if model in ('quality', 'pro'):
            before_refine = len(chunks)
            chunks = refine_omnivoice_tts_chunks(chunks)
            job['ttsChunksBeforeRefine'] = before_refine
            job['ttsChunksAfterRefine'] = len(chunks)
            write_srt(job_dir / 'omnivoice_refined_chunks.srt', chunks, 'ttsText')

        before_pause_chunks = len(chunks)
        chunks = apply_punctuation_pauses_to_chunks(chunks, 'ttsText')
        job['ttsChunksBeforePunctuationPause'] = before_pause_chunks
        job['ttsChunksAfterPunctuationPause'] = len(chunks)
        job['punctuationPauses'] = str(os.environ.get('OCD_TTS_PUNCT_PAUSES', '1'))
        write_srt(job_dir / 'tts_punctuation_pause_chunks.srt', chunks, 'ttsText')
        (job_dir / 'tts_punctuation_pause_chunks.json').write_text(json.dumps(chunks, ensure_ascii=False, indent=2), encoding='utf-8')

        (job_dir / 'translated_chunks.json').write_text(json.dumps(chunks, ensure_ascii=False, indent=2), encoding='utf-8')
        write_srt(job_dir / 'translated_chunks.srt', chunks, 'translatedText')

        if model == 'quality':
            tts_backend = 'omnivoice'
            voice = str(req.voiceName or os.environ.get('OCD_OMNIVOICE_ROLE', 'auto-clone-video')).strip() or 'auto-clone-video'
            job['requestedVoiceName'] = voice
            job['voiceName'] = 'auto-clone-from-video' if omnivoice_auto_ref_audio else voice
            job['ttsBackend'] = 'omnivoice'
            voice_label = 'Auto Clone from this video' if omnivoice_auto_ref_audio else voice
            job.update(status='tts', progress=60, message=f'Generating OmniVoice Quality: {len(chunks)} chunks · {voice_label}')
        elif model == 'pro':
            tts_backend = 'fish-speech-s2-pro'
            voice = str(req.voiceName or os.environ.get('OCD_FISH_VOICE', 'auto-clone-video')).strip() or 'auto-clone-video'
            job['requestedVoiceName'] = voice
            job['voiceName'] = 'fish-auto-clone-from-video' if omnivoice_auto_ref_audio else voice
            job['ttsBackend'] = 'fish-speech-s2-pro'
            job['fishModel'] = os.environ.get('OCD_FISH_MODEL', 's2-pro')
            voice_label = 'Auto Clone from this video' if omnivoice_auto_ref_audio else voice
            job.update(status='tts', progress=60, message=f'Generating Fish S2-Pro: {len(chunks)} chunks · {voice_label}')
        else:
            tts_backend = 'edge-tts'
            voice = edge_voice_for(target, req.voiceName)
            job['voiceName'] = voice
            job['ttsBackend'] = 'edge-tts'
            job.update(status='tts', progress=60, message=f'Generating Edge TTS: {len(chunks)} chunks · {voice}')

        wav_paths: List[Path] = []
        resolved_omnivoice_role = None
        for i, c in enumerate(chunks, 1):
            wav_path = tts_dir / f'chunk_{i:04d}.wav'
            text = clean_tts_text(c.get('ttsText') or c.get('translatedText') or c.get('text') or '')
            if model == 'quality':
                raw_path = tts_dir / f'chunk_{i:04d}_omnivoice_raw.wav'
                resolved_omnivoice_role = omnivoice_tts_save(text, voice, target, raw_path, float(c['end']) - float(c['start']), auto_ref_audio=str(omnivoice_auto_ref_audio) if omnivoice_auto_ref_audio else None)
                # Quality/OmniVoice gets a small volume lift but less than clipping level.
                convert_tts_to_wav(raw_path, wav_path, float(c['end']) - float(c['start']), volume=float(os.environ.get('OCD_OMNIVOICE_VOLUME', '1.06')))
            elif model == 'pro':
                raw_path = tts_dir / f'chunk_{i:04d}_fish_raw.wav'
                fish_tts_save(text, raw_path, target_lang=target, ref_audio=str(omnivoice_auto_ref_audio) if omnivoice_auto_ref_audio else None, ref_text=job.get('autoCloneRefText', ''))
                convert_tts_to_wav(raw_path, wav_path, float(c['end']) - float(c['start']), volume=float(os.environ.get('OCD_FISH_VOLUME', '1.04')))
            else:
                mp3_path = tts_dir / f'chunk_{i:04d}.mp3'
                asyncio.run(edge_tts_save(text, voice, mp3_path))
                convert_tts_to_wav(mp3_path, wav_path, float(c['end']) - float(c['start']))
            wav_paths.append(wav_path)
            if i % 2 == 0 or i == len(chunks):
                job.update(progress=min(86, 60 + int(i / max(1, len(chunks)) * 26)), message=f'Generating {tts_backend} {i}/{len(chunks)}')
        if resolved_omnivoice_role:
            job['omnivoiceResolvedRole'] = resolved_omnivoice_role

        job.update(status='mixing', progress=88, message='Mixing dubbed audio on original timeline')
        dubbed_wav = job_dir / 'dubbed_timeline.wav'
        mix_chunks_to_timeline(chunks, wav_paths, video_duration, dubbed_wav)

        job.update(status='finalizing', progress=94, message='Encoding dubbed audio for in-page sync')
        # MP3 is the safest format for Chrome audio overlays through RunPod tunnels.
        # Some browsers open M4A links in a tab but reject them in an <audio> element depending on
        # MIME/range/CORS behavior. MP3 avoids most of these failures.
        final_name = f'{job_id}_dubbed_audio.mp3'
        final_path = OUTPUTS_DIR / final_name
        run_cmd([
            'ffmpeg', '-y', '-i', str(dubbed_wav),
            '-vn', '-codec:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100',
            str(final_path)
        ], timeout=600)

        # Make sure the filesystem has flushed the output before the job is marked done.
        for _ in range(20):
            try:
                if final_path.exists() and final_path.stat().st_size > 1024:
                    break
            except FileNotFoundError:
                pass
            time.sleep(0.25)

        base = public_base_url()
        serverless_base64 = env_bool('OCD_SERVERLESS_OUTPUT_BASE64', '0')
        if base:
            audio_url = f'{base}/outputs/{final_name}'
        elif serverless_base64:
            # RunPod Serverless does not expose /outputs. The handler reads outputFile and returns base64.
            audio_url = ''
        else:
            # Do not return a relative /outputs URL to the YouTube page.
            # A relative URL can be interpreted by YouTube as youtube.com/outputs/...
            raise RuntimeError('PUBLIC_BASE_URL is empty. Set PUBLIC_BASE_URL for HTTP mode or OCD_SERVERLESS_OUTPUT_BASE64=1 for RunPod Serverless.')
        job.update(
            status='done', progress=100, message='Done · audio overlay ready',
            audioUrl=audio_url,
            outputUrl=audio_url,
            outputKind='audio',
            outputFile=str(final_path),
            sourceSrt=str(job_dir / 'source_chunks.srt'),
            translatedSrt=str(job_dir / 'translated_chunks.srt'),
            chunksFile=str(job_dir / 'translated_chunks.json'),
            service='custom-backend',
        )

        # Per-job cleanup: removes omnivoice_auto_ref.wav and intermediate files after the
        # browser has had time to fetch the final MP3. The final output has a separate TTL.
        temp_ttl = float(os.environ.get('OCD_JOB_TEMP_TTL_SEC', '600'))
        if env_bool('OCD_DELETE_JOB_TEMP_AFTER_DONE', '1'):
            delete_path_later(job_dir, temp_ttl, label=f'job temp {job_id}')
        if omnivoice_auto_ref_audio:
            clear_omnivoice_prompt_cache_later(str(omnivoice_auto_ref_audio), temp_ttl)
        if env_bool('OCD_DELETE_OUTPUT_AFTER_TTL', '1'):
            delete_path_later(final_path, float(os.environ.get('OCD_OUTPUT_TTL_SEC', '21600')), label=f'output {job_id}')
    except Exception as e:
        job.update(status='error', progress=100, message=str(e), error=str(e), service='custom-backend')
        error_ttl = float(os.environ.get('OCD_JOB_ERROR_TEMP_TTL_SEC', '1800'))
        if env_bool('OCD_DELETE_JOB_TEMP_AFTER_ERROR', '1'):
            delete_path_later(job_dir, error_ttl, label=f'failed job temp {job_id}')
        if omnivoice_auto_ref_audio:
            clear_omnivoice_prompt_cache_later(str(omnivoice_auto_ref_audio), error_ttl)


@app.get('/health')
def health():
    return {
        'ok': True,
        'service': 'one-click-dub-custom-backend',
        'pipeline': ['yt-dlp-audio-first+remote-ejs', 'ffmpeg', 'OpenAI Whisper large for Fast + faster-whisper medium for Quality', 'smart-chunking', 'punctuation-restoration', 'google/nllb-200 translation', 'catt-tashkeel-optional', 'edge-tts/omnivoice/fish-speech-s2-pro', 'per-job-auto-voice-clone', 'audio-overlay'],
        'publicBaseUrl': public_base_url(),
        'outputsDir': str(OUTPUTS_DIR),
        'fixVersion': OCD_SERVER_FIX_VERSION,
        'ytdlpFix': {
            'enabled': True,
            'format': os.environ.get('OCD_YTDLP_FORMAT', 'ba[ext=m4a]/bestaudio[ext=m4a]/bestaudio/best'),
            'remoteEjs': os.environ.get('OCD_YTDLP_REMOTE_EJS', '1'),
            'remoteComponents': os.environ.get('OCD_YTDLP_REMOTE_COMPONENTS', 'ejs:github'),
            'requestCookiesAsHeader': False,
            'requestCookiesFileEnabled': os.environ.get('OCD_YTDLP_USE_REQUEST_COOKIES', '0'),
            'outputAudio': 'mp3',
        },
        'punctuation': {'enabled': os.environ.get('OCD_USE_PUNCTUATION', '1'), 'engine': 'deepmultilingualpunctuation', 'mode': 'all-languages-including-arabic'},
        'models': {
            'fast': {'translation': 'google', 'asrEngine': 'openai-whisper', 'whisper': os.environ.get('OCD_FAST_WHISPER_MODEL', 'large'), 'punctuation': 'deepmultilingualpunctuation', 'tts': 'edge-tts'},
            'quality': {'translation': 'nllb200', 'whisper': 'medium', 'tts': 'omnivoice', 'autoClonePerJob': os.environ.get('OCD_OMNIVOICE_AUTO_CLONE', '1'), 'defaultModel': os.environ.get('OCD_OMNIVOICE_MODEL', 'k2-fsa/OmniVoice'), 'stabilityDefaults': {'steps': os.environ.get('OCD_OMNIVOICE_STEPS', '12'), 'speed': os.environ.get('OCD_OMNIVOICE_SPEED', '1.16'), 'maxChars': os.environ.get('OCD_OMNIVOICE_TTS_MAX_CHARS', '190')}},
            'pro': {'translation': 'nllb200', 'whisper': os.environ.get('OCD_PRO_WHISPER_MODEL', 'turbo'), 'tts': 'fish-speech-s2-pro', 'status': 'enabled-local-only', 'model': os.environ.get('OCD_FISH_MODEL', 's2-pro'), 'mode': 'local-http-only-autostart', 'localUrl': os.environ.get('OCD_FISH_LOCAL_URL', 'http://127.0.0.1:8080/v1/tts'), 'healthUrl': _fish_health_url(), 'ready': is_fish_server_ready(timeout=0.5)},
        },
    }


@app.post('/api/custom/dub')
def start_custom_dub(req: DubRequest, background_tasks: BackgroundTasks):
    if not req.url.startswith('https://'):
        return {'ok': False, 'error': 'Only https video URLs are allowed'}
    job_id = uuid.uuid4().hex[:12]
    jobs[job_id] = {
        'ok': True,
        'jobId': job_id,
        'status': 'queued',
        'progress': 0,
        'message': 'Queued',
        'createdAt': time.time(),
        'service': 'custom-backend',
    }
    background_tasks.add_task(process_job, job_id, req)
    return {'ok': True, 'jobId': job_id, 'service': 'custom-backend'}


@app.get('/api/custom/jobs/{job_id}')
def custom_job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        return {'ok': False, 'error': 'job not found'}
    return job
