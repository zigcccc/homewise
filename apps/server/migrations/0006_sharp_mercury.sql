CREATE TYPE "public"."petSex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."petType" AS ENUM('dog', 'cat', 'turtle', 'hamster', 'horse', 'parrot', 'other');--> statement-breakpoint
CREATE TABLE "pet_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"date_of_birth" date,
	"joined_family_on" date,
	"type" "petType",
	"breed" text,
	"sex" "petSex",
	"profile_picture" text,
	CONSTRAINT "pet_profile_member_unique" UNIQUE("household_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "pet_profile" ADD CONSTRAINT "pet_profile_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_profile" ADD CONSTRAINT "pet_profile_member_id_household_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."household_member"("id") ON DELETE cascade ON UPDATE no action;