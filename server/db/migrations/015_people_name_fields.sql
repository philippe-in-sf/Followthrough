ALTER TABLE people
ADD COLUMN first_name TEXT;

ALTER TABLE people
ADD COLUMN last_name TEXT NOT NULL DEFAULT '';

UPDATE people
SET first_name = CASE
    WHEN INSTR(TRIM(name), ' ') = 0 THEN TRIM(name)
    ELSE SUBSTR(TRIM(name), 1, INSTR(TRIM(name), ' ') - 1)
  END,
  last_name = CASE
    WHEN INSTR(TRIM(name), ' ') = 0 THEN ''
    ELSE TRIM(SUBSTR(TRIM(name), INSTR(TRIM(name), ' ') + 1))
  END,
  name = TRIM(name)
WHERE first_name IS NULL;

UPDATE people
SET first_name = name
WHERE first_name IS NULL OR TRIM(first_name) = '';
