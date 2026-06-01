-- Custom SQL migration file, put your code below! --
ALTER TABLE "category_rules" ADD COLUMN "override_existing" boolean DEFAULT false NOT NULL;