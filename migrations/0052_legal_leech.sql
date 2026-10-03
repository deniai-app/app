CREATE TABLE "model_comparisons" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"left_model" text NOT NULL,
	"right_model" text NOT NULL,
	"left_name" text NOT NULL,
	"right_name" text NOT NULL,
	"left_messages" jsonb NOT NULL,
	"right_messages" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_comparisons" ADD CONSTRAINT "model_comparisons_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_comparisons_user_updated_idx" ON "model_comparisons" USING btree ("user_id","updated_at" DESC NULLS LAST);