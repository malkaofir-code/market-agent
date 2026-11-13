#!/usr/bin/env python3
"""Every line of one reel, in Hebrew.

Piper has no Hebrew voice. edge-tts speaks it well (he-IL-AvriNeural)
and needs no key; it is a network call, so every line is on a clock
and a line that fails is skipped — a reel missing one narration is
still a reel, and a reel with none goes out with the bed alone.

Reads {"voice","rate","lines":[{"text","out"}]} from the path in argv
and prints the list of files written (null where there is none).
"""
import asyncio
import json
import subprocess
import sys

import edge_tts


async def one(text, out, voice, rate):
    mp3 = out + ".mp3"
    await asyncio.wait_for(edge_tts.Communicate(text, voice, rate=rate).save(mp3), timeout=25)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp3, "-ar", "44100", "-ac", "1", out],
                   check=True, timeout=30)
    return out


async def main() -> int:
    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        req = json.load(fh)
    voice = req.get("voice") or "he-IL-AvriNeural"
    rate = req.get("rate") or "+6%"
    done = []
    for item in req["lines"]:
        text, out = item.get("text"), item.get("out")
        if not text or not out:
            done.append(None)
            continue
        try:
            done.append(await one(text, out, voice, rate))
        except Exception as e:                      # noqa: BLE001
            print(f"line failed: {e}", file=sys.stderr)
            done.append(None)
    json.dump(done, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
