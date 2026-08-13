CREATE TYPE "public"."householdActivityEntity" AS ENUM('child_dictionary_entry', 'child_profile', 'contact', 'expense', 'expense_category', 'household', 'household_invite', 'household_member', 'ingredient', 'meal_plan', 'medical_info', 'pet_profile', 'recipe', 'recipe_tag', 'shopping_list', 'storage_item', 'storage_location', 'store');--> statement-breakpoint
CREATE TYPE "public"."householdActivityOperation" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TABLE "household_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"actor_id" text,
	"actor_name" text NOT NULL,
	"entity" "householdActivityEntity" NOT NULL,
	"operation" "householdActivityOperation" NOT NULL,
	"entity_id" integer,
	"parent_id" integer,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "household_activity" ADD CONSTRAINT "household_activity_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_activity" ADD CONSTRAINT "household_activity_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "household_activity_household_idx" ON "household_activity" USING btree ("household_id","id" DESC NULLS LAST);