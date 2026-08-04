CREATE TABLE "shopping_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"name" text,
	"completed_at" timestamp,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "shopping_list_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"shopping_list_id" integer NOT NULL,
	"section_id" integer,
	"ingredient_id" integer,
	"title" text,
	"quantity" numeric(10, 3),
	"unit" "measurementUnit",
	"note" text,
	"checked_at" timestamp,
	"checked_by" text,
	"position" integer NOT NULL,
	"created_by" text,
	CONSTRAINT "shopping_list_item_label_check" CHECK ("shopping_list_item"."ingredient_id" IS NOT NULL OR "shopping_list_item"."title" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "shopping_list_section" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"shopping_list_id" integer NOT NULL,
	"store_id" integer,
	"name" text,
	"position" integer NOT NULL,
	CONSTRAINT "shopping_list_section_label_check" CHECK ("shopping_list_section"."store_id" IS NOT NULL OR "shopping_list_section"."name" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "shopping_list" ADD CONSTRAINT "shopping_list_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD CONSTRAINT "shopping_list_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_shopping_list_id_shopping_list_id_fk" FOREIGN KEY ("shopping_list_id") REFERENCES "public"."shopping_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_section_id_shopping_list_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."shopping_list_section"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_checked_by_user_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_section" ADD CONSTRAINT "shopping_list_section_shopping_list_id_shopping_list_id_fk" FOREIGN KEY ("shopping_list_id") REFERENCES "public"."shopping_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_section" ADD CONSTRAINT "shopping_list_section_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopping_list_household_idx" ON "shopping_list" USING btree ("household_id","completed_at");--> statement-breakpoint
CREATE INDEX "shopping_list_item_list_idx" ON "shopping_list_item" USING btree ("shopping_list_id");--> statement-breakpoint
CREATE INDEX "shopping_list_item_ingredient_idx" ON "shopping_list_item" USING btree ("ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_list_section_store_unique" ON "shopping_list_section" USING btree ("shopping_list_id","store_id") WHERE "shopping_list_section"."store_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_list_section_name_unique" ON "shopping_list_section" USING btree ("shopping_list_id",lower("name")) WHERE "shopping_list_section"."name" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shopping_list_section_store_idx" ON "shopping_list_section" USING btree ("store_id");