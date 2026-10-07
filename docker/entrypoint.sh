#!/bin/sh
# Starts Kindo. Migrations are NOT applied here: they run once in the separate
# `migrate` service, which the app waits for (BrewCore/NutriCore pattern).
set -eu
echo "Starting Kindo ${KINDO_VERSION:-dev}..."
exec node server.js
