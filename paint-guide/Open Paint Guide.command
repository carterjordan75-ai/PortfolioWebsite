#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Double-click this to open the Oil Pixel Painting Guide.
# It starts the local app and opens it in your browser.
#
# • Always uses http://localhost:5199 — your saved paintings live in the browser
#   at that exact address, so it must stay 5199 for them to show up.
# • Leave the Terminal window that opens running while you use the app.
#   Closing that window stops the app (your paintings are still saved).
# • You can drag this file to your Desktop and double-click it from there.
# ─────────────────────────────────────────────────────────────────────────────

APP_DIR="/Users/jordancarter/Documents/Claude/Website/paint-guide"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

cd "$APP_DIR" || {
  echo "Couldn't find the app folder: $APP_DIR"
  echo "If you moved the project, edit APP_DIR at the top of this file."
  read -r -p "Press Return to close…"
  exit 1
}

# First run (or after a clean checkout): install dependencies.
if [ ! -d node_modules ]; then
  echo "Setting up for the first time (this happens once)…"
  npm install || { echo "Setup failed."; read -r -p "Press Return to close…"; exit 1; }
fi

# Open the browser a few seconds after the server starts.
( sleep 3 && open "http://localhost:5199" ) &

echo "Starting the Oil Pixel Painting Guide at http://localhost:5199"
echo "(Keep this window open while you paint. Close it to stop.)"
npm run dev -- --port 5199 --strictPort
