#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


SYSTEM_BAMBU = Path("/Applications/BambuStudio.app/Contents/MacOS/BambuStudio")


def script_dir() -> Path:
    return Path(__file__).resolve().parent


def candidate_runtime_roots(explicit: str | None) -> list[Path]:
    roots: list[Path] = []

    def add(path: Path | None) -> None:
        if not path:
            return
        resolved = path.resolve()
        if resolved not in roots:
            roots.append(resolved)

    if explicit:
        add(Path(explicit))

    env_root = os.environ.get("SWAPMOD_SLICER_RUNTIME")
    if env_root:
        add(Path(env_root))

    support_root = os.environ.get("SWAPMOD_ROOT_DIR")
    if support_root:
        add(Path(support_root) / "engines" / "headless")

    local_tools = script_dir()
    add(local_tools.parent / "engine" / "runtime" / "headless")
    add(local_tools.parent / "dist" / "Swapmod Local.app" / "Contents" / "Resources" / "Support" / "engines" / "headless")
    add(local_tools.parent / "Contents" / "Resources" / "Support" / "engines" / "headless")

    return roots


def load_headless_manifest(runtime_root: Path) -> dict | None:
    manifest_path = runtime_root / "engine.json"
    if not manifest_path.is_file():
        return None
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    executable = runtime_root / data.get("executable", "")
    if not executable.is_file():
        return None
    data["_runtime_root"] = str(runtime_root)
    data["_manifest_path"] = str(manifest_path)
    data["_executable_path"] = str(executable)
    return data


def resolve_engine(explicit_runtime_root: str | None, allow_system: bool = True) -> dict:
    for root in candidate_runtime_roots(explicit_runtime_root):
        manifest = load_headless_manifest(root)
        if manifest:
            working_dir = root / manifest.get("working_directory", ".")
            return {
                "mode": "headless",
                "runtime_root": str(root),
                "manifest_path": manifest["_manifest_path"],
                "active_path": manifest["_executable_path"],
                "working_directory": str(working_dir),
                "engine": manifest,
                "has_system": SYSTEM_BAMBU.is_file(),
            }

    if allow_system and SYSTEM_BAMBU.is_file():
        return {
            "mode": "system",
            "runtime_root": "",
            "manifest_path": "",
            "active_path": str(SYSTEM_BAMBU),
            "working_directory": str(SYSTEM_BAMBU.parent),
            "engine": None,
            "has_system": True,
        }

    return {
        "mode": "unavailable",
        "runtime_root": "",
        "manifest_path": "",
        "active_path": "",
        "working_directory": "",
        "engine": None,
        "has_system": SYSTEM_BAMBU.is_file(),
    }


def cmd_status(args: argparse.Namespace) -> int:
    info = resolve_engine(args.runtime_root, allow_system=not args.headless_only)
    payload = {
        "mode": info["mode"],
        "runtime_root": info["runtime_root"],
        "manifest_path": info["manifest_path"],
        "active_path": info["active_path"],
        "working_directory": info["working_directory"],
        "system_path": str(SYSTEM_BAMBU),
        "has_system": info["has_system"],
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
    else:
        for key, value in payload.items():
            print(f"{key}={value}")
    return 0 if info["mode"] != "unavailable" else 1


def cmd_slice(args: argparse.Namespace) -> int:
    info = resolve_engine(args.runtime_root, allow_system=not args.headless_only)
    if info["mode"] == "unavailable":
        print(
            "Aucun moteur de slicing disponible. Construis un runtime headless "
            "ou installe BambuStudio.app dans /Applications.",
            file=sys.stderr,
        )
        return 2

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    output_name = args.output_name or (
        input_path.name[:-4] + ".gcode.3mf" if input_path.name.lower().endswith(".3mf") else input_path.name + ".gcode.3mf"
    )

    cmd = [
        info["active_path"],
        "--slice",
        "0",
        "--outputdir",
        str(output_dir),
        "--export-3mf",
        output_name,
        str(input_path),
    ]

    result = subprocess.run(
        cmd,
        cwd=info["working_directory"] or None,
        text=True,
        capture_output=True,
        env=os.environ.copy(),
    )

    output_path = output_dir / output_name
    payload = {
        "mode": info["mode"],
        "command": cmd,
        "output_path": str(output_path),
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "ok": result.returncode == 0 and output_path.is_file(),
    }

    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
    else:
        if payload["ok"]:
            print(str(output_path))
        else:
            sys.stdout.write(result.stdout)
            sys.stderr.write(result.stderr)

    return 0 if payload["ok"] else 3


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Swapmod slicer CLI wrapper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    status = subparsers.add_parser("status", help="Inspect available slicer engines")
    status.add_argument("--runtime-root", help="Override headless runtime root")
    status.add_argument("--headless-only", action="store_true", help="Do not fallback to the system BambuStudio.app")
    status.add_argument("--json", action="store_true", help="Emit JSON")
    status.set_defaults(func=cmd_status)

    slice_cmd = subparsers.add_parser("slice", help="Slice a 3MF project into a .gcode.3mf")
    slice_cmd.add_argument("--runtime-root", help="Override headless runtime root")
    slice_cmd.add_argument("--headless-only", action="store_true", help="Do not fallback to the system BambuStudio.app")
    slice_cmd.add_argument("--input", required=True, help="Input .3mf project")
    slice_cmd.add_argument("--output-dir", required=True, help="Output directory")
    slice_cmd.add_argument("--output-name", help="Output file name")
    slice_cmd.add_argument("--json", action="store_true", help="Emit JSON")
    slice_cmd.set_defaults(func=cmd_slice)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
