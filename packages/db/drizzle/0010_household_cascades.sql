--> `ALTER TABLE ... ADD COLUMN ... REFERENCES` cannot carry an ON DELETE clause in
--> SQLite, so migration 0009 left `apartments` and `user_profiles` enforcing
--> NO ACTION while the schema declares `onDelete: 'cascade'`. Deleting a household
--> therefore stranded its listings and criteria instead of removing them.
--> Rebuilding both tables is the only way to correct a foreign key in SQLite.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_apartments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`price` real NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`status` text DEFAULT 'UNPROCESSED' NOT NULL,
	`mcda_score` real,
	`feature_scores` text,
	`room_scores` text,
	`raw_html` text,
	`extracted_data` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_apartments` SELECT `id`, `household_id`, `url`, `title`, `price`, `currency`, `status`, `mcda_score`, `feature_scores`, `room_scores`, `raw_html`, `extracted_data`, `created_at`, `updated_at` FROM `apartments`;--> statement-breakpoint
DROP TABLE `apartments`;--> statement-breakpoint
ALTER TABLE `__new_apartments` RENAME TO `apartments`;--> statement-breakpoint
CREATE INDEX `apartments_status_idx` ON `apartments` (`status`);--> statement-breakpoint
CREATE INDEX `apartments_score_idx` ON `apartments` (`mcda_score`);--> statement-breakpoint
CREATE INDEX `apartments_created_at_idx` ON `apartments` (`created_at`);--> statement-breakpoint
CREATE INDEX `apartments_household_id_idx` ON `apartments` (`household_id`);--> statement-breakpoint
CREATE INDEX `apartments_household_status_created_at_idx` ON `apartments` (`household_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `apartments_household_url_idx` ON `apartments` (`household_id`,`url`);--> statement-breakpoint
CREATE TABLE `__new_user_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`target_location` text DEFAULT '' NOT NULL,
	`target_language` text DEFAULT 'English' NOT NULL,
	`auto_translate_listings` integer DEFAULT true NOT NULL,
	`auto_draft_messages` integer DEFAULT true NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`ideal_rent` real DEFAULT 1200 NOT NULL,
	`max_rent` real DEFAULT 1500 NOT NULL,
	`feature_weights` text DEFAULT '{}' NOT NULL,
	`tenant_persona` text DEFAULT '' NOT NULL,
	`sign_off_name` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_profiles` SELECT `id`, `household_id`, `target_location`, `target_language`, `auto_translate_listings`, `auto_draft_messages`, `currency`, `ideal_rent`, `max_rent`, `feature_weights`, `tenant_persona`, `sign_off_name`, `created_at`, `updated_at` FROM `user_profiles`;--> statement-breakpoint
DROP TABLE `user_profiles`;--> statement-breakpoint
ALTER TABLE `__new_user_profiles` RENAME TO `user_profiles`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_household_id_unique` ON `user_profiles` (`household_id`);--> statement-breakpoint
CREATE INDEX `user_profiles_household_id_idx` ON `user_profiles` (`household_id`);--> statement-breakpoint
CREATE INDEX `user_profiles_updated_at_idx` ON `user_profiles` (`updated_at`);--> statement-breakpoint
CREATE TABLE `__new_user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_sessions` SELECT `id`, `user_id`, `token`, `expires_at`, `created_at` FROM `user_sessions`;--> statement-breakpoint
DROP TABLE `user_sessions`;--> statement-breakpoint
ALTER TABLE `__new_user_sessions` RENAME TO `user_sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_sessions_token_unique` ON `user_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `user_sessions_token_idx` ON `user_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `user_sessions_user_id_idx` ON `user_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_sessions_expires_at_idx` ON `user_sessions` (`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
