# إضافة 5 عينات صوتية إلى OmniVoice داخل One Click Dub

هذه النسخة جاهزة لخمسة أصوات مخصصة في Quality / OmniVoice:

- sample_01.wav
- sample_02.wav
- sample_03.wav
- sample_04.wav
- sample_05.wav

## 1) داخل الإضافة

ضع ملفاتك الصوتية داخل مجلد:

```text
voice-samples/
```

بالأسماء نفسها أعلاه. هذا يجعل زر التشغيل ▶ داخل popup يشغّل العينة محلياً.

الأفضل أن تكون العينة:

- WAV
- صوت شخص واحد فقط
- بدون موسيقى أو ضجيج
- من 3 إلى 10 ثوانٍ تقريباً
- نفس لغة الدبلجة قدر الإمكان
- تملك حق استخدامها أو لديك موافقة صاحب الصوت

## 2) داخل Colab

يجب رفع نفس الملفات إلى:

```text
/content/omnivoice_refs/
```

حتى يستخدمها OmniVoice فعلياً في voice cloning.

## 3) خلية Colab لرفع وتحويل العينات تلقائياً

```python
from google.colab import files
from pathlib import Path
import subprocess, shutil

REF_DIR = Path('/content/omnivoice_refs')
REF_DIR.mkdir(parents=True, exist_ok=True)

print('ارفع 5 عينات صوتية الآن. سيتم حفظها كـ sample_01.wav ... sample_05.wav')
uploaded = files.upload()

for i, original_name in enumerate(uploaded.keys(), start=1):
    if i > 5:
        break
    src = Path('/content') / original_name
    dst = REF_DIR / f'sample_{i:02d}.wav'
    # تحويل إلى WAV mono 24kHz وقص أول 10 ثوانٍ لتسهيل cloning
    subprocess.run([
        'ffmpeg', '-y', '-i', str(src),
        '-t', '10', '-ac', '1', '-ar', '24000',
        str(dst)
    ], check=True)
    print('saved:', dst)

print('الملفات الحالية:')
for p in sorted(REF_DIR.glob('sample_*')):
    print(p.name, round(p.stat().st_size / 1024, 1), 'KB')
```

## 4) اختبار سريع من Colab

```python
from pathlib import Path
REF_DIR = Path('/content/omnivoice_refs')
for p in sorted(REF_DIR.glob('sample_*')):
    print(p.name, p.exists(), round(p.stat().st_size / 1024, 1), 'KB')
```

## 5) تشغيل الخادم مع مجلد العينات

أضف هذا السطر ضمن env قبل تشغيل uvicorn:

```python
env['OCD_OMNIVOICE_REFS_DIR'] = '/content/omnivoice_refs'
```

بعدها داخل الإضافة اختر:

```text
Model: Quality · OmniVoice
Voice: Voice Sample 1 / 2 / 3 / 4 / 5
```

سيُرسل إلى الخادم voiceName مثل:

```text
sample_01.wav
```

وسيبحث الخادم عنه داخل:

```text
/content/omnivoice_refs/
```
