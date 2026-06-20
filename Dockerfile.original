# One Click Dub - RunPod Serverless worker
# This base matches modern RunPod PyTorch CUDA images. If your account uses another official
# RunPod PyTorch tag, replace this FROM line with the same tag you use successfully in Pods.
FROM runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/runpod-volume/.cache/huggingface \
    TRANSFORMERS_CACHE=/runpod-volume/.cache/huggingface \
    XDG_CACHE_HOME=/runpod-volume/.cache \
    OCD_ROOT=/runpod-volume/one-click-dub \
    OCD_RUNPOD_SERVERLESS=1

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    ffmpeg git curl wget unzip ca-certificates nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Deno helps yt-dlp solve newer YouTube EJS/n-challenge cases.
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/root/.deno/bin:${PATH}"

COPY requirements_serverless.txt /app/requirements_serverless.txt
RUN python -m pip install --no-cache-dir --ignore-installed -U pip setuptools packaging wheel \
    && python -m pip install --no-cache-dir -r /app/requirements_serverless.txt \
    && (python -c "import omnivoice; print('omnivoice ok')" || python -m pip install --no-cache-dir git+https://github.com/k2-fsa/OmniVoice.git)

COPY . /app

# Serverless worker entry point.
CMD ["python", "-u", "handler.py"]
