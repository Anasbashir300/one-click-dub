import runpod
from serverless_handler import handler

runpod.serverless.start({"handler": handler})
