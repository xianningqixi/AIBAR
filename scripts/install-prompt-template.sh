#!/usr/bin/env bash

set -Eeuo pipefail

readonly EXPECTED_COMMIT='c80a572839f99a2aaf3d91cf9b7ebfc202c4ef0b'
readonly EXPECTED_VERSION='1.17.6.8'

source_dir="${1:?Usage: install-prompt-template.sh SOURCE_DIR SILLYTAVERN_ROOT}"
sillytavern_root="${2:?Usage: install-prompt-template.sh SOURCE_DIR SILLYTAVERN_ROOT}"
target_dir="$sillytavern_root/public/scripts/extensions/third-party/ST-Prompt-Template"

actual_commit="$(git -C "$source_dir" rev-parse HEAD)"
if [[ "$actual_commit" != "$EXPECTED_COMMIT" ]]; then
    echo "Unexpected Prompt Template commit: $actual_commit" >&2
    exit 1
fi

node - "$source_dir/manifest.json" "$EXPECTED_VERSION" <<'NODE'
const fs = require('node:fs');

const [manifestPath, expectedVersion] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.version !== expectedVersion) {
    throw new Error(`Unexpected Prompt Template version: ${manifest.version}`);
}
if (manifest.js !== 'dist/index.js' || manifest.css !== '') {
    throw new Error('Unexpected Prompt Template runtime entry points');
}
if (
    manifest.homePage !== 'https://github.com/zonde306/ST-Prompt-Template'
    || manifest.loading_order !== 1
    || manifest.auto_update !== true
) {
    throw new Error('Unexpected Prompt Template release metadata');
}
NODE

for required_path in \
    manifest.json \
    dist/index.js \
    locales \
    src \
    package.json \
    package-lock.json \
    LICENSE
do
    if [[ ! -e "$source_dir/$required_path" ]]; then
        echo "Missing Prompt Template runtime path: $required_path" >&2
        exit 1
    fi
done

if [[ -e "$target_dir" ]]; then
    echo "Refusing to overwrite existing Prompt Template runtime: $target_dir" >&2
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
    throw new Error('Installed Prompt Template manifest failed validation');
}
NODE

test -s "$target_dir/dist/index.js"

echo "Installed Prompt Template $EXPECTED_VERSION from $EXPECTED_COMMIT"
