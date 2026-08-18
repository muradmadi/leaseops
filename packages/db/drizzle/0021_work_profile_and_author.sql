ALTER TABLE `apartments` ADD `created_by` text;--> statement-breakpoint
ALTER TABLE `users` ADD `work_profile` text;--> statement-breakpoint
--
-- Backfill: the job facts collected before this migration were stored on the
-- household's shared persona, but they describe exactly one person — whoever
-- filled the original onboarding in. That is the household's oldest account, so
-- they are moved there rather than being left to speak for everybody.
--
-- Only `occupation` and `contractDetails` are carried across; the structured
-- employment status did not exist yet, and inventing one would answer a question
-- the member has never been asked. That is deliberate: `employmentStatus` is the
-- gate, so both members still see the work screen once, with the oldest member's
-- own words already in the boxes.
--
UPDATE users
SET work_profile = (
  SELECT json_object(
    'occupation', coalesce(json_extract(p.tenant_persona, '$.professionAndIncome'), ''),
    'contractDetails', coalesce(json_extract(p.tenant_persona, '$.contractType'), '')
  )
  FROM user_profiles p
  WHERE p.household_id = users.household_id
)
WHERE work_profile IS NULL
  AND users.id = (
    SELECT u.id FROM users u
    WHERE u.household_id = users.household_id
    ORDER BY u.created_at ASC, u.id ASC
    LIMIT 1
  )
  AND EXISTS (
    SELECT 1 FROM user_profiles p
    WHERE p.household_id = users.household_id
      -- A persona held as plain prose is not JSON, and json_extract raises on it.
      AND json_valid(p.tenant_persona)
      AND json_type(p.tenant_persona) = 'object'
      AND (
        trim(coalesce(json_extract(p.tenant_persona, '$.professionAndIncome'), '')) <> ''
        OR trim(coalesce(json_extract(p.tenant_persona, '$.contractType'), '')) <> ''
      )
  );--> statement-breakpoint
-- Now drop them from the shared persona. Leaving a copy behind would state the
-- same job twice in one letter, once owned and once unowned.
UPDATE user_profiles
SET tenant_persona = json_remove(tenant_persona, '$.professionAndIncome', '$.contractType')
WHERE json_valid(tenant_persona) AND json_type(tenant_persona) = 'object';
