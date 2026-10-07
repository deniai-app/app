CREATE TABLE "max_mode_meter_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text,
	"category" text NOT NULL,
	"amount" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"requires_review" boolean DEFAULT false NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE INDEX "max_mode_meter_event_pending_idx" ON "max_mode_meter_event" USING btree ("next_attempt_at") WHERE "max_mode_meter_event"."delivered_at" IS NULL AND NOT "max_mode_meter_event"."requires_review";