CREATE TABLE `apartments` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`price` real NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`status` text DEFAULT 'UNPROCESSED' NOT NULL,
	`mcda_score` real,
	`feature_scores` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apartments_url_unique` ON `apartments` (`url`);--> statement-breakpoint
CREATE INDEX `apartments_status_idx` ON `apartments` (`status`);--> statement-breakpoint
CREATE INDEX `apartments_score_idx` ON `apartments` (`mcda_score`);