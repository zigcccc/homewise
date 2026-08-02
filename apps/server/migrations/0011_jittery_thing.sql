CREATE TABLE "planned_day_note" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"day" date NOT NULL,
	"note" text NOT NULL,
	CONSTRAINT "planned_day_note_household_day_unique" UNIQUE("household_id","day")
);
--> statement-breakpoint
CREATE TABLE "planned_meal" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"day" date NOT NULL,
	"position" integer NOT NULL,
	"recipe_id" integer,
	"title" text,
	"note" text,
	"created_by" text,
	CONSTRAINT "planned_meal_label_check" CHECK ("planned_meal"."recipe_id" IS NOT NULL OR "planned_meal"."title" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "planned_meal_member" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"planned_meal_id" integer NOT NULL,
	"household_member_id" integer NOT NULL,
	CONSTRAINT "planned_meal_member_unique" UNIQUE("planned_meal_id","household_member_id")
);
--> statement-breakpoint
ALTER TABLE "planned_day_note" ADD CONSTRAINT "planned_day_note_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal" ADD CONSTRAINT "planned_meal_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal" ADD CONSTRAINT "planned_meal_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal" ADD CONSTRAINT "planned_meal_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal_member" ADD CONSTRAINT "planned_meal_member_planned_meal_id_planned_meal_id_fk" FOREIGN KEY ("planned_meal_id") REFERENCES "public"."planned_meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meal_member" ADD CONSTRAINT "planned_meal_member_household_member_id_household_member_id_fk" FOREIGN KEY ("household_member_id") REFERENCES "public"."household_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planned_meal_household_day_idx" ON "planned_meal" USING btree ("household_id","day");--> statement-breakpoint
CREATE INDEX "planned_meal_recipe_idx" ON "planned_meal" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "planned_meal_member_member_idx" ON "planned_meal_member" USING btree ("household_member_id");