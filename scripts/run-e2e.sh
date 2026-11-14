#!/bin/sh
set -e
npx vite --port 5179 --strictPort > /tmp/vite-e2e.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do
  if curl -s -o /dev/null http://localhost:5179/; then break; fi
  sleep 0.5
done
node "$@"
