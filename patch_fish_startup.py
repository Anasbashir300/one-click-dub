#!/usr/bin/env python3
"""
One Click Dub - Fish Speech startup patch for RunPod Serverless.

Purpose:
1) Disable Fish Speech API warm-up. The current s1-mini/openaudio startup can crash
   during warm-up when `tokenizer` is None and warm_up calls inference("Hello world.").
2) Disable prompt-structure visualization. The observed crash happens in:
   conversation.visualize -> content_sequence.visualize -> encode(tokenizer=None).
   Visualization is only logging/debug output; disabling it should not be required for audio synthesis.

The patch is applied at container startup after Fish Speech is installed/cloned and before
`tools.api_server` is launched. It is intentionally text-based because Fish Speech main changes often.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(os.environ.get("FISH_SPEECH_ROOT", "/app/fish-speech"))


def _backup_once(path: Path) -> None:
    backup = path.with_suffix(path.suffix + ".ocd_bak")
    if not backup.exists():
        backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")


def patch_warmup_call(path: Path) -> bool:
    if not path.exists():
        print(f"[OCD PATCH] missing: {path}", flush=True)
        return False
    text = path.read_text(encoding="utf-8")
    if "OCD_PATCH_DISABLE_WARMUP" in text:
        print(f"[OCD PATCH] warmup already patched: {path}", flush=True)
        return True

    # Disable any line like: self.warm_up(self.tts_inference_engine)
    pattern = re.compile(r"^(?P<indent>\s*)self\.warm_up\((?P<args>[^\n]*)\)\s*$", re.MULTILINE)
    if not pattern.search(text):
        print(f"[OCD PATCH] warm_up call not found in: {path}", flush=True)
        return False

    def repl(m: re.Match[str]) -> str:
        indent = m.group("indent")
        original = m.group(0).strip()
        return (
            f"{indent}# OCD_PATCH_DISABLE_WARMUP: disabled serverless startup warm-up.\n"
            f"{indent}print('[OCD PATCH] Fish warm_up disabled at startup', flush=True)\n"
            f"{indent}# original: {original}"
        )

    _backup_once(path)
    path.write_text(pattern.sub(repl, text, count=1), encoding="utf-8")
    print(f"[OCD PATCH] disabled Fish warm_up in {path}", flush=True)
    return True


def patch_method_return(path: Path, method_name: str, message: str) -> bool:
    """Insert an early return into a method/function by name.

    Handles multi-line function signatures by inserting after the line ending with ':'
    once the `def method_name(` block begins.
    """
    if not path.exists():
        print(f"[OCD PATCH] missing: {path}", flush=True)
        return False
    text = path.read_text(encoding="utf-8")
    marker = f"OCD_PATCH_DISABLE_{method_name.upper()}"
    if marker in text:
        print(f"[OCD PATCH] {method_name} already patched: {path}", flush=True)
        return True

    lines = text.splitlines(keepends=True)
    out: list[str] = []
    in_def = False
    def_indent = ""
    inserted = False

    for line in lines:
        out.append(line)
        if not in_def:
            m = re.match(rf"^(?P<indent>\s*)def\s+{re.escape(method_name)}\s*\(", line)
            if m:
                in_def = True
                def_indent = m.group("indent")
                if line.rstrip().endswith(":"):
                    body_indent = def_indent + "    "
                    out.append(f"{body_indent}# {marker}: disabled for RunPod Serverless stability.\n")
                    out.append(f"{body_indent}print({message!r}, flush=True)\n")
                    out.append(f"{body_indent}return None\n")
                    inserted = True
                    in_def = False
            continue

        # For multi-line signatures, insert after the final ':' line.
        if in_def and line.rstrip().endswith(":"):
            body_indent = def_indent + "    "
            out.append(f"{body_indent}# {marker}: disabled for RunPod Serverless stability.\n")
            out.append(f"{body_indent}print({message!r}, flush=True)\n")
            out.append(f"{body_indent}return None\n")
            inserted = True
            in_def = False

    if not inserted:
        print(f"[OCD PATCH] def {method_name}(...) not found in: {path}", flush=True)
        return False

    _backup_once(path)
    path.write_text("".join(out), encoding="utf-8")
    print(f"[OCD PATCH] disabled {method_name} in {path}", flush=True)
    return True


def main() -> int:
    print(f"[OCD PATCH] Fish root: {ROOT}", flush=True)
    ok_any = False

    # 1) Stop the startup crash path: ModelManager.__init__ -> warm_up().
    ok_any |= patch_warmup_call(ROOT / "tools/server/model_manager.py")

    # 2) Stop the tokenizer=None visualization crash path during warmup or future generation logs.
    ok_any |= patch_method_return(
        ROOT / "fish_speech/conversation.py",
        "visualize",
        "[OCD PATCH] conversation.visualize disabled",
    )
    ok_any |= patch_method_return(
        ROOT / "fish_speech/content_sequence.py",
        "visualize",
        "[OCD PATCH] content_sequence.visualize disabled",
    )

    # Print quick confirmation for logs.
    for rel in [
        "tools/server/model_manager.py",
        "fish_speech/conversation.py",
        "fish_speech/content_sequence.py",
    ]:
        path = ROOT / rel
        if path.exists():
            txt = path.read_text(encoding="utf-8", errors="ignore")
            markers = [m for m in ["OCD_PATCH_DISABLE_WARMUP", "OCD_PATCH_DISABLE_VISUALIZE"] if m in txt]
            print(f"[OCD PATCH] {rel}: markers={markers}", flush=True)

    if not ok_any:
        print("[OCD PATCH] WARNING: no patch was applied. Fish source layout may have changed.", flush=True)
        return 0
    print("[OCD PATCH] Fish startup patch finished.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
