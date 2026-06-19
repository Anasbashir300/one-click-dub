# DeepMultilingualPunctuation فقط

تم تعطيل مسار `arabic-punctuation-restoration-nlp` نهائياً في هذه النسخة.

الآن استعادة علامات الترقيم بعد Whisper وقبل الترجمة/TTS تستخدم:

```text
DeepMultilingualPunctuation لجميع اللغات، بما فيها العربية
```

## التثبيت على Colab

أضف هذا الأمر قبل تشغيل الخادم:

```python
!python -m pip install -U --no-cache-dir deepmultilingualpunctuation
```

## تشغيل أو إيقاف الترقيم

التشغيل الافتراضي مفعّل:

```python
env["OCD_USE_PUNCTUATION"] = "1"
```

لإيقافه:

```python
env["OCD_USE_PUNCTUATION"] = "0"
```

## أين يعمل؟

يعمل بعد استخراج النص من Whisper وقبل:

```text
Google Translate / NLLB-200
Edge TTS / OmniVoice
```

ويحفظ ملفات تشخيص داخل مجلد الـ job:

```text
source_chunks_before_punctuation.srt
source_chunks.srt
punctuated_source_chunks.json
```

## ملاحظة مهمة

المكتبة الأصلية موجهة أكثر للإنجليزية والألمانية والفرنسية والإيطالية، لذلك قد لا تكون نتائج العربية مثالية دائماً، لكنها الآن هي المحرك الوحيد المستخدم حسب الطلب.
