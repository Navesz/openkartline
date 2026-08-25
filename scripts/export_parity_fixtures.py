#!/usr/bin/env python3
# Purpose: regenerate the engine-parity result fixtures consumed by the web app's
# `engineParity.test.ts`. The request fixtures (`parity-request-*.json`) are exported
# by the web test suite (OKL_UPDATE_PARITY=1) through the exact `toApiRequest`
# adapter the client uses, so both engines are compared on byte-identical inputs.
#
# Usage:
#   pnpm --filter @openkartline/web exec vitest run src/domain/engine/engineParity.test.ts
#     (with OKL_UPDATE_PARITY=1 in the environment to rewrite the request fixtures)
#   uv run python scripts/export_parity_fixtures.py
#   pnpm --filter @openkartline/web exec prettier --write src/domain/engine/__fixtures__
#     (json.dumps writes exponents as `e-05`; prettier stores them as `e-5`, and
#      `pnpm check` runs prettier --check over this directory)
#
# Commit the regenerated `__fixtures__` directory together with any engine change.
# `tests/python/test_parity_fixtures.py` fails if you forget: it holds the engine
# to whatever is committed here, which is the only thing that notices a
# Python-side change that never made it into the fixtures.
"""Run every parity request fixture through the Python engine and record the result."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from openkartline_engine.schemas import SimulationRequestV1
from openkartline_engine.simulation import simulate

FIXTURES_DIR = (
    Path(__file__).resolve().parent.parent
    / "apps"
    / "web"
    / "src"
    / "domain"
    / "engine"
    / "__fixtures__"
)
REQUEST_PATTERN = "parity-request-*.json"


def main() -> int:
    requests = sorted(FIXTURES_DIR.glob(REQUEST_PATTERN))
    if not requests:
        print(f"no request fixtures found in {FIXTURES_DIR}", file=sys.stderr)
        return 1
    for request_path in requests:
        slug = request_path.name.removeprefix("parity-request-").removesuffix(".json")
        request = SimulationRequestV1.model_validate_json(request_path.read_text(encoding="utf-8"))
        result = simulate(request)
        result_path = FIXTURES_DIR / f"parity-result-{slug}.json"
        # newline="" keeps the LF the repo stores (.gitattributes pins eol=lf).
        # The default translation emits CRLF on Windows, so regenerating there
        # rewrote all ten fixtures and failed `prettier --check`.
        with result_path.open("w", encoding="utf-8", newline="") as handle:
            handle.write(json.dumps(result.model_dump(mode="json"), indent=2) + "\n")
        summary = result.summary
        lap = f"{summary.lap_time_s:.4f} s" if summary else "no summary"
        print(f"{slug}: {result.status.state} ({result.status.code}), lap {lap}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
