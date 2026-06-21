# إصلاح Pro Worker exit code 127

المشكلة في `start_serverless.sh` كانت في أمر إنشاء المجلدات. كان هناك backslash بدون `mkdir -p`، فيحاول bash تشغيل مسار المجلد كأمر وينتهي بـ exit code 127.

استبدل الملفات التالية في GitHub/RunPod:

- `start_serverless.sh` ← مهم جدًا
- `Dockerfile.pro`
- `serverless_handler.py`
- `colab_custom_dub_server.py`
- `requirements_pro.txt`

ثم أعد Build للـ Pro Endpoint واضغط Purge Queue قبل التجربة.

بعد التشغيل يجب أن ترى في اللوج:

```text
=== OCD PRO DIAG ===
fish_speech import OK
[OCD] Starting Fish Speech API...
[OCD] Fish Speech API is ready.
--- Starting Serverless Worker ---
```

إذا ظهر `fish_speech import FAILED` فالمشكلة في تثبيت Fish Speech داخل Dockerfile.pro.
