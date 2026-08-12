CREATE TYPE "public"."contactRelationRole" AS ENUM('spouse', 'husband', 'wife', 'partner', 'parent', 'mother', 'father', 'child', 'son', 'daughter', 'sibling', 'brother', 'sister', 'grandparent', 'grandchild', 'aunt_uncle', 'niece_nephew', 'cousin', 'friend', 'neighbour', 'colleague', 'other');--> statement-breakpoint
ALTER TYPE "public"."contactType" ADD VALUE 'friend';--> statement-breakpoint
CREATE TABLE "contact_relation" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"contact_id" integer NOT NULL,
	"related_contact_id" integer NOT NULL,
	"role" "contactRelationRole" NOT NULL,
	"inverse_role" "contactRelationRole" NOT NULL,
	CONSTRAINT "contact_relation_self_check" CHECK ("contact_relation"."contact_id" <> "contact_relation"."related_contact_id")
);
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "contact_relation" ADD CONSTRAINT "contact_relation_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_relation" ADD CONSTRAINT "contact_relation_related_contact_id_contact_id_fk" FOREIGN KEY ("related_contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_relation_pair_unique" ON "contact_relation" USING btree (least("contact_id", "related_contact_id"),greatest("contact_id", "related_contact_id"));--> statement-breakpoint
CREATE INDEX "contact_relation_related_idx" ON "contact_relation" USING btree ("related_contact_id");