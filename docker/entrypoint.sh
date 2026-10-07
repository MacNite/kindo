#!/bin/sh
# Starts Kindo. Later, migrations will run in a separate one-shot `migrate`
# service that the app waits for (BrewCore/NutriCore pattern), never here.
set -eu
echo "Starting Kindo ${KINDO_VERSION:-dev}..."
exec node server.js
