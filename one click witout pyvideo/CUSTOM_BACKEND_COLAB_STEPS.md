# تشغيل One Click Dub على Colab — Fast + Quality الجديد

الترتيب الحالي:

```text
Fast    = Google Translate + Edge TTS / Whisper small
Quality = NLLB-200 + OmniVoice / Whisper medium
Pro     = NLLB-200 + Fish-Speech S1-mini / Whisper turbo — SOON فقط
```

## 1) تثبيت الأساسيات

```python
!apt-get update -y
!apt-get install -y ffmpeg git curl wget unzip
!python -m pip install -U pip wheel setuptools packaging

!python -m pip install -U --no-cache-dir \
  fastapi "uvicorn[standard]" python-multipart pydantic \
  requests yt-dlp edge-tts faster-whisper \
  numpy soundfile scipy pydub \
  transformers sentencepiece accelerate huggingface_hub \
  catt-tashkeel
```

## 2) تثبيت OmniVoice للـ Quality

```python
!python -m pip install -U --no-cache-dir omnivoice || \
python -m pip install -U --no-cache-dir git+https://github.com/k2-fsa/OmniVoice.git
```

## 3) لا تثبت Fish-Speech الآن

Pro حالياً مظهر فقط داخل الإضافة، لذلك لا تحتاج تثبيت Fish-Speech أو Whisper turbo الآن.

## 4) تشغيل الخادم

ارفع `colab_custom_dub_server.py` إلى `/content/` ثم شغل:

```python
!python -m py_compile /content/colab_custom_dub_server.py

!pkill -f "uvicorn colab_custom_dub_server" || true
!nohup python -m uvicorn colab_custom_dub_server:app \
  --host 0.0.0.0 \
  --port 8000 \
  > /content/uvicorn.log 2>&1 &
```

ثم شغل Cloudflare Tunnel وخذ الرابط العام، وبعده أعد تشغيل الخادم مع:

```python
import os, subprocess, time, requests

env = os.environ.copy()
env["PUBLIC_BASE_URL"] = PUBLIC_URL

env["OCD_WHISPER_COMPUTE_TYPE"] = "float16"
env["OCD_USE_CATT_TASHKEEL"] = "1"
env["OCD_CATT_MODEL"] = "eo"

env["OCD_NLLB_MODEL"] = "facebook/nllb-200-distilled-600M"
env["OCD_NLLB_DTYPE"] = "float16"
env["OCD_NLLB_BEAMS"] = "2"

env["OCD_OMNIVOICE_MODEL"] = "k2-fsa/OmniVoice"
env["OCD_OMNIVOICE_ROLE"] = "design-male-deep-ar"
env["OCD_OMNIVOICE_DTYPE"] = "float16"
env["OCD_OMNIVOICE_STEPS"] = "24"
env["OCD_OMNIVOICE_GUIDANCE"] = "2.0"

subprocess.Popen(
    ["python", "-m", "uvicorn", "colab_custom_dub_server:app", "--host", "0.0.0.0", "--port", "8000"],
    cwd="/content",
    env=env,
    stdout=open("/content/uvicorn.log", "w"),
    stderr=subprocess.STDOUT
)

time.sleep(5)
print(requests.get("http://127.0.0.1:8000/health", timeout=30).text)
print(requests.get(PUBLIC_URL + "/health", timeout=30).text)
```
