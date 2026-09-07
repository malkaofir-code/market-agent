#!/usr/bin/env python3
"""Every line of one reel, from ONE model load.

The first narrated reel spent ten minutes and forty-one seconds here
and was killed by the job timeout. Not synthesis — loading. Piper was
being invoked once per line, and each invocation read the whole 60MB
model back off disk and rebuilt the onnxruntime session before saying
a nine-word sentence. Six scenes, six full loads, on a two-core
runner.

So: load once, say everything, exit. Reads a JSON list of
{"text","out"} on stdin and writes each wav. A line that will not
synthesise is reported and skipped rather than taking the other five
down with it — a reel missing one narration is still a reel.
"""
import json
import sys
import wave

from piper import PiperVoice
from piper.config import SynthesisConfig


def main() -> int:
    req = json.load(sys.stdin)
    model = req["model"]
    lines = req["lines"]
    length = float(req.get("length_scale") or 1.0)

    voice = PiperVoice.load(model)
    cfg = SynthesisConfig(length_scale=length)

    done = []
    for item in lines:
        text, out = item.get("text"), item.get("out")
        if not text or not out:
            done.append(None)
            continue
        try:
            with wave.open(out, "wb") as wav:
                voice.synthesize_wav(text, wav, syn_config=cfg)
            done.append(out)
        except Exception as e:                      # noqa: BLE001
            print(f"line failed: {e}", file=sys.stderr)
            done.append(None)

    json.dump(done, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
