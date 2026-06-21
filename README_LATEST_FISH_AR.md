# تحديث Pro إلى أحدث Fish Speech

هذه الحزمة تجعل Dockerfile.pro يسحب أحدث كود من GitHub main عند كل rebuild بدل استخدام طبقة cache قديمة.

## الملفات التي استبدلها

- Dockerfile.pro
- start_serverless.sh
- requirements_pro.txt

واحتفظ بملفات backend الحالية كما هي:

- serverless_handler.py
- colab_custom_dub_server.py

## متغيرات RunPod المطلوبة

ضعها في Pro Endpoint:

```env
HF_TOKEN=hf_ضع_توكن_هنا
HUGGING_FACE_HUB_TOKEN=hf_نفس_التوكن_هنا
HF_HUB_ENABLE_HF_TRANSFER=0
OCD_MODEL=pro
OCD_ENDPOINT_MODEL=pro
OCD_TTS_ENGINE=fish_speech
OCD_ENABLE_FISH_API=1
OCD_FISH_SPEECH_MODEL=fishaudio/openaudio-s1-mini
OCD_FISH_CHECKPOINT_DIR=/runpod-volume/fish-speech/checkpoints/openaudio-s1-mini
OCD_FISH_SPEECH_API_URL=http://127.0.0.1:8080/v1/tts
OCD_FISH_COMPILE=0
```

## بعد الرفع

1. ارفع الملفات إلى GitHub.
2. أعد Build للـ Pro Endpoint.
3. اضغط Purge Queue.
4. جرّب Job جديد.

## ملاحظة مهمة

أحدث Fish Speech main لا يعني بالضرورة أن openaudio/s1-mini خالٍ من bug. إذا ظهر:

```text
AttributeError: 'NoneType' object has no attribute 'encode'
```

فهذا bug معروف في Fish Speech مع s1-mini/S2، وليس خطأ RunPod أو HF_TOKEN.
