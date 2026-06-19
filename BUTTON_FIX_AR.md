# إصلاح اختفاء زر الدبلجة

سبب المشكلة كان وجود السطر `voice-samples/*` داخل قائمة content_scripts في manifest.json.
هذا يجعل Chrome يرفض تحميل content script لأن content_scripts.js لا يقبل wildcard ولا ملفات صوت.

تم الإصلاح:
- حذف `voice-samples/*` من content_scripts.js.
- إبقاء `voice-samples/*` داخل web_accessible_resources فقط لتشغيل عينات الصوت من popup.
- جعل Quick browser buttons مفعلة افتراضياً.

بعد تثبيت هذه النسخة:
1. افتح chrome://extensions
2. احذف النسخة القديمة Remove
3. فعّل Developer mode
4. اضغط Load unpacked
5. اختر مجلد النسخة الجديدة بعد فك الضغط
6. افتح صفحة فيديو واضغط Refresh
