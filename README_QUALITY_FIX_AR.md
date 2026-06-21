# إصلاح Quality / OmniVoice

هذا الباتش يعالج خطأ:

```text
cannot import name 'HiggsAudioV2TokenizerModel' from 'transformers'
```

ويعالج أيضًا خطأ:

```text
Fast download using 'hf_transfer' is enabled (HF_HUB_ENABLE_HF_TRANSFER=1) but 'hf_transfer' package is not available
```

## الملفات المعدلة

- Dockerfile.quality
- requirements_quality.txt
- start_serverless.sh

## ما الذي تغير؟

1. تثبيت `soxr` و `hf_transfer`.
2. تثبيت أحدث `transformers` من GitHub بعد تثبيت OmniVoice.
3. فحص مباشر أثناء الـ build:
   `from transformers import HiggsAudioV2TokenizerModel`
4. إجبار Quality endpoint على:
   `HF_HUB_ENABLE_HF_TRANSFER=0`
5. إجبار Quality endpoint على OmniVoice فقط:
   `OCD_ENABLE_FISH_API=0`

## بعد الرفع إلى GitHub

1. Rebuild للـ Quality Endpoint.
2. Purge Queue.
3. شغل Job واحد فقط.

## الأسطر التي يجب أن تظهر في اللوج

```text
=== OCD QUALITY DIAG ===
Transformers: ...
HiggsAudioV2TokenizerModel import OK
OmniVoice import OK
=== END OCD QUALITY DIAG ===
```
