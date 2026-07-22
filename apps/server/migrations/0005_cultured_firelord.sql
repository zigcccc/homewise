CREATE TYPE "public"."childSex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TABLE "child_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"date_of_birth" date,
	"sex" "childSex",
	"profile_picture" text,
	CONSTRAINT "child_profile_member_unique" UNIQUE("household_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "child_dictionary" DROP CONSTRAINT "child_dictionary_member_unique";--> statement-breakpoint
ALTER TABLE "child_dictionary" DROP CONSTRAINT "child_dictionary_member_id_household_member_id_fk";
--> statement-breakpoint
ALTER TABLE "child_dictionary" ADD COLUMN "profile_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "child_profile" ADD CONSTRAINT "child_profile_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_profile" ADD CONSTRAINT "child_profile_member_id_household_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."household_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_dictionary" ADD CONSTRAINT "child_dictionary_profile_id_child_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_dictionary" DROP COLUMN "member_id";--> statement-breakpoint
ALTER TABLE "child_dictionary" ADD CONSTRAINT "child_dictionary_profile_unique" UNIQUE("profile_id");