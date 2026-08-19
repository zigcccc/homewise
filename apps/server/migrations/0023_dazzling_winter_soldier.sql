-- A null role has full powers today, so anything but 'adult' would silently demote real people.
UPDATE "household_member" SET "role" = 'adult' WHERE "role" IS NULL;--> statement-breakpoint
UPDATE "household_invite" SET "role" = 'adult' WHERE "role" IS NULL;--> statement-breakpoint
-- A pet that holds an account is a mis-tagged human; the new invite guards stop it recurring.
UPDATE "household_member" SET "role" = 'adult' WHERE "role" = 'pet' AND "user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "household_invite" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "household_member" ALTER COLUMN "role" SET NOT NULL;
