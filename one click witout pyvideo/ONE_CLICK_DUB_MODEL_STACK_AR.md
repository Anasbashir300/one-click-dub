# One Click Dub — Model Stack الجديد

تم تعديل ترتيب النماذج حسب طلبك:

| Mode | Translation | TTS | ASR |
|---|---|---|---|
| Fast | Google Translate | Edge TTS | Whisper small |
| Quality | NLLB-200 | OmniVoice | Whisper medium |
| Pro | NLLB-200 | Fish-Speech S1-mini | Whisper turbo |

## ملاحظة مهمة عن Pro

خيار Pro الآن **مظهر فقط** داخل الإضافة.

يظهر بهذا الشكل:

```text
✨ Pro · Fish-Speech S1-mini · SOON
```

وعند الضغط عليه أو محاولة بدء الدبلجة، تظهر رسالة أنه قادم قريباً، ولا يتم إرسال job إلى Colab.

## ما يعمل فعلياً الآن

```text
Fast    = يعمل فعلياً
Quality = يعمل فعلياً بشرط تثبيت OmniVoice في Colab
Pro     = Soon / UI preview only
```

## التعديلات الأساسية

- `popup.js`: تغيير Quality إلى OmniVoice، وتغيير Pro إلى Fish-Speech S1-mini مع علامة SOON.
- `custom-dub-bridge.js`: Quality يرسل `ttsType=2`, `whisperModel=medium`, `translationEngine=nllb200`.
- `custom-dub-bridge.js`: Pro لا يبدأ أي job؛ يعرض رسالة Soon فقط.
- `colab_custom_dub_server.py`: Quality يستخدم OmniVoice بدلاً من Chatterbox.
- `colab_custom_dub_server.py`: Pro يرجع حالة `soon` إذا وصل طلب مباشر إليه.
