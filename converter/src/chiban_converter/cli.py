"""Command-line entrypoint: `chiban-convert {extract,convert,merge,index,all}`.

Default paths are resolved relative to this package's own location (not
the current working directory), so `chiban-convert` behaves the same
whether it's invoked from the repository root or from converter/.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from . import boundaries as boundaries_module
from . import build_index as build_index_module
from . import convert as convert_module
from . import extract as extract_module
from . import merge as merge_module

_PACKAGE_DIR = Path(__file__).resolve().parent
_CONVERTER_ROOT = _PACKAGE_DIR.parent.parent
_REPO_ROOT = _CONVERTER_ROOT.parent

DEFAULT_RAW_DIR = _CONVERTER_ROOT / "raw"
DEFAULT_OUT_DIR = _REPO_ROOT / "frontend" / "public" / "data"


def _add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=DEFAULT_RAW_DIR,
        help=f"directory containing raw/<municipality>/*.zip (default: {DEFAULT_RAW_DIR})",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help=f"frontend data output directory (default: {DEFAULT_OUT_DIR})",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="chiban-convert")
    subparsers = parser.add_subparsers(dest="command", required=True)

    extract_parser = subparsers.add_parser("extract", help="unzip raw/<municipality>/*.zip")
    _add_common_args(extract_parser)

    convert_parser = subparsers.add_parser("convert", help="run mojxml2geojson over extracted XML")
    _add_common_args(convert_parser)
    convert_parser.add_argument(
        "--force", action="store_true", help="reconvert even if a .geojson output already exists"
    )

    merge_parser = subparsers.add_parser("merge", help="sort/merge GeoJSON into frontend/public/data")
    _add_common_args(merge_parser)

    index_parser = subparsers.add_parser("index", help="(re)generate index.json")
    _add_common_args(index_parser)

    all_parser = subparsers.add_parser("all", help="run extract, convert, merge, index in sequence")
    _add_common_args(all_parser)
    all_parser.add_argument(
        "--force", action="store_true", help="reconvert even if a .geojson output already exists"
    )

    boundaries_parser = subparsers.add_parser(
        "boundaries",
        help="convert raw/boundaries/<city_code>.zip shapefiles into frontend/public/data/boundaries + index.json",
    )
    _add_common_args(boundaries_parser)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "extract":
        extract_module.extract_all(args.raw_dir)
    elif args.command == "convert":
        convert_module.convert_all(args.raw_dir, force=args.force)
    elif args.command == "merge":
        merge_module.merge_all(args.raw_dir, args.out_dir)
    elif args.command == "index":
        build_index_module.build_index(args.out_dir)
    elif args.command == "all":
        extract_module.extract_all(args.raw_dir)
        convert_module.convert_all(args.raw_dir, force=args.force)
        merge_module.merge_all(args.raw_dir, args.out_dir)
        build_index_module.build_index(args.out_dir)
    elif args.command == "boundaries":
        boundaries_module.convert_all_boundaries(args.raw_dir, args.out_dir)
        boundaries_module.build_boundaries_index(args.out_dir)


if __name__ == "__main__":
    main()
