CREATE TABLE `widget_state` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`widget_id` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
