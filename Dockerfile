# One Click Dub - RunPod Serverless worker
# Supports:
#   fast    = Edge TTS
#   quality = OmniVoice
#   pro     = Fish Speech / OpenAudio S1-mini API on localhost:8080
FROM runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/runpod-volume/.cache/huggingface \
    TRANSFORMERS_CACHE=/runpod-volume/.cache/huggingface \
    XDG_CACHE_HOME=/runpod-volume/.cache \
    OCD_ROOT=/runpod-volume/one-click-dub \
    OCD_JOBS_DIR=/runpod-volume/one-click-dub/jobs \
    OCD_OUTPUTS_DIR=/runpod-volume/one-click-dub/outputs \
    OCD_RUNPOD_SERVERLESS=1 \
    OCD_RUNPOD_MODE=serverless \
    OCD_USE_CATT_TASHKEEL=1 \
    OCD_SAFE_TASHKEEL=1 \
    OCD_USE_PUNCTUATION=1 \
    OCD_TTS_PUNCT_PAUSES=1 \
    OCD_FISH_SPEECH_MODEL=fishaudio/openaudio-s1-mini \
    OCD_FISH_CHECKPOINT_DIR=/runpod-volume/fish-speech/checkpoints/openaudio-s1-mini \
    OCD_FISH_SPEECH_API_URL=http://127.0.0.1:8080/v1/tts \
    OCD_ENABLE_FISH_API=auto \
    PYTHONPATH=/app/fish-speech:/app

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    ffmpeg git git-lfs curl wget unzip ca-certificates nodejs npm \
    build-essential python3-dev pkg-config \
    libsndfile1 libsndfile1-dev \
    portaudio19-dev libportaudio2 libportaudiocpp0 libasound2-dev \
    && git lfs install \
    && rm -rf /var/lib/apt/lists/*

# Deno helps yt-dlp solve newer YouTube EJS/n-challenge cases.
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/root/.deno/bin:${PATH}"

COPY requirements_serverless.txt /app/requirements_serverless.txt
RUN python -m pip install --no-cache-dir --ignore-installed -U pip setuptools packaging wheel \
    && python -m pip install --no-cache-dir -r /app/requirements_serverless.txt \
    && (python -c "import omnivoice; print('omnivoice ok')" || python -m pip install --no-cache-dir git+https://github.com/k2-fsa/OmniVoice.git)

# Fish Speech / OpenAudio self-hosted API for Pro mode.
# We clone the official repo and install it locally. The model weights are downloaded on first
# container start into /runpod-volume so they persist between cold starts when a network volume is used.
ARG FISH_SPEECH_REF=main
RUN git clone --depth=1 --branch ${FISH_SPEECH_REF} https://github.com/fishaudio/fish-speech.git /app/fish-speech \
    && python -m pip install --no-cache-dir -e /app/fish-speech

COPY . /app
COPY start_serverless.sh /app/start_serverless.sh
RUN chmod +x /app/start_serverless.sh

# Serverless worker entry point. The script starts Fish Speech API only when OCD_MODEL=pro
# or OCD_TTS_ENGINE=fish_speech, then starts RunPod handler.py.
CMD ["/app/start_serverless.sh"]
