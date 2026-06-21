# إصلاح Pro / Fish Speech الحقيقي

هذه الحزمة مخصصة لملفات RunPod Serverless، وليست مجرد تعديل واجهة Chrome.

سبب رسالة:

```text
✨ Pro / Fish-Speech S1-mini is coming soon. This option is UI preview only; no backend model is installed yet.
```

أن Endpoint البرو على RunPod ما زال يعمل بملف Python قديم يحتوي على شرط يمنع Pro ويرجع status=soon.

## الملفات المهمة

استبدل في GitHub/RunPod هذه الملفات:

```text
colab_custom_dub_server.py
serverless_handler.py
Dockerfile.pro
requirements_pro.txt
start_serverless.sh
```

ثم أعد بناء Pro Endpoint من جديد. لا يكفي تعديل الإضافة فقط.

## متغيرات Pro الأساسية

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

## إصلاح إضافي

تم أيضًا استبدال `asyncio.run(edge_tts_save(...))` بـ helper آمن حتى لا يظهر خطأ:

```text
asyncio.run() cannot be called from a running event loop
```
