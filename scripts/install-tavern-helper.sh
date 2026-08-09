#!/usr/bin/env bash

set -Eeuo pipefail

readonly EXPECTED_COMMIT='69ac6804cf0b2f060ca99c1db64aea6e00da39ee'
readonly EXPECTED_VERSION='4.9.1'

source_dir="${1:?Usage: install-tavern-helper.sh SOURCE_DIR SILLYTAVERN_ROOT}"
sillytavern_root="${2:?Usage: install-tavern-helper.sh SOURCE_DIR SILLYTAVERN_ROOT}"
target_dir="$sillytavern_root/public/scripts/extensions/third-party/JS-Slash-Runner"

actual_commit="$(git -C "$source_dir" rev-parse HEAD)"
if [[ "$actual_commit" != "$EXPECTED_COMMIT" ]]; then
    echo "Unexpected TavernHelper commit: $actual_commit" >&2
    exit 1
fi

node - "$source_dir/manifest.json" "$EXPECTED_VERSION" <<'NODE'
const fs = require('node:fs');

const [manifestPath, expectedVersion] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.version !== expectedVersion) {
    throw new Error(`Unexpected TavernHelper version: ${manifest.version}`);
}
if (manifest.js !== 'dist/index.js' || manifest.css !== 'dist/index.css') {
    throw new Error('Unexpected TavernHelper runtime entry points');
}
if (
    manifest.homePage !== 'https://github.com/N0VI028/JS-Slash-Runner'
    || manifest.minimum_client_version !== '1.12.13'
    || manifest.loading_order !== 100
) {
    throw new Error('Unexpected TavernHelper compatibility metadata');
}
NODE

for required_path in \
    manifest.json \
    dist/index.js \
    dist/index.css \
    lib \
    i18n \
    src \
    LICENSE
do
    if [[ ! -e "$source_dir/$required_path" ]]; then
        echo "Missing TavernHelper runtime path: $required_path" >&2
        exit 1
    fi
done

if [[ -e "$target_dir" ]]; then
    echo "Refusing to overwrite existing TavernHelper runtime: $target_dir" >&2
    exit 1
fi

install -d -m 0755 "$target_dir"
git -C "$source_dir" archive --format=tar "$EXPECTED_COMMIT" | tar -xf - -C "$target_dir"

printf '%s\n' "$EXPECTED_COMMIT" > "$target_dir/.aibar-source-commit"

node - "$target_dir/manifest.json" "$EXPECTED_VERSION" <<'NODE'
const fs = require('node:fs');

const [manifestPath, expectedVersion] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.version !== expectedVersion) {
    throw new Error('Installed TavernHelper manifest failed validation');
}
NODE

test -s "$target_dir/dist/index.js"
test -s "$target_dir/dist/index.css"

echo "Installed TavernHelper $EXPECTED_VERSION from $EXPECTED_COMMIT"
