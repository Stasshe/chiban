"""Extracts municipality zip archives placed under raw/<municipality>/*.zip.

Idempotent: a municipality whose extracted/ directory already exists is
skipped, so re-running `chiban-convert extract` after adding a new
municipality only does incremental work.
"""

from __future__ import annotations

import zipfile
from pathlib import Path


def extract_all(raw_dir: Path) -> None:
    """Extracts every *.zip found directly under each raw/<municipality>/ folder."""
    if not raw_dir.is_dir():
        print(f"[extract] raw dir not found, nothing to do: {raw_dir}")
        return

    for municipality_dir in sorted(raw_dir.iterdir()):
        if not municipality_dir.is_dir():
            continue
        extract_municipality(municipality_dir)


def extract_municipality(municipality_dir: Path) -> None:
    extracted_dir = municipality_dir / "extracted"
    if extracted_dir.exists():
        print(f"[extract] skip (already extracted): {municipality_dir.name}")
        return

    zip_paths = sorted(municipality_dir.glob("*.zip"))
    if not zip_paths:
        print(f"[extract] no zip files in: {municipality_dir}")
        return

    extracted_dir.mkdir(parents=True, exist_ok=True)
    for zip_path in zip_paths:
        print(f"[extract] {zip_path.name} -> {extracted_dir}")
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(extracted_dir)
