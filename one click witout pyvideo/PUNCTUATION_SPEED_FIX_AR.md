# إصلاح بطء deepmultilingualpunctuation

سبب البطء في النسخة السابقة لم يكن أن الترقيم يعمل ببطء فقط، بل أن المكتبة كانت تفشل مع Transformers v5 بسبب الوسيط القديم `grouped_entities`، ثم تعيد المحاولة على كل مقطع.

الإصلاح في هذه النسخة:

- لا تستخدم استدعاء `PunctuationModel().restore_punctuation()` القديم مباشرة.
- تستخدم نفس نموذج FullStop عبر Transformers لكن بطريقة متوافقة مع Transformers v5: `aggregation_strategy='none'`.
- يتم تحميل نموذج الترقيم مرة واحدة فقط في الخادم، وليس مرة لكل chunk.
- إذا فشل النموذج مرة واحدة، يتوقف عن إعادة المحاولة ويستخدم fallback بسيط حتى لا يضيع الوقت.
- تمت إضافة `punctuationElapsedSec` و `punctuationEngines` داخل job للتشخيص.

إعدادات مفيدة:

```python
env["OCD_USE_PUNCTUATION"] = "1"
env["OCD_PUNCT_MIN_WORDS"] = "7"
env["OCD_PUNCT_CHUNK_WORDS"] = "180"
env["OCD_PUNCT_OVERLAP_WORDS"] = "5"
```

لتعطيل الترقيم تماماً:

```python
env["OCD_USE_PUNCTUATION"] = "0"
```

ملاحظة: أول تشغيل سيحمّل النموذج من Hugging Face وقد يتأخر قليلاً. بعد ذلك يجب أن يكون أسرع لأن النموذج يبقى في الذاكرة.
