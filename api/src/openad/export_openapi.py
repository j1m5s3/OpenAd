"""Print the FastAPI OpenAPI document as JSON (web OpenAPI client, ROADMAP 3.5)."""

from __future__ import annotations

import json
import sys

from openad.main import create_app


def main() -> None:
    json.dump(create_app().openapi(), sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
