"""Runs the official `mojxml2geojson` CLI over every extracted chizu XML file.

We shell out to the documented CLI entrypoint rather than importing
mojxml2geojson's internal modules, to avoid depending on unversioned
internal APIs.
"""

from __future__ import annotations

import subprocess
from pathlib import Path


def convert_all(raw_dir: Path, force: bool = False) -> None:
    if not raw_dir.is_dir():
        print(f"[convert] raw dir not found, nothing to do: {raw_dir}")
        return

    xml_paths = sorted(raw_dir.glob("*/extracted/**/*.xml"))
    if not xml_paths:
        print(f"[convert] no extracted XML files found under: {raw_dir}")
        return

    for xml_path in xml_paths:
        convert_one(xml_path, force=force)


def convert_one(xml_path: Path, force: bool = False) -> None:
    geojson_path = xml_path.with_suffix(".geojson")
    if geojson_path.exists() and not force:
        print(f"[convert] skip (exists): {geojson_path.name}")
        return

    print(f"[convert] {xml_path.name}")
    result = subprocess.run(
        ["mojxml2geojson", "-e", str(xml_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        print(f"[convert] FAILED: {xml_path.name}")
        print(result.stderr, end="")
        return
