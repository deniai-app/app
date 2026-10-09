CREATE TABLE "model_health" (
	"model" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"available" boolean NOT NULL,
	"latency_ms" integer,
	"error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_available_at" timestamp with time zone
);
