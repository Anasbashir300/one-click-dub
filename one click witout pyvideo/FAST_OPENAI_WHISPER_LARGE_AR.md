# Fast الآن يستخدم OpenAI Whisper الأصلي large

التقسيم الحالي:

```text
Fast    = Google Translate + Edge TTS + original OpenAI Whisper large
Quality = NLLB-200 + OmniVoice + faster-whisper medium
Pro     = Fish-Speech S1-mini + Whisper turbo — SOON فقط
```

## متطلبات Colab الجديدة

ثبّت Whisper الأصلي:

```python
!python -m pip install -U openai-whisper
```

واجعل تشغيل الخادم يحتوي:

```python
env["OCD_FAST_WHISPER_MODEL"] = "large"
```

## ملاحظة

Whisper large أدق من small لكنه أبطأ بكثير ويستهلك VRAM أكثر. على Tesla T4 سيعمل، لكن أول تشغيل سيحمّل النموذج وقد يكون بطيئاً.
