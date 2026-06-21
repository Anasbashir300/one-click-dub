# إصلاح وتشخيص Start RunPod

هذه النسخة تضيف تشخيصًا واضحًا داخل `background.js`:

- تطبع في Service Worker Console عند وصول رسالة من زر DUB.
- تطبع Endpoint ID الذي سيرسل إليه الطلب.
- تضيف Timeout مباشر لطلب `/run` بعد 20 ثانية بدل أن يبقى زر DUB عالقًا 45 ثانية.
- تضيف رسالة `OCD_RUNPOD_DIAG` لاختبار أن الخلفية ترى Endpoint ID والمفتاح.

## أين تضع المفاتيح؟

افتح `background.js` وضع القيم في أعلى الملف فقط:

```js
const RUNPOD_API_KEY = "rpa_...";
const RUNPOD_FAST_ENDPOINT_ID = "...";
const RUNPOD_QUALITY_ENDPOINT_ID = "...";
const RUNPOD_PRO_ENDPOINT_ID = "...";
```

لا تضع رابط Pod عادي. هذه نسخة Serverless فقط.

## كيف تفحص الخطأ الحقيقي؟

1. افتح `chrome://extensions`
2. One Click Dub → Service Worker → Inspect
3. افتح Console
4. اضغط DUB من صفحة YouTube
5. راقب رسائل `[OCD BG]`

يجب أن ترى:

```text
[OCD BG] message OCD_PVT_START_JOB
[OCD BG] Starting RunPod /run { model: ..., endpointId: ... }
[OCD BG] RunPod /run fast → https://api.runpod.ai/v2/.../run
```

إذا لم تظهر أول رسالة، فالـ content script لا يصل إلى background أو الإضافة ليست النسخة الجديدة.
إذا ظهرت أول رسالة ولم تظهر Starting RunPod، فالمشكلة في اختيار الموديل أو Endpoint ID.
إذا ظهرت Starting RunPod ثم Timeout، فالمشكلة اتصال/API key/endpoint/صلاحية الوصول.
