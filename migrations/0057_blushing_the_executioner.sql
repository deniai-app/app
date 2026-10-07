CREATE TABLE "usage_reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone,
	"reserved_amount" bigint NOT NULL,
	"base_used" bigint NOT NULL,
	"limit_amount" bigint,
	"max_mode_enabled" boolean NOT NULL,
	"max_mode_limit" bigint,
	"billing_id" text,
	"stripe_customer_id" text,
	"settled_amount" bigint,
	"observed_amount" bigint DEFAULT 0 NOT NULL,
	"max_mode_amount" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "billing" ALTER COLUMN "max_mode_usage_basic" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "billing" ALTER COLUMN "max_mode_usage_premium" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "max_mode_meter_event" ALTER COLUMN "amount" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "usage_quota" ALTER COLUMN "used" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "billing" ADD COLUMN "deletion_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "usage_reservation_period_idx" ON "usage_reservation" USING btree ("user_id","category","unit","period_start");--> statement-breakpoint
CREATE INDEX "usage_reservation_pending_idx" ON "usage_reservation" USING btree ("user_id") WHERE "usage_reservation"."settled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "usage_reservation_stale_idx" ON "usage_reservation" USING btree ("updated_at") WHERE "usage_reservation"."settled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "usage_reservation_billing_period_idx" ON "usage_reservation" USING btree ("billing_id","created_at") WHERE "usage_reservation"."settled_at" IS NOT NULL;