CREATE TABLE "reset_credit_balance" (
	"user_id" text PRIMARY KEY NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reset_credit_balance" ADD CONSTRAINT "reset_credit_balance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Carry unspent reset credits over from the affiliate program before its tables are dropped.
INSERT INTO "reset_credit_balance" ("user_id", "credits", "created_at", "updated_at")
SELECT "user_id", "reset_credits", "created_at", now()
FROM "affiliate_profile"
WHERE "reset_credits" > 0
ON CONFLICT ("user_id") DO NOTHING;
