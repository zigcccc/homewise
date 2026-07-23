CREATE TYPE "public"."contactLinkType" AS ENUM('web', 'social', 'other');--> statement-breakpoint
CREATE TABLE "contact_link" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"contact_id" integer NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"type" "contactLinkType" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_link" ADD CONSTRAINT "contact_link_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;