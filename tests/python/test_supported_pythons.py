"""Hold `requires-python` to the interpreters CI actually runs the suite on.

The upper bound in pyproject.toml is a claim that ships in the wheel's metadata:
every Python it admits is one the suite has run on. `uv sync --locked` only
catches half of a mismatch -- a matrix entry the cap refuses fails to install --
while a cap that admits a version no matrix entry runs, or a matrix entry
removed under an unchanged cap, installs cleanly everywhere and passes. This
closes that direction by comparing the two files directly.
"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent.parent
PYPROJECT = ROOT / "pyproject.toml"
CI_WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"

_CLAUSE = re.compile(r"(>=|<)3\.(\d+)")
_VERSION = re.compile(r"3\.(\d+)")


def _admitted_minors() -> set[int]:
    """Expand `>=3.A,<3.B` into the minors it admits, refusing any other shape.

    A different specifier (`~=`, a patch version, no upper bound) is not wrong in
    itself, but this comparison would no longer mean anything, so it fails loudly
    rather than pass on a guess.
    """
    spec = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))["project"]["requires-python"]
    bounds: dict[str, int] = {}
    for clause in spec.split(","):
        match = _CLAUSE.fullmatch(clause.strip())
        assert match is not None, f"unexpected requires-python clause {clause!r} in {spec!r}"
        bounds[match.group(1)] = int(match.group(2))
    assert set(bounds) == {">=", "<"}, f"requires-python {spec!r} is not `>=3.A,<3.B`"
    return set(range(bounds[">="], bounds["<"]))


def _tested_minors() -> set[int]:
    workflow = yaml.safe_load(CI_WORKFLOW.read_text(encoding="utf-8"))
    matrix = workflow["jobs"]["python-tests"]["strategy"]["matrix"]
    versions = [*matrix.get("python", []), *(e["python"] for e in matrix.get("include", []))]
    minors: set[int] = set()
    for version in versions:
        # Unquoted, YAML reads 3.10 as the float 3.1, which would run the wrong
        # interpreter, so a non-string is refused rather than coerced.
        assert isinstance(version, str), f"quote python version {version!r} in ci.yml"
        match = _VERSION.fullmatch(version)
        assert match is not None, f"python-tests names {version!r}, not a `3.N` minor"
        minors.add(int(match.group(1)))
    return minors


def _names(minors: set[int]) -> str:
    return ", ".join(f"3.{minor}" for minor in sorted(minors))


def test_requires_python_admits_exactly_the_interpreters_ci_tests() -> None:
    admitted = _admitted_minors()
    tested = _tested_minors()
    assert admitted == tested, (
        f"requires-python admits {_names(admitted)} but python-tests runs {_names(tested)}; "
        "move the cap and the matrix together"
    )
