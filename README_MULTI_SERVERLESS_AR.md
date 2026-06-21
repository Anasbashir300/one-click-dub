# One Click Dub - Multi Serverless Endpoints

هذا التعديل يجعل كل نموذج في الإضافة يستخدم RunPod Serverless Endpoint مستقل.

## أين تضع Endpoint IDs؟
افتح `background.js` وعدّل:

```js
const RUNPOD_SERVERLESS_ENDPOINTS = {
  fast: { endpointId: "PUT_FAST_ENDPOINT_ID_HERE" },
  quality: { endpointId: RUNPOD_SERVERLESS_ENDPOINT_ID },
  pro: { endpointId: "PUT_PRO_ENDPOINT_ID_HERE" }
};
```

الـ Quality يستخدم endpoint القديم الحالي افتراضيًا.

## لماذا نخزن job route؟
عند تشغيل /run في Endpoint معين يجب أن يتم /status على نفس الـ Endpoint. لذلك يحفظ background.js علاقة:

```text
jobId -> modelKey -> endpointId
```

داخل `chrome.storage.local`.

## مهم
لا تنشر الإضافة وبداخلها RUNPOD_API_KEY. هذا مناسب للاختبار الخاص فقط. الإنتاج يجب أن يستخدم API Gateway يخفي المفتاح.
