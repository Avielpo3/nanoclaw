#!/bin/bash
# Launch Chrome with Chrome DevTools Protocol enabled
# Usage: ./scripts/launch-chrome.sh

CDP_PORT=9222

# Check if CDP is already listening
if lsof -i :"$CDP_PORT" >/dev/null 2>&1; then
  echo "Port $CDP_PORT is already in use. Chrome may already be running with CDP."
  echo "To verify: curl -s http://localhost:$CDP_PORT/json/version"
  exit 0
fi

# Check if Chrome is running without CDP
if pgrep -x "Google Chrome" >/dev/null 2>&1; then
  echo "Chrome is running but without CDP enabled."
  echo "Please quit Chrome first, then re-run this script."
  exit 1
fi

CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -f "$CHROME_APP" ]; then
  echo "Chrome not found at: $CHROME_APP"
  exit 1
fi

# Chrome requires a non-default --user-data-dir for remote debugging.
# On first run we rsync the real profile so you keep all Google sessions/cookies.
# After that, this profile lives independently (sign-in syncs new changes).
DEFAULT_PROFILE="$HOME/Library/Application Support/Google/Chrome"
USER_DATA_DIR="$HOME/.chrome-cdp-profile"

if [ ! -d "$USER_DATA_DIR/Default" ] && [ -d "$DEFAULT_PROFILE/Default" ]; then
  echo "First run: copying Chrome profile for CDP (keeps your Google sessions)..."
  mkdir -p "$USER_DATA_DIR"
  # Copy the Default profile and key files; skip heavy caches
  rsync -a --exclude='Cache*' --exclude='Service Worker' --exclude='GrShaderCache' \
    --exclude='Code Cache' --exclude='GPUCache' --exclude='BrowserMetrics*' \
    "$DEFAULT_PROFILE/Default" "$USER_DATA_DIR/"
  # Copy top-level config files needed for profile to work
  for f in "Local State" "First Run"; do
    [ -f "$DEFAULT_PROFILE/$f" ] && cp "$DEFAULT_PROFILE/$f" "$USER_DATA_DIR/"
  done
  echo "Profile copied."
fi

mkdir -p "$USER_DATA_DIR"

echo "Launching Chrome with CDP on port $CDP_PORT (profile: $USER_DATA_DIR)..."
"$CHROME_APP" \
  --remote-debugging-port="$CDP_PORT" \
  --user-data-dir="$USER_DATA_DIR" \
  --disable-blink-features=AutomationControlled \
  --disable-features=AutomationControlled \
  --disable-infobars \
  --no-first-run \
  --no-default-browser-check \
  --disable-background-networking=false \
  --enable-features=NetworkService,NetworkServiceInProcess \
  &
disown

# Wait for CDP to become available
for i in $(seq 1 15); do
  if curl -s "http://localhost:$CDP_PORT/json/version" >/dev/null 2>&1; then
    echo "Chrome ready with CDP on port $CDP_PORT"
    curl -s "http://localhost:$CDP_PORT/json/version" | python3 -m json.tool 2>/dev/null || true
    exit 0
  fi
  sleep 1
done

echo "Chrome launched but CDP not responding after 15s. Check manually:"
echo "  curl http://localhost:$CDP_PORT/json/version"
