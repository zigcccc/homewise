CREATE TYPE "public"."currency" AS ENUM('EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF');--> statement-breakpoint
CREATE TABLE "expense" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"title" text NOT NULL,
	"category_id" integer,
	"amount" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"recorded_at" date NOT NULL,
	"paid_back_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "expense_category" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "currency" "currency" DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_category_id_expense_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_category" ADD CONSTRAINT "expense_category_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_household_recorded_at_idx" ON "expense" USING btree ("household_id","recorded_at");--> statement-breakpoint
CREATE INDEX "expense_category_idx" ON "expense" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_category_household_name_unique" ON "expense_category" USING btree ("household_id",lower("name"));