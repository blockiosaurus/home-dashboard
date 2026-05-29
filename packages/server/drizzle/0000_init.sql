CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`email` text NOT NULL,
	`refresh_token_encrypted` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`google_calendar_id` text NOT NULL,
	`summary` text NOT NULL,
	`color_override` text,
	`visible` integer DEFAULT true NOT NULL,
	`sync_token` text
);
--> statement-breakpoint
CREATE TABLE `events_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`google_event_id` text NOT NULL,
	`etag` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`description` text,
	`color` text,
	`last_synced_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `events_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`op` text NOT NULL,
	`payload_json` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`next_attempt_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`avatar_url` text,
	`primary_calendar_id` text
);
--> statement-breakpoint
CREATE TABLE `scene_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`cron_expr` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`layout_json` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `widget_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`widget_id` text NOT NULL,
	`instance_id` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`w` integer NOT NULL,
	`h` integer NOT NULL,
	`config_json` text NOT NULL
);
