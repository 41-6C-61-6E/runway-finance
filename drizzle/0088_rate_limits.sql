CREATE TABLE "rate_limits" ("key" text PRIMARY KEY, "count" integer NOT NULL DEFAULT 1, "window_start" timestamptz NOT NULL DEFAULT now());
