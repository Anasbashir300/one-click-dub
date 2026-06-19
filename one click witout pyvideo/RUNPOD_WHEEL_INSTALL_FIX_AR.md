# إصلاح خطأ wheel uninstall-no-record-file على RunPod

بعض صور RunPod تأتي وفيها حزمة `wheel` مثبتة بدون ملف `RECORD`. عند تشغيل:

```bash
python -m pip install -U pip wheel setuptools packaging
```

قد يظهر الخطأ:

```text
error: uninstall-no-record-file
Cannot uninstall wheel ... no RECORD file was found
```

تم تعديل `runpod_install.sh` ليستخدم:

```bash
python -m pip install --no-cache-dir --ignore-installed -U pip setuptools packaging wheel
```

هذا يثبت الحزم فوق النسخة القديمة بدل محاولة حذفها.

إذا ظهر الخطأ لديك قبل استخدام النسخة المعدلة، شغّل يدويًا:

```bash
python -m pip install --no-cache-dir --ignore-installed -U pip setuptools packaging wheel
```

ثم أعد تشغيل:

```bash
./runpod_install.sh
```
