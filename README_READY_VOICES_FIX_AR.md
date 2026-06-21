# إصلاح الأصوات الجاهزة في Quality/Pro

المشكلة كانت أن اختيار Orion/Salem/Lina/Noura من الواجهة كان يصل إلى السيرفر، لكن السيرفر كان يفعّل auto clone دائمًا عندما تكون متغيرات `OCD_OMNIVOICE_AUTO_CLONE=1` أو `OCD_FISH_SPEECH_AUTO_CLONE=1`.

تم تعديل `colab_custom_dub_server.py` ليعمل كالتالي:

- إذا كان `voiceName=auto-clone-video` → يستخدم الاستنساخ من الفيديو.
- إذا كان `voiceName=ocd-orion-male` أو `ocd-salem-male` أو `ocd-lina-female` أو `ocd-noura-female` → يستخدم ملف WAV جاهز من السيرفر.

## ضع ملفات الأصوات هنا

داخل RunPod Volume:

```text
/runpod-volume/one-click-dub/ready_voice_refs/
```

بالأسماء التالية:

```text
ocd_orion_male.wav
ocd_salem_male.wav
ocd_lina_female.wav
ocd_noura_female.wav
```

أو ضعها داخل الريبو في مجلد:

```text
ready_voice_refs/
```

ثم أضف في Dockerfile إن لم يكن موجودًا:

```dockerfile
COPY ready_voice_refs /app/ready_voice_refs
```

## متغير اختياري

```env
OCD_READY_VOICE_REFS_DIR=/runpod-volume/one-click-dub/ready_voice_refs
```

بعد رفع الملفات، أعد بناء Quality Endpoint وPro Endpoint.
