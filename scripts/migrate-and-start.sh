#!/bin/sh
# Migrate database and start the application as nextjs user
# Migrations are best-effort; failures don't block server startup

echo "[init] Waiting for database to be ready..."
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
  # nc -z checks TCP connectivity; Alpine sh does not support /dev/tcp
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

cd /app

echo "[init] Running database migrations..."
node /app/scripts/migrate.mjs 2>&1
MIGRATE_EXIT=$?
if [ $MIGRATE_EXIT -eq 0 ]; then
  echo "[init] Migrations completed successfully."
else
  echo "[init] WARNING: Migrations failed with exit code $MIGRATE_EXIT, continuing with server startup..."
fi

echo "[init] Starting Next.js server..."
exec node /app/server.js