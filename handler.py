"""RunPod Serverless entry point for One Click Dub."""
import runpod
from serverless_handler import handler

runpod.serverless.start({"handler": handler})
