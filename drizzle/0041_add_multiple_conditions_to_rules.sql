-- Add support for multiple conditions to category_rules
ALTER TABLE category_rules ADD COLUMN IF NOT EXISTS conditions jsonb;

-- Set default for existing rules to maintain backward compatibility
UPDATE category_rules 
SET conditions = jsonb_build_array(
  jsonb_build_object(
    'field', condition_field,
    'operator', condition_operator,
    'value', condition_value,
    'caseSensitive', condition_case_sensitive
  )
)
WHERE conditions IS NULL;
