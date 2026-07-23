CREATE TYPE "public"."contactType" AS ENUM('medical', 'business', 'family', 'other');--> statement-breakpoint
CREATE TABLE "contact" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"type" "contactType" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"email" text,
	"phone" text,
	"address" text
);
--> statement-breakpoint
CREATE TABLE "medical_info" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"child_profile_id" integer,
	"pet_profile_id" integer,
	"medical_id_number" text,
	CONSTRAINT "medical_info_child_profile_unique" UNIQUE("child_profile_id"),
	CONSTRAINT "medical_info_pet_profile_unique" UNIQUE("pet_profile_id"),
	CONSTRAINT "medical_info_single_owner" CHECK (("medical_info"."child_profile_id" IS NULL) <> ("medical_info"."pet_profile_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "medical_info_contact" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"medical_info_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	CONSTRAINT "medical_info_contact_unique" UNIQUE("medical_info_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_info" ADD CONSTRAINT "medical_info_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_info" ADD CONSTRAINT "medical_info_child_profile_id_child_profile_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."child_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_info" ADD CONSTRAINT "medical_info_pet_profile_id_pet_profile_id_fk" FOREIGN KEY ("pet_profile_id") REFERENCES "public"."pet_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_info_contact" ADD CONSTRAINT "medical_info_contact_medical_info_id_medical_info_id_fk" FOREIGN KEY ("medical_info_id") REFERENCES "public"."medical_info"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_info_contact" ADD CONSTRAINT "medical_info_contact_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: every existing child/pet profile gets exactly one medical record (eager-created going forward).
INSERT INTO "medical_info" ("household_id", "child_profile_id")
SELECT "household_id", "id" FROM "child_profile";--> statement-breakpoint
INSERT INTO "medical_info" ("household_id", "pet_profile_id")
SELECT "household_id", "id" FROM "pet_profile";