CREATE TABLE "store" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"name" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "ingredient" ADD COLUMN "store_id" integer;--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "store_household_name_unique" ON "store" USING btree ("household_id",lower("name"));--> statement-breakpoint
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE set null ON UPDATE no action;