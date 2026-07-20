ALTER TABLE "household_invite" ALTER COLUMN "household_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "household_member" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_invite" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "household_member" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "household_member" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "household_invite" ADD CONSTRAINT "household_invite_member_id_household_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."household_member"("id") ON DELETE cascade ON UPDATE no action;