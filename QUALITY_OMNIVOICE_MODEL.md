# Quality = NLLB-200 + OmniVoice + Whisper medium

هذا هو وضع الجودة الجديد داخل One Click Dub.

```text
Quality = NLLB-200 + OmniVoice / Whisper medium
```

## الإعدادات التي يرسلها الامتداد

```json
{
  "modelName": "quality",
  "ttsType": 2,
  "translationEngine": "nllb200",
  "whisperModel": "medium"
}
```

## أصوات Quality

خيارات Quality في الواجهة هي أدوار OmniVoice:

```text
design-male-deep-ar
design-male-warm-ar
design-female-soft-ar
design-female-bright-ar
design-narrator-ar
```

يمكن لاحقاً استخدام ملف صوت مرجعي إذا وضعته في:

```text
/content/omnivoice_refs/
```
