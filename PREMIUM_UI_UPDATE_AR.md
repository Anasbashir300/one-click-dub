# One Click Dub — Premium Popup UI Update

تم تنفيذ واجهة Premium جديدة للإضافة مع الحفاظ على ربط الإضافة الحالي.

## الملفات المعدلة

- popup.html
- popup.css
- popup.js
- custom-dub-bridge.js

## ما الجديد؟

- واجهة Dark Premium Glassmorphism.
- اختيار اللغات من Dropdown قابل للبحث.
- اختيار Fast / Quality / Pro عبر بطاقات تفاعلية.
- Fast يعرض صوت ذكر وصوت أنثى حسب لغة الدبلجة.
- Quality و Pro يعرضان:
  - Clone Video Voice
  - Orion — Deep Male
  - Salem — Warm Male
  - Lina — Soft Female
  - Noura — Clear Female
- زر Sample لكل صوت.
- حفظ تلقائي للإعدادات.
- زر Start Dubbing يرسل الأمر إلى custom-dub-bridge لتشغيل RunPod backend.
- تم تحديث custom-dub-bridge حتى لا يوقف Pro برسالة coming soon، ويمرر Pro إلى Fish Speech.

## ملفات عينات الصوت داخل الإضافة

المعاينة تستخدم الملفات الموجودة في:

voice_samples/ready/

بالأسماء:

- ocd_orion_male.wav
- ocd_salem_male.wav
- ocd_lina_female.wav
- ocd_noura_female.wav

## مهم

بعد فك الضغط لا تضغط Reload فقط. احذف الإضافة من chrome://extensions ثم Load unpacked من جديد.
