#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./tools/package_headless_runtime.sh <source-app-or-install-dir> <destination-runtime-dir>

Examples:
  ./tools/package_headless_runtime.sh /Applications/BambuStudio.app \
    /Users/laurent/Documents/swapmod/engine/runtime/headless
EOF
}

if [ "${1:-}" = "" ] || [ "${2:-}" = "" ]; then
  usage
  exit 1
fi

SOURCE_INPUT="$1"
DEST_ROOT="$2"

resolve_source_app() {
  local source="$1"
  if [ -d "$source/Contents/MacOS" ] && [ -d "$source/Contents/Resources" ]; then
    printf '%s\n' "$source"
    return
  fi

  if [ -d "$source/BambuStudio.app/Contents/MacOS" ] && [ -d "$source/BambuStudio.app/Contents/Resources" ]; then
    printf '%s\n' "$source/BambuStudio.app"
    return
  fi

  echo "Unable to locate a BambuStudio.app bundle under: $source" >&2
  exit 2
}

SOURCE_APP="$(resolve_source_app "$SOURCE_INPUT")"
DEST_APP="$DEST_ROOT/BambuStudioHeadless.app"
DEST_CONTENTS="$DEST_APP/Contents"
DEST_MACOS="$DEST_CONTENTS/MacOS"
DEST_RESOURCES="$DEST_CONTENTS/Resources"

RESOURCE_ITEMS=(
  "check_access_code.txt"
  "cert"
  "data"
  "flush"
  "fonts"
  "info"
  "model"
  "printers"
  "profiles"
  "profiles_template"
  "shaders"
)

mkdir -p "$DEST_MACOS" "$DEST_RESOURCES"
rm -rf "$DEST_APP"
mkdir -p "$DEST_MACOS" "$DEST_RESOURCES"

cp "$SOURCE_APP/Contents/MacOS/BambuStudio" "$DEST_MACOS/BambuStudio"
chmod +x "$DEST_MACOS/BambuStudio"

if [ -f "$SOURCE_APP/Contents/Info.plist" ]; then
  cp "$SOURCE_APP/Contents/Info.plist" "$DEST_CONTENTS/Info.plist"
fi

for item in "${RESOURCE_ITEMS[@]}"; do
  if [ -e "$SOURCE_APP/Contents/Resources/$item" ]; then
    cp -R "$SOURCE_APP/Contents/Resources/$item" "$DEST_RESOURCES/$item"
  fi
done

cat > "$DEST_ROOT/engine.json" <<EOF
{
  "engine_name": "BambuStudio Headless",
  "engine_kind": "bambu-headless-bundle",
  "source_bundle": "$(basename "$SOURCE_APP")",
  "app_bundle": "BambuStudioHeadless.app",
  "executable": "BambuStudioHeadless.app/Contents/MacOS/BambuStudio",
  "working_directory": "BambuStudioHeadless.app/Contents/MacOS",
  "resource_groups": [
    "check_access_code.txt",
    "cert",
    "data",
    "flush",
    "fonts",
    "info",
    "model",
    "printers",
    "profiles",
    "profiles_template",
    "shaders"
  ]
}
EOF

if [ -f "$SOURCE_APP/Contents/Resources/Icon.icns" ]; then
  cp "$SOURCE_APP/Contents/Resources/Icon.icns" "$DEST_ROOT/"
fi

echo "Packaged headless runtime:"
echo "  $DEST_ROOT"
du -sh "$DEST_ROOT"
