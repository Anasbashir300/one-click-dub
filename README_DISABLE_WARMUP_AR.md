# إصلاح Pro Fish Speech - تعطيل Warmup و Visualization

هذا الإصلاح يستهدف الخطأ:

```text
AttributeError: 'NoneType' object has no attribute 'encode'
```

السبب في اللوج كان:

```text
ModelManager.__init__ -> self.warm_up(...)
warm_up -> inference("Hello world.")
generate_long -> conversation_gen.visualize(...)
content_sequence.visualize -> encode(tokenizer=None)
```

## ماذا يفعل الإصلاح؟

عند بداية تشغيل السيرفر، وقبل تشغيل Fish API، يطبّق سكربت:

```text
patch_fish_startup.py
```

ويقوم بـ:

1. تعطيل `self.warm_up(...)` داخل:

```text
/app/fish-speech/tools/server/model_manager.py
```

2. تعطيل `visualize(...)` داخل:

```text
/app/fish-speech/fish_speech/conversation.py
/app/fish-speech/fish_speech/content_sequence.py
```

هذا يمنع Fish Speech من الموت أثناء startup بسبب tokenizer=None في جزء visualization.

## الملفات التي يجب رفعها إلى GitHub

استبدل ملفات Pro بهذه الملفات:

```text
Dockerfile.pro
start_serverless.sh
requirements_pro.txt
serverless_handler.py
colab_custom_dub_server.py
patch_fish_startup.py
```

الأهم:

```text
start_serverless.sh
patch_fish_startup.py
```

## بعد الرفع

1. Push إلى GitHub.
2. Rebuild للـ Pro Endpoint.
3. Purge Queue.
4. جرّب Job واحد فقط.

## ما يجب أن يظهر في اللوج

```text
[OCD] Applying Fish startup/runtime patches...
[OCD PATCH] disabled Fish warm_up
[OCD PATCH] disabled visualize
[OCD] Fish Speech API is ready.
--- Starting Serverless Worker ---
```

إذا ظهر بعد ذلك خطأ جديد أثناء طلب TTS الحقيقي، أرسل اللوج الجديد.
