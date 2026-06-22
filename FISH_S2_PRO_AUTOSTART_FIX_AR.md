# إصلاح Fish S2-Pro في RunPod Serverless

## المشكلة

الخطأ:

```text
Fish S2-Pro local server is not reachable ... Connection refused
```

يعني أن Pro وصل إلى مرحلة TTS، لكن خادم Fish المحلي لم يكن يعمل على:

```text
http://127.0.0.1:8080/v1/tts
```

## ما تم تغييره

- `start_runpod_worker.sh` أصبح يشغّل Fish S2-Pro محليًا افتراضيًا.
- `start_fish_s2_local_server.sh` أصبح يستخدم أمر Fish الرسمي:

```bash
python tools/api_server.py \
  --llama-checkpoint-path /runpod-volume/fish-speech/checkpoints/s2-pro \
  --decoder-checkpoint-path /runpod-volume/fish-speech/checkpoints/s2-pro/codec.pth \
  --listen 127.0.0.1:8080 \
  --half \
  --workers 1
```

- يتم تنزيل أوزان `fishaudio/s2-pro` إلى RunPod network volume أول مرة فقط.
- `fish_tts_save()` أصبح ينتظر `/v1/health` قبل إرسال `/v1/tts`.
- إذا لم يكن Fish شغالًا، يحاول الباكند تشغيله تلقائيًا عبر `/app/start_fish_s2_local_server.sh`.
- طلب Fish أصبح متوافقًا مع الـ API المحلي: `text`, `reference_audio`, `reference_text` فقط.

## متغيرات البيئة المهمة

```bash
OCD_START_FISH_SERVER=1
OCD_WAIT_FOR_FISH_BEFORE_WORKER=1
OCD_AUTOSTART_FISH_ON_PRO=1
OCD_FISH_STARTUP_TIMEOUT_SEC=900
OCD_FISH_LOCAL_URL=http://127.0.0.1:8080/v1/tts
OCD_FISH_CHECKPOINT_DIR=/runpod-volume/fish-speech/checkpoints/s2-pro
OCD_FISH_DOWNLOAD_WEIGHTS=1
OCD_FISH_USE_HALF=1
OCD_FISH_USE_COMPILE=0
OCD_FISH_WORKERS=1
```

## اختبار Fish داخل worker

من لوج RunPod يجب أن ترى:

```text
[OCD] Starting Fish S2-Pro local server in background...
[OCD][Fish] Downloading fishaudio/s2-pro weights...
[OCD][Fish] Starting local S2-Pro API server on 127.0.0.1:8080
[OCD] Fish local server is ready
```

إذا فشل، افتح لوج:

```bash
/tmp/ocd_fish_server.log
```

## ملاحظة RTX 3090

Fish S2-Pro يحتاج VRAM كبيرة، والوثائق الرسمية توصي بـ 24GB تقريبًا لـ S2، لذلك RTX 3090 مناسب نظريًا لكنه قريب من الحد الأعلى. إذا ظهر CUDA OOM، خفف طول الجمل أو استخدم `--half` وهو مفعل افتراضيًا.
