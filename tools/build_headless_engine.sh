#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$ROOT_DIR/.deps/BambuStudio-src}"
DEPS_DIR="${DEPS_DIR:-$ROOT_DIR/.deps/BambuStudio-deps}"
BUILD_DIR="${BUILD_DIR:-$ROOT_DIR/.build/bambu-headless}"
INSTALL_DIR="${INSTALL_DIR:-$ROOT_DIR/.build/bambu-install}"
RUNTIME_DIR="${RUNTIME_DIR:-$ROOT_DIR/engine/runtime/headless}"
ARCH="${ARCH:-arm64}"
JOBS="${JOBS:-$(sysctl -n hw.ncpu)}"

usage() {
  cat <<EOF
Build a headless BambuStudio runtime from source, then package it for Swapmod.

Environment overrides:
  SOURCE_DIR   Source checkout path      (default: $SOURCE_DIR)
  DEPS_DIR     Built dependency prefix    (default: $DEPS_DIR)
  BUILD_DIR    CMake build directory      (default: $BUILD_DIR)
  INSTALL_DIR  CMake install directory    (default: $INSTALL_DIR)
  RUNTIME_DIR  Packaged runtime output    (default: $RUNTIME_DIR)
  ARCH         arm64 or x86_64            (default: $ARCH)
  JOBS         Parallel build jobs        (default: $JOBS)

Expected source:
  git clone https://github.com/bambulab/BambuStudio "$SOURCE_DIR"

This script follows the official BambuStudio macOS build guide and then trims the
result into a minimal headless runtime for Swapmod.
EOF
}

if [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Missing source checkout: $SOURCE_DIR" >&2
  echo "Clone the official repo first, then rerun this script." >&2
  exit 2
fi

OPENSSL_ARCH="darwin64-arm64-cc"
if [ "$ARCH" = "x86_64" ]; then
  OPENSSL_ARCH="darwin64-x86_64-cc"
fi

mkdir -p "$DEPS_DIR" "$BUILD_DIR" "$INSTALL_DIR"

echo "==> Building BambuStudio dependencies"
mkdir -p "$SOURCE_DIR/deps/build"
(
  cd "$SOURCE_DIR/deps/build"
  cmake ../ -DDESTDIR="$DEPS_DIR" -DOPENSSL_ARCH="$OPENSSL_ARCH"
  cmake --build . -j"$JOBS"
)

echo "==> Building BambuStudio"
mkdir -p "$BUILD_DIR"
(
  cd "$BUILD_DIR"
  cmake "$SOURCE_DIR" \
    -DBBL_RELEASE_TO_PUBLIC=1 \
    -DCMAKE_PREFIX_PATH="$DEPS_DIR/usr/local" \
    -DCMAKE_INSTALL_PREFIX="$INSTALL_DIR" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_MACOSX_RPATH=ON \
    -DCMAKE_INSTALL_RPATH="$DEPS_DIR/usr/local" \
    -DCMAKE_MACOSX_BUNDLE=on
  cmake --build . --target install --config Release -j"$JOBS"
)

echo "==> Packaging headless runtime"
"$ROOT_DIR/tools/package_headless_runtime.sh" "$INSTALL_DIR" "$RUNTIME_DIR"

echo "==> Done"
echo "Runtime available at:"
echo "  $RUNTIME_DIR"
