#!/usr/bin/env python3
"""Keys cmux-todd-ui's 960 px clips into the website's sharper animated AVIFs.

    scripts/web-art.py [NAME ...]

The app's 112 px agents blur when a page shows them at 128 CSS px on a Retina
display; the site reads these from art/ and falls back to the app's WebPs where
AVIF is missing. Its cast spotlight shows every pose at 384 px. The clips come
from ../cmux-todd-ui, or wherever CMUX_TODD_UI points. Names like
claude-working, cast/claude-idle or whale-idle pick single outputs; with none
it writes them all. Needs ffmpeg with libaom.
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

AGENTS = ["claude", "gpt", "deepseek", "gemini", "grok", "kimi", "opencode", "pi"]
STATES = ["working", "thinking", "needs_input", "sleeping"]
POSES = ["working", "working-research", "working-special", "working-slack", "thinking", "needs_input", "idle", "sleeping"]
AGENT_SIDE = 256
CAST_SIDE = 384
WHALE = {"idle": 400, "working": 192, "puzzled-down": 400}
CRF = 36
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art"
UI = Path(os.environ.get("CMUX_TODD_UI", ROOT.parent / "cmux-todd-ui"))


def save(frames: list, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for i, frame in enumerate(frames):
            frame.save(f"{tmp}/f{i:03d}.png")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-framerate", "12", "-i", f"{tmp}/f%03d.png",
             "-filter_complex", "[0:v]format=yuva420p,split[c][a];[a]alphaextract,format=gray[a]",
             "-map", "[c]", "-map", "[a]", "-c:v", "libaom-av1", "-crf", str(CRF), "-cpu-used", "4",
             "-row-mt", "1", "-pix_fmt:0", "yuv420p", str(target)],
            check=True,
        )
    print(f"{target.relative_to(OUT)}: {len(frames)} frames, {target.stat().st_size // 1024} KB")


def main() -> None:
    if not (UI / "scripts" / "video.py").exists():
        sys.exit(f"web-art: no cmux-todd-ui at {UI}\n{__doc__}")
    sys.path.insert(0, str(UI / "scripts"))
    import video

    jobs = [(f"{agent}-{state}", AGENT_SIDE, OUT / "agents" / f"{agent}-{state}.avif") for agent in AGENTS for state in STATES]
    jobs += [(f"{agent}-{pose}", CAST_SIDE, OUT / "cast" / f"{agent}-{pose}.avif") for agent in AGENTS for pose in POSES]
    jobs += [(f"deepseek-{pose}", side, OUT / "mascot" / f"whale-{pose}.avif") for pose, side in WHALE.items()]
    names = sys.argv[1:]
    only = {name for name in names if "/" in name}
    with tempfile.TemporaryDirectory() as tmp:
        video.OUT = Path(tmp)
        for clip, side, target in jobs:
            if not names or target.stem in names or f"{target.parent.name}/{target.stem}" in only:
                save(video.build(clip, size=side), target)


if __name__ == "__main__":
    main()
