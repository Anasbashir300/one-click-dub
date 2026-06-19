# One Click Dub — RunPod Serverless Setup

هذه النسخة تضيف دعم RunPod Serverless فوق نسخة الـ Pod الحالية.

## الملفات الجديدة

- `serverless_handler.py` — Handler الخاص بـ RunPod Serverless.
- `Dockerfile.serverless` — Docker image للـ Serverless worker.
- `requirements_serverless.txt` — متطلبات worker.
- `test_input_serverless.json` — اختبار سريع من تبويب Requests.
- `runpod_serverless_build_push.sh` — بناء ورفع Docker image.

## وضعان للتشغيل

### 1. Pod Mode
يظل كما هو:

```bash
bash runpod_start.sh
```

### 2. Serverless Mode
يستخدم:

```bash
python -u serverless_handler.py
```

RunPod سيشغّله داخل worker تلقائيًا من خلال Dockerfile.

## مهم جدًا

`serverless_handler.py` يعيد الصوت كـ `audioBase64` داخل output. هذا مناسب للاختبار الخاص والفيديوهات القصيرة.

للإنتاج العام الأفضل استخدام API Gateway + Storage مثل Cloudflare R2/S3 حتى لا يرجع ملف MP3 الكبير داخل Response.

## إعدادات Endpoint المقترحة

### Fast Endpoint
- Active Workers: 0
- Max Workers: 3 إلى 5
- Idle Timeout: 10 إلى 20 ثانية
- GPU: 3090/4090 حسب السعر

### Quality Endpoint
- Active Workers: 1
- Max Workers: 3
- Idle Timeout: 30 إلى 60 ثانية
- Network Volume: enabled
- Cached Models: enabled

## Environment Variables المقترحة

```bash
OCD_ROOT=/runpod-volume/one-click-dub
HF_HOME=/runpod-volume/.cache/huggingface
TRANSFORMERS_CACHE=/runpod-volume/.cache/huggingface
XDG_CACHE_HOME=/runpod-volume/.cache

OCD_FAST_ASR_ENGINE=faster-whisper
OCD_FAST_WHISPER_MODEL=large-v3-turbo
OCD_QUALITY_WHISPER_MODEL=large-v3
OCD_WHISPER_COMPUTE_TYPE=float16

OCD_NLLB_MODEL=facebook/nllb-200-distilled-600M
OCD_NLLB_DTYPE=float16
OCD_NLLB_BEAMS=2

OCD_OMNIVOICE_AUTO_CLONE=1
OCD_OMNIVOICE_STEPS=24
OCD_OMNIVOICE_GUIDANCE=2.0
OCD_OMNIVOICE_TTS_MAX_CHARS=190

OCD_USE_PUNCTUATION=1
OCD_TTS_PUNCT_PAUSES=1
OCD_USE_CATT_TASHKEEL=1

OCD_YTDLP_REMOTE_EJS=1
OCD_YTDLP_USE_REQUEST_COOKIES=0
```

## اختبار من RunPod Requests tab

استخدم محتوى `test_input_serverless.json`.

## تشغيل الإضافة مباشرة على Serverless

تم تعديل `background.js` لدعم وضعين:

```js
const OCD_BACKEND_MODE = "fastapi";
```

للتجربة الخاصة فقط اجعله:

```js
const OCD_BACKEND_MODE = "runpod-serverless";
const RUNPOD_SERVERLESS_ENDPOINT_ID = "ENDPOINT_ID";
const RUNPOD_API_KEY = "RUNPOD_API_KEY";
```

تحذير: لا تنشر إضافة Chrome وفيها API Key. هذا فقط للاختبار الخاص. للإنتاج استخدم API Gateway يخفي مفتاح RunPod.
