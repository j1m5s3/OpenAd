"""Run slither-vyper when installed. Exit 0 if slither is missing (local/dev)."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    slither = shutil.which("slither")
    if slither is None:
        print("slither not installed; skip (pip install slither-analyzer)", file=sys.stderr)
        return 0
    cmd = [
        slither,
        str(ROOT / "src"),
        "--fail-pedantic",
        "--exclude-dependencies",
    ]
    print(" ".join(cmd))
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
