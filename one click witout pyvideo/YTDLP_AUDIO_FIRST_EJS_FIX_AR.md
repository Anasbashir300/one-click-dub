# إصلاح yt-dlp لمشكلة YouTube n challenge / Only images are available

هذا التحديث يحل الخطأ مثل:

```text
n challenge solving failed
Only images are available for download
Requested format is not available
```

## ما الذي تغيّر؟

1. لم نعد نطلب فيديو كاملًا بصيغة:

```text
bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best
```

لأن One Click Dub يحتاج الصوت فقط للدبلجة.

2. أصبح التحميل Audio-first:

```text
ba[ext=m4a]/bestaudio[ext=m4a]/bestaudio/best
```

3. أضفنا دعم حل تحديات YouTube عبر:

```text
--remote-components ejs:github
```

4. أوقفنا تمرير cookies كـ header افتراضيًا، لأن هذا خطر ويجعل الكوكيز تظهر داخل اللوج عند الخطأ.

5. أضفنا إخفاء cookies من رسائل الأخطاء حتى لا تظهر بيانات حساب Google في السجل.

## متغيرات مهمة

```bash
OCD_YTDLP_REMOTE_EJS=1
OCD_YTDLP_REMOTE_COMPONENTS=ejs:github
OCD_YTDLP_FORMAT=ba[ext=m4a]/bestaudio[ext=m4a]/bestaudio/best
OCD_YTDLP_EXTRACTOR_ARGS=youtube:player_client=default,android,web
```

## في Colab

يفضل تحديث yt-dlp وتثبيت JavaScript runtime:

```python
!python -m pip install -U --no-cache-dir yt-dlp
!apt-get update -y
!apt-get install -y nodejs npm curl
!curl -fsSL https://deno.land/install.sh | sh
import os
os.environ["PATH"] = os.environ["PATH"] + ":/root/.deno/bin"
```

## اختبار سريع

```python
!python -m yt_dlp \
  --remote-components ejs:github \
  --extractor-args "youtube:player_client=default,android,web" \
  --force-ipv4 \
  -f "ba[ext=m4a]/bestaudio/best" \
  -o "/content/test_audio.%(ext)s" \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

## ملاحظة عن cookies

افتراضيًا لا يستخدم الباكند cookies القادمة من الإضافة.
لو احتجت ذلك لفيديو خاص، فعّل:

```bash
OCD_YTDLP_USE_REQUEST_COOKIES=1
```

سيتم تحويل cookies إلى ملف مؤقت `cookies.txt` بدل تمريرها كـ header.
