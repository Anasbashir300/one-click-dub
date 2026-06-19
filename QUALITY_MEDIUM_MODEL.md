# Quality / Whisper medium

وضع Quality الحالي:

```text
Quality = NLLB-200 + OmniVoice / Whisper medium
```

Whisper medium يستخدم في Quality للحصول على نص أدق من Fast، ثم يرسل النص إلى NLLB-200 للترجمة، وبعدها OmniVoice لتوليد الصوت.

ملاحظة: هذا الوضع أثقل من Fast ويحتاج GPU جيد، خصوصاً عند أول تشغيل للنماذج.
