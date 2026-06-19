# إصلاح الوقفات الصوتية عند علامات الترقيم

هذا التعديل لا يكتفي بإضافة علامات الترقيم إلى النص فقط، بل يحولها إلى وقفات صوتية فعلية داخل خط الزمن.

## ماذا يحدث الآن؟

بعد Whisper والترجمة والتشكيل، يقوم الخادم بتقسيم `ttsText` عند علامات مثل:

- النقطة `.`
- علامة السؤال `؟` / `?`
- علامة التعجب `!`
- الفاصلة العربية `،`
- الفاصلة الإنجليزية `,`
- الفاصلة المنقوطة `؛` / `;`
- النقطتان `:`

ثم يترك فراغاً زمنياً صغيراً بين أجزاء الصوت عند المزج النهائي.

## الإعدادات الافتراضية

```python
env["OCD_TTS_PUNCT_PAUSES"] = "1"
env["OCD_TTS_PAUSE_SENTENCE"] = "0.48"
env["OCD_TTS_PAUSE_COMMA"] = "0.22"
env["OCD_TTS_PAUSE_SEMICOLON"] = "0.32"
env["OCD_TTS_PAUSE_ON_COMMA"] = "1"
env["OCD_TTS_PAUSE_MIN_CHARS"] = "24"
env["OCD_TTS_PAUSE_MAX_PARTS_PER_CHUNK"] = "6"
env["OCD_TTS_PAUSE_MAX_RATIO"] = "0.32"
```

## إذا كانت الوقفات طويلة جداً

قلل القيم:

```python
env["OCD_TTS_PAUSE_SENTENCE"] = "0.35"
env["OCD_TTS_PAUSE_COMMA"] = "0.12"
```

## إذا كانت الوقفات قصيرة جداً

ارفع القيم:

```python
env["OCD_TTS_PAUSE_SENTENCE"] = "0.65"
env["OCD_TTS_PAUSE_COMMA"] = "0.30"
```

## إذا صار الصوت غير ثابت بسبب كثرة التقسيم

أوقف الوقف عند الفواصل واستخدم النقاط فقط:

```python
env["OCD_TTS_PAUSE_ON_COMMA"] = "0"
```

## كيف تتأكد أن التعديل يعمل؟

بعد دبلجة فيديو، نفذ:

```python
!find /content/ocd_custom_jobs -name "tts_punctuation_pause_chunks.json" | tail -n 3
```

ثم افتح آخر ملف:

```python
!cat $(find /content/ocd_custom_jobs -name "tts_punctuation_pause_chunks.json" | tail -n 1) | head -n 120
```

يجب أن ترى حقولاً مثل:

```json
"punctuationPauseAfter": 0.48,
"splitForPunctuationPause": true
```
