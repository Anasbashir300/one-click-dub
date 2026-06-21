# إصلاح ظهور رسالة Pro coming soon

هذه النسخة لا توقف زر Pro داخل الإضافة. عند اختيار Pro يتم إرسال الطلب إلى RunPod Serverless كالتالي:

```js
modelName: "pro"
ttsType: 3
```

لكن إذا ظهرت رسالة أن Pro ما زال UI preview فهذا يعني أن **Pro Endpoint نفسه على RunPod يعمل بنسخة قديمة** أو لم يتم بناؤه بـ Fish Speech.

## المطلوب في RunPod Pro Endpoint

استخدم ملفات البرو الموجودة في هذه الحزمة:

```text
Dockerfile.pro
requirements_pro.txt
start_serverless.sh
serverless_handler.py
colab_custom_dub_server.py
```

وفي Environment Variables للـ Pro Endpoint ضع على الأقل:

```env
OCD_MODEL=pro
OCD_ENDPOINT_MODEL=pro
OCD_TTS_ENGINE=fish_speech
OCD_USE_FISH_SPEECH=1
OCD_FISH_SPEECH_AUTO_CLONE=1
OCD_FISH_SPEECH_MODEL=fishaudio/openaudio-s1-mini
OCD_ENABLE_FISH_API=1
OCD_FISH_SPEECH_API_URL=http://127.0.0.1:8080/v1/tts
OCD_RETURN_AUDIO_BASE64=1
OCD_OUTPUT_FORMAT=mp3
```

## في extension/background.js

ضع Pro Endpoint ID هنا فقط:

```js
const RUNPOD_PRO_ENDPOINT_ID = "ضع_Endpoint_ID_الخاص_بالبرو";
```

ولا تضع رابط RunPod API مكان apiKey.
