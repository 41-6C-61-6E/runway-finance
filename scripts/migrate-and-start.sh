#!/bin/sh
# Migrate database and start the application as nextjs user
# Migrations are best-effort; failures don't block server startup

export UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-16}"

echo "[init] Waiting for database to be ready..."

DB_HOST="postgres"
DB_PORT="5432"

if [ -n "$DATABASE_URL" ]; then
  URL_TAIL="${DATABASE_URL#*://}"
  HOST_PORT_PATH="${URL_TAIL#*@}"
  HOST_PORT="${HOST_PORT_PATH%%/*}"
  HOST_PORT="${HOST_PORT%%\?*}"

  case "$HOST_PORT" in
    *:*)
      DB_HOST="${HOST_PORT%%:*}"
      DB_PORT="${HOST_PORT##*:}"
      ;;
    *)
      if [ -n "$HOST_PORT" ]; then
        DB_HOST="$HOST_PORT"
      fi
      ;;
  esac
fi

echo "[init] Checking database connectivity on $DB_HOST:$DB_PORT..."
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
  # nc -z checks TCP connectivity; Alpine sh does not support /dev/tcp
  if nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
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