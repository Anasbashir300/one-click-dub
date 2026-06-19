One Click Dub - نسخة Custom Backend بدون pyVideoTrans

ما الجديد؟
- لا تحتاج pyVideoTrans.
- الخادم يعمل بمسار خاص: yt-dlp + ffmpeg + faster-whisper + Smart Chunking + Translate + Edge TTS.
- زر 🎬 Dub في يوتيوب يستخدم endpoint الجديد /api/custom/dub.

التشغيل المختصر في Colab:
1) ارفع الملف colab_custom_dub_server.py إلى /content/colab_custom_dub_server.py
2) ثبّت المتطلبات المذكورة في CUSTOM_BACKEND_COLAB_STEPS.md
3) شغل uvicorn على بورت 8000
4) شغل Cloudflare tunnel
5) ضع رابط Cloudflare في background.js
6) أعد تحميل الإضافة من chrome://extensions


راجع RUNPOD_RTX3090_SETUP_AR.md لتشغيل النسخة على RunPod RTX 3090.
