ALTER TABLE "import_log" ADD COLUMN IF NOT EXISTS "data_start_date" date;
ALTER TABLE "import_log" ADD COLUMN IF NOT EXISTS "data_end_date" date;
