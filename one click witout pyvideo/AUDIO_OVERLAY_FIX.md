# One Click Dub · Audio Overlay Fix

هذه النسخة تصلح مشكلتين:

1. لم تعد تفتح رابط `/outputs` داخل YouTube، لأن الخادم الآن لا يرجع رابطًا نسبيًا.
2. لم تعد تعرض فيديو مدبلج فوق الفيديو الأصلي، بل ترجع ملف صوت `m4a` فقط وتشغله الإضافة متزامنًا مع الفيديو الحالي.

## الملف الذي ترفعه إلى Colab

ارفع:

```text
colab_custom_dub_server.py
```

إلى:

```text
/content/colab_custom_dub_server.py
```

## بعد تشغيل Cloudflare

لازم تعيد تشغيل uvicorn مع PUBLIC_BASE_URL:

```python
import os, subprocess, time, requests

# ضع هنا رابط Cloudflare الذي ظهر لك
PUBLIC_URL = "https://xxxxx.trycloudflare.com"
os.environ["PUBLIC_BASE_URL"] = PUBLIC_URL

!pkill -f "uvicorn colab_custom_dub_server" || true

env = os.environ.copy()
env["PUBLIC_BASE_URL"] = PUBLIC_URL

subprocess.Popen(
    ["python", "-m", "uvicorn", "colab_custom_dub_server:app", "--host", "0.0.0.0", "--port", "8000"],
    cwd="/content",
    env=env,
    stdout=open("/content/uvicorn.log", "w"),
    stderr=subprocess.STDOUT
)

time.sleep(3)
print(requests.get("http://127.0.0.1:8000/health", timeout=10).text)
print(requests.get(PUBLIC_URL + "/health", timeout=20).text)
```

إذا كان `publicBaseUrl` فارغًا، سيمنع الخادم إرجاع النتيجة حتى لا تتحول `/outputs` إلى رابط داخل YouTube.

## تعديل الإضافة

في `background.js` ضع رابط Cloudflare هنا:

```js
const CUSTOM_DUB_SERVER_BASE = "https://xxxxx.trycloudflare.com";
```

ثم احذف الإضافة القديمة من Chrome أو اضغط Reload.

## النتيجة المتوقعة

بعد انتهاء الدبلجة، سترى:

```text
Done · audio overlay ready
```

ثم سيُكتم صوت YouTube الأصلي، ويشتغل صوت الدبلجة فوق نفس الفيديو.

يوجد زران:

- Re-sync: إعادة المزامنة عند وجود فرق بسيط.
- Stop: إيقاف صوت الدبلجة وإرجاع صوت YouTube الأصلي.
