#!/usr/bin/env bash
# Compila el APK de Lucca: la web en modo app (con el servidor dentro), Capacitor y Gradle.
#   LUCCA_KEYSTORE=/ruta/lucca.jks LUCCA_KEYSTORE_PASSWORD=… scripts/build-apk.sh   → APK firmado (release)
#   scripts/build-apk.sh                                                         → APK de prueba (debug)
# Requisitos: Node 22, JDK 17+ y el SDK de Android (ANDROID_HOME). Deja el APK en lucca/dist/lucca.apk.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

npm run build -w @lucca/web -- --mode app
(cd packages/web && npx cap sync android)

cd packages/web/android
if [ -n "${LUCCA_KEYSTORE:-}" ]; then
  ./gradlew assembleRelease --no-daemon -q
  APK=app/build/outputs/apk/release/app-release.apk
else
  echo "Sin LUCCA_KEYSTORE: APK de prueba (no se podrá actualizar encima de uno firmado)." >&2
  ./gradlew assembleDebug --no-daemon -q
  APK=app/build/outputs/apk/debug/app-debug.apk
fi
mkdir -p "$ROOT/dist"
cp "$APK" "$ROOT/dist/lucca.apk"
echo "APK: $ROOT/dist/lucca.apk"
