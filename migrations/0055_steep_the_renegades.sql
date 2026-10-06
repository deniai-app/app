CREATE TABLE "signup_risk" (
	"user_id" text PRIMARY KEY NOT NULL,
	"score" integer NOT NULL,
	"flags" jsonb NOT NULL,
	"ip_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signup_risk" ADD CONSTRAINT "signup_risk_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;