ALTER TABLE "import_log" ADD COLUMN IF NOT EXISTS "start_date" date;
ALTER TABLE "import_log" ADD COLUMN IF NOT EXISTS "end_date" date;
