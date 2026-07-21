CREATE TABLE "child_dictionary" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"household_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"title" text,
	CONSTRAINT "child_dictionary_member_unique" UNIQUE("household_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "child_dictionary_entry" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"dictionary_id" integer NOT NULL,
	"child_phrase" text NOT NULL,
	"adult_translation" text NOT NULL,
	"notes" text,
	"first_heard_on" date,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "child_dictionary" ADD CONSTRAINT "child_dictionary_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_dictionary" ADD CONSTRAINT "child_dictionary_member_id_household_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."household_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_dictionary_entry" ADD CONSTRAINT "child_dictionary_entry_dictionary_id_child_dictionary_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."child_dictionary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_dictionary_entry" ADD CONSTRAINT "child_dictionary_entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;