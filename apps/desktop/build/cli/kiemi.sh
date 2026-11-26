#!/bin/sh
# Kiemi CLI (X-04): runs the app's own Electron as plain Node, no window.
# This file sits in Kiemi.app/Contents/Resources/cli/.
DIR="$(cd "$(dirname "$0")" && pwd)"
RES="$DIR/.."
ELECTRON_RUN_AS_NODE=1 KIEMI_CLI="$DIR/kiemi.sh" exec "$RES/../MacOS/Kiemi" "$RES/app.asar/out/main/cli.js" "$@"
