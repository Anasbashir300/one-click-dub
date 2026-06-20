# تحديث Docker لتشغيل One Click Dub مع Fish Speech Pro

## ماذا تغير؟

تم تعديل Docker ليصبح Pro قادرًا على تشغيل Fish Speech / OpenAudio S1-mini كـ API داخلي على:

```text
http://127.0.0.1:8080/v1/tts
```

ثم يستخدمه `colab_custom_dub_server.py` عند اختيار:

```env
OCD_MODEL=pro
OCD_TTS_ENGINE=fish_speech
```

## الملفات داخل الحزمة

- `Dockerfile` = نسخة شاملة تدعم Fast + Quality + Pro في صورة واحدة.
- `Dockerfile.fast` = صورة أخف لـ Fast فقط.
- `Dockerfile.quality` = صورة لـ Quality / OmniVoice فقط.
- `Dockerfile.pro` = صورة لـ Pro / Fish Speech فقط.
- `requirements_serverless.txt` = متطلبات النسخة الشاملة.
- `requirements_fast.txt` = متطلبات Fast.
- `requirements_quality.txt` = متطلبات Quality.
- `requirements_pro.txt` = متطلبات Pro.
- `start_serverless.sh` = يبدأ Fish Speech API تلقائيًا فقط عند Pro، ثم يشغل `handler.py`.

## الأفضل لثلاثة Endpoints

استخدم ثلاث صور منفصلة:

```text
Fast Endpoint    -> Dockerfile.fast
Quality Endpoint -> Dockerfile.quality
Pro Endpoint     -> Dockerfile.pro
```

هذا أفضل من صورة واحدة ضخمة لأن Fast لا يحتاج OmniVoice ولا Fish Speech.

## Environment Variables لـ Pro

ضع في Endpoint Pro:

```env
OCD_MODEL=pro
OCD_ENDPOINT_MODEL=pro
OCD_TTS_ENGINE=fish_speech
OCD_TRANSLATION_ENGINE=nllb200
OCD_USE_CATT_TASHKEEL=1
OCD_SAFE_TASHKEEL=1
OCD_USE_PUNCTUATION=1
OCD_TTS_PUNCT_PAUSES=1
OCD_FISH_SPEECH_MODEL=fishaudio/openaudio-s1-mini
OCD_FISH_CHECKPOINT_DIR=/runpod-volume/fish-speech/checkpoints/openaudio-s1-mini
OCD_FISH_SPEECH_API_URL=http://127.0.0.1:8080/v1/tts
OCD_ENABLE_FISH_API=1
```

إذا احتجت Hugging Face token:

```env
HF_TOKEN=hf_xxxxxxxxx
HUGGING_FACE_HUB_TOKEN=hf_xxxxxxxxx
```

## ملاحظات مهمة

1. أول تشغيل لـ Pro سيحمّل وزن Fish Speech إلى `/runpod-volume`، لذلك سيكون بطيئًا أول مرة.
2. بعد ذلك سيُعاد استخدام الوزن من Network Volume.
3. إذا لم تستخدم Network Volume، سيتم تحميل الوزن في كل cold start.
4. Fast وQuality لا يحتاجان Fish Speech.
5. ملف `start_serverless.sh` يشغل Fish Speech API فقط إذا كان `OCD_MODEL=pro` أو `OCD_TTS_ENGINE=fish_speech`.
