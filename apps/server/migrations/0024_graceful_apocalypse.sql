-- The index below is what stops a second membership being created; any that predate it would make
-- creating it fail outright. Keeps the earliest row per account — the one every other table that
-- references a member is already pointing at.
DELETE FROM "household_member" a
  USING "household_member" b
  WHERE a."user_id" IS NOT NULL
    AND a."user_id" = b."user_id"
    AND a."household_id" = b."household_id"
    AND a."id" > b."id";--> statement-breakpoint
CREATE UNIQUE INDEX "household_member_user_unique" ON "household_member" USING btree ("household_id","user_id") WHERE "household_member"."user_id" IS NOT NULL;
