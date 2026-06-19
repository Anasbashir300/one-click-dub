# تحديث OmniVoice Auto Clone لكل فيديو / لكل Job

هذا التحديث يضيف الاستنساخ التلقائي لصوت نفس الفيديو داخل وضع Quality / OmniVoice.

## ما الذي تغير؟

بدل أن يعتمد OmniVoice على عينات ثابتة مثل `sample_01.wav`، أصبح السيرفر عند تشغيل فيديو جديد يقوم بـ:

1. استخراج صوت الفيديو.
2. تشغيل Whisper / Faster-Whisper واستخراج توقيتات الكلام.
3. اختيار أول مقطع كلام واضح من نفس الفيديو، وليس أول ثوانٍ عشوائية.
4. إنشاء عينة صوت مرجعية داخل مجلد الـ job نفسه:

```text
/content/ocd_custom_jobs/<job_id>/omnivoice_auto_ref.wav
```

5. استخدام هذه العينة فقط لدبلجة هذا الفيديو.
6. حذف مجلد الـ job لاحقًا حتى لا تتراكم العينات والملفات المؤقتة.
7. تنظيف voice clone prompt من ذاكرة OmniVoice بعد نفس مدة حذف ملفات الـ job.

## هل يستخدم صوت فيديو سابق؟

لا. كل فيديو يحصل على `job_id` مستقل وعينة مستقلة:

```text
فيديو A -> job_A/omnivoice_auto_ref.wav
فيديو B -> job_B/omnivoice_auto_ref.wav
```

ولا يتم استخدام عينة فيديو A مع فيديو B.

## الإعدادات الافتراضية

```bash
OCD_OMNIVOICE_AUTO_CLONE=1
OCD_DELETE_JOB_TEMP_AFTER_DONE=1
OCD_JOB_TEMP_TTL_SEC=600
OCD_DELETE_JOB_TEMP_AFTER_ERROR=1
OCD_JOB_ERROR_TEMP_TTL_SEC=1800
OCD_DELETE_OUTPUT_AFTER_TTL=1
OCD_OUTPUT_TTL_SEC=21600
```

## تخصيص مدة العينة

```bash
OCD_OMNIVOICE_AUTO_REF_MIN_SEC=6
OCD_OMNIVOICE_AUTO_REF_MAX_SEC=14
```

## ملاحظة

وضع Auto Clone يعمل في `Quality / OmniVoice`. وضع Fast يستخدم Edge TTS ولا يقوم باستنساخ الصوت.
