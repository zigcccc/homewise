CREATE TABLE "storage_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"photo_url" text,
	"borrowed_by_contact_id" integer,
	"borrowed_by_name" text,
	"borrowed_on" date,
	"due_on" date,
	"created_by" text,
	CONSTRAINT "storage_item_loan_check" CHECK ("storage_item"."borrowed_on" IS NOT NULL OR ("storage_item"."borrowed_by_contact_id" IS NULL AND "storage_item"."borrowed_by_name" IS NULL AND "storage_item"."due_on" IS NULL)),
	CONSTRAINT "storage_item_quantity_check" CHECK ("storage_item"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "storage_location" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	CONSTRAINT "storage_location_coordinates_check" CHECK (("storage_location"."latitude" IS NULL) = ("storage_location"."longitude" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "storage_item" ADD CONSTRAINT "storage_item_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_item" ADD CONSTRAINT "storage_item_location_id_storage_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."storage_location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_item" ADD CONSTRAINT "storage_item_borrowed_by_contact_id_contact_id_fk" FOREIGN KEY ("borrowed_by_contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_item" ADD CONSTRAINT "storage_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_location" ADD CONSTRAINT "storage_location_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_item_household_idx" ON "storage_item" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "storage_item_location_idx" ON "storage_item" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "storage_item_contact_idx" ON "storage_item" USING btree ("borrowed_by_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_location_household_name_unique" ON "storage_location" USING btree ("household_id",lower("name"));