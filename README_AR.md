# One Click Dub - serverless_handler.py updated

## ماذا تغير؟

تم تعديل `serverless_handler.py` لدعم البنية النهائية:

- `fast` → Edge TTS
- `quality` → OmniVoice
- `pro` → Fish Speech

كما تم تفعيل التشكيل الآمن لكل النماذج مع حماية:

- الأرقام
- علامات الترقيم
- النسب المئوية
- العملات
- التواريخ
- الروابط
- الكلمات الإنجليزية

## طريقة الاستخدام

استبدل ملف `serverless_handler.py` القديم بهذا الملف داخل Docker image أو مشروع RunPod.

## Environment Variables لكل Endpoint

### Fast

```env
OCD_ENDPOINT_MODEL=fast
OCD_MODEL=fast
OCD_TTS_ENGINE=edge
OCD_TRANSLATION_ENGINE=google
OCD_USE_CATT_TASHKEEL=1
OCD_SAFE_TASHKEEL=1
```

### Quality

```env
OCD_ENDPOINT_MODEL=quality
OCD_MODEL=quality
OCD_TTS_ENGINE=omnivoice
OCD_TRANSLATION_ENGINE=nllb200
OCD_OMNIVOICE_AUTO_CLONE=1
OCD_OMNIVOICE_REF_MODE=per_job
OCD_USE_CATT_TASHKEEL=1
OCD_SAFE_TASHKEEL=1
```

### Pro

```env
OCD_ENDPOINT_MODEL=pro
OCD_MODEL=pro
OCD_TTS_ENGINE=fish_speech
OCD_TRANSLATION_ENGINE=nllb200
OCD_USE_FISH_SPEECH=1
OCD_FISH_SPEECH_AUTO_CLONE=1
OCD_FISH_SPEECH_REF_MODE=per_job
OCD_FISH_SPEECH_MODEL=fishaudio/openaudio-s1-mini
OCD_USE_CATT_TASHKEEL=1
OCD_SAFE_TASHKEEL=1
```

## ملاحظة مهمة

هذا الملف يوجّه الطلبات ويعمل patch لدوال التشكيل الموجودة في `colab_custom_dub_server.py` إن وجدها.
إذا كان Pro لا يعمل بعد ذلك، فالمشكلة تكون أن `colab_custom_dub_server.py` نفسه لا يحتوي بعد على فرع Fish Speech عند `ttsType=3` أو `OCD_TTS_ENGINE=fish_speech`.
