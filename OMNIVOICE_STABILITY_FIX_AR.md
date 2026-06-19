# إصلاح ثبات OmniVoice داخل One Click Dub

تم تعديل الخادم لمعالجة 3 مشاكل:

1. **القراءة بطيئة جداً**
   - تم جعل `OCD_OMNIVOICE_STEPS=12` افتراضياً بدل 24.
   - تم إضافة `OCD_OMNIVOICE_SPEED=1.16` افتراضياً.
   - تم إيقاف إجبار `duration` افتراضياً لأنه قد يجعل OmniVoice يبطئ القراءة ويفوّت كلمات.

2. **يفوّت كلمات**
   - تم تنظيف النص قبل TTS.
   - تم تقسيم الجمل الطويلة قبل إرسالها إلى OmniVoice.
   - الحد الافتراضي صار `OCD_OMNIVOICE_TTS_MAX_CHARS=190`.

3. **الصوت غير ثابت بين المقاطع**
   - تم دمج المقاطع القصيرة جداً إذا أمكن.
   - تم تخزين voice clone prompt في الذاكرة وإعادة استخدامه لكل المقاطع.
   - تم ضبط درجات العشوائية على 0 عند دعمها:
     - `OCD_OMNIVOICE_POSITION_TEMPERATURE=0.0`
     - `OCD_OMNIVOICE_CLASS_TEMPERATURE=0.0`

## الإعدادات المقترحة عند تشغيل الخادم

```python
env["OCD_OMNIVOICE_STEPS"] = "12"
env["OCD_OMNIVOICE_SPEED"] = "1.16"
env["OCD_OMNIVOICE_GUIDANCE"] = "2.0"
env["OCD_OMNIVOICE_TTS_MAX_CHARS"] = "190"
env["OCD_OMNIVOICE_TTS_MIN_CHARS"] = "35"
env["OCD_OMNIVOICE_TTS_MAX_SECONDS"] = "8.5"
env["OCD_OMNIVOICE_POSITION_TEMPERATURE"] = "0.0"
env["OCD_OMNIVOICE_CLASS_TEMPERATURE"] = "0.0"
env["OCD_OMNIVOICE_USE_DURATION"] = "0"
```

لو الصوت لا يزال بطيئاً، جرّب:

```python
env["OCD_OMNIVOICE_SPEED"] = "1.22"
env["OCD_OMNIVOICE_STEPS"] = "8"
```

لو الجودة أهم من السرعة:

```python
env["OCD_OMNIVOICE_SPEED"] = "1.10"
env["OCD_OMNIVOICE_STEPS"] = "16"
```
