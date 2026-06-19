# إصلاح استخدام عينات OmniVoice Clone

سبب استمرار الأصوات القديمة كان أن `custom-dub-bridge.js` كان يسمح فقط بأصوات design مثل:

- design-male-deep-ar
- design-male-warm-ar
- design-female-soft-ar

وعندما تختار من الواجهة `sample_01.wav` كان السكربت يرفضها ويرجع تلقائياً إلى:

```text
design-male-deep-ar
```

تم إصلاح ذلك، والآن القيم التالية تمر كما هي إلى Colab:

- sample_01.wav
- sample_02.wav
- sample_03.wav
- sample_04.wav
- sample_05.wav

تأكد فقط أن نفس الملفات موجودة في Colab داخل:

```text
/content/omnivoice_refs/
```

وأنك أضفت هذا السطر عند تشغيل الخادم:

```python
env["OCD_OMNIVOICE_REFS_DIR"] = "/content/omnivoice_refs"
```

بعد تشغيل job، افتح سجل الوظيفة أو `uvicorn.log` وتأكد أن `omnivoiceResolvedRole.mode` يساوي `clone` وليس `design-fallback`.
