# تشغيل One Click Dub على RunPod RTX 3090

هذه النسخة معدلة لتعمل كسيرفر احترافي دائم بدل Colab/Cloudflare.

## أهم التغييرات

- المسار الافتراضي صار `/workspace/one-click-dub-runtime`.
- رابط السيرفر يستخدم RunPod HTTP proxy مثل: `https://PODID-8000.proxy.runpod.net`.
- Fast يستخدم `faster-whisper large-v3-turbo + Google + Edge TTS`.
- Quality يستخدم `faster-whisper large-v3 + NLLB-200 + OmniVoice Auto Clone Per Job`.
- كل فيديو يأخذ job مستقل وعينة استنساخ مستقلة.
- yt-dlp يعمل audio-first مع remote EJS solver.
- الناتج MP3 لتجنب Chrome media error code 4.
- الإضافة فيها Blob fallback إذا رفض Chrome تشغيل رابط MP3 مباشرة.
- يوجد queue افتراضي: job ثقيل واحد في كل مرة لحماية VRAM RTX 3090.

## ملفات مهمة

- `colab_custom_dub_server.py`: سيرفر FastAPI الرئيسي، الاسم بقي كما هو لتفادي كسر الإضافة.
- `runpod_install.sh`: تثبيت المتطلبات.
- `runpod_start.sh`: تشغيل السيرفر بإعدادات RTX 3090.
- `background.js`: ضع فيه رابط RunPod.
- `custom-dub-bridge.js`: تشغيل الصوت فوق الفيديو مع fallback Blob.

## اختبار الصحة

بعد التشغيل افتح:

```text
https://PODID-8000.proxy.runpod.net/health
```

يجب أن ترى:

```json
"service": "one-click-dub-runpod-backend"
"fixVersion": "2026-06-19-runpod-rtx3090-audio-first-mp3-blob-queue"
```

إذا لم تظهر هذه القيم، فأنت لا تشغل الملف الجديد.
