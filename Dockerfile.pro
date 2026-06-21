# One Click Dub Pro endpoint - Latest Fish Speech from GitHub main.
FROM runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/runpod-volume/.cache/huggingface \
    TRANSFORMERS_CACHE=/runpod-volume/.cache/huggingface \
    XDG_CACHE_HOME=/runpod-volume/.cache \
    HF_HUB_ENABLE_HF_TRANSFER=0 \
    OCD_ROOT=/runpod-volume/one-click-dub \
    OCD_JOBS_DIR=/runpod-volume/one-click-dub/jobs \
    OCD_OUTPUTS_DIR=/runpod-volume/one-click-dub/outputs \
    OCD_RUNPOD_SERVERLESS=1 \
    OCD_RUNPOD_MODE=serverless \
    OCD_MODEL=pro \
    OCD_ENDPOINT_MODEL=pro \
    OCD_TTS_ENGINE=fish_speech \
    OCD_TRANSLATION_ENGINE=nllb200 \
    OCD_USE_CATT_TASHKEEL=1 \
    OCD_SAFE_TASHKEEL=1 \
    OCD_USE_PUNCTUATION=1 \
    OCD_TTS_PUNCT_PAUSES=1 \
    OCD_FISH_SPEECH_MODEL=fishaudio/openaudio-s1-mini \
    OCD_FISH_CHECKPOINT_DIR=/runpod-volume/fish-speech/checkpoints/openaudio-s1-mini \
    OCD_FISH_SPEECH_API_URL=http://127.0.0.1:8080/v1/tts \
    OCD_ENABLE_FISH_API=1 \
    PYTHONPATH=/app/fish-speech:/app

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    ffmpeg git git-lfs curl wget unzip ca-certificates nodejs npm libsndfile1 \
    && git lfs install \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/root/.deno/bin:${PATH}"

COPY requirements_pro.txt /app/requirements_pro.txt
RUN python -m pip install --no-cache-dir --ignore-installed -U pip setuptools packaging wheel \
    && python -m pip install --no-cache-dir -r /app/requirements_pro.txt

# Force Docker/RunPod to pull the newest Fish Speech main instead of reusing an old cached clone layer.
ARG FISH_SPEECH_REF=main
ARG FISH_SPEECH_CACHE_BUST=2026-06-21-latest-main-v2
RUN echo "Fish Speech cache bust: ${FISH_SPEECH_CACHE_BUST}" \
    && rm -rf /app/fish-speech \
    && git clone --depth=1 --branch ${FISH_SPEECH_REF} https://github.com/fishaudio/fish-speech.git /app/fish-speech \
    && cd /app/fish-speech \
    && git rev-parse HEAD | tee /app/FISH_SPEECH_COMMIT.txt \
    && python -m pip install --no-cache-dir -U -e /app/fish-speech

# Optional experimental switch: set build arg INSTALL_TRANSFORMERS_MAIN=1 only if Fish complains that
# Transformers does not recognize a very new architecture. Disabled by default for stability.
ARG INSTALL_TRANSFORMERS_MAIN=0
RUN if [ "${INSTALL_TRANSFORMERS_MAIN}" = "1" ]; then \
      python -m pip install --no-cache-dir -U "transformers @ git+https://github.com/huggingface/transformers.git"; \
    fi

COPY . /app
COPY start_serverless.sh /app/start_serverless.sh
RUN chmod +x /app/start_serverless.sh

CMD ["/app/start_serverless.sh"]
