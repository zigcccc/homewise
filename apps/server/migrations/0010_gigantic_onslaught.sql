CREATE TYPE "public"."ingredientCategory" AS ENUM('produce', 'meat_fish', 'dairy_eggs', 'bakery', 'pantry', 'frozen', 'spices', 'drinks', 'household', 'other');--> statement-breakpoint
CREATE TYPE "public"."mealType" AS ENUM('breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'drink', 'side', 'baking');--> statement-breakpoint
CREATE TYPE "public"."measurementUnit" AS ENUM('g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'slice', 'clove', 'pinch', 'can', 'pack', 'bunch');--> statement-breakpoint
CREATE TABLE "ingredient" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" "ingredientCategory" DEFAULT 'other' NOT NULL,
	"default_unit" "measurementUnit",
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "recipe" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"meal_type" "mealType",
	"cuisine" text,
	"servings" integer,
	"prep_time_minutes" integer,
	"cook_time_minutes" integer,
	"source_name" text,
	"source_url" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredient" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"recipe_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"quantity" numeric(10, 3),
	"unit" "measurementUnit",
	"note" text,
	"section" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_step" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"recipe_id" integer NOT NULL,
	"position" integer NOT NULL,
	"instruction" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_tag" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_tag_link" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"recipe_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "recipe_tag_link_unique" UNIQUE("recipe_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_step" ADD CONSTRAINT "recipe_step_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tag" ADD CONSTRAINT "recipe_tag_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tag_link" ADD CONSTRAINT "recipe_tag_link_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tag_link" ADD CONSTRAINT "recipe_tag_link_tag_id_recipe_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."recipe_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingredient_household_name_unique" ON "ingredient" USING btree ("household_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_tag_household_name_unique" ON "recipe_tag" USING btree ("household_id",lower("name"));