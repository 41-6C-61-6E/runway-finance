#!/bin/sh
# Migrate database and start the application as nextjs user
# Migrations are best-effort; failures don't block server startup

echo "[init] Waiting for database to be ready..."
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
  if nc -z postgres 5432 2>/dev/null; then
    echo "[init] Database is ready!"
    break
  fi
  echo "[init] Database not ready, waiting... (attempt $attempt/$max_attempts)"
  sleep 1
  attempt=$((attempt + 1))
done

if [ $attempt -gt $max_attempts ]; then
  echo "[init] WARNING: Database failed to become ready after $max_attempts attempts, continuing anyway..."
fi

echo "[init] Attempting database migrations..."
cd /app

# Try migrations with timeout, but don't exit if they fail
if timeout 60 npx drizzle-kit migrate 2>&1; then
  echo "[init] Migrations completed successfully."
else
  EXIT_CODE=$?
  echo "[init] WARNING: Migrations failed with exit code $EXIT_CODE, continuing with server startup..."
fi

echo "[init] Starting Next.js server..."
# Dockerfile already sets USER nextjs, so we can run directly
exec node /app/server.js
