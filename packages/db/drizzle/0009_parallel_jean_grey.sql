CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`join_code` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `households_join_code_unique` ON `households` (`join_code`);--> statement-breakpoint
CREATE INDEX `households_join_code_idx` ON `households` (`join_code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`household_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_username_idx` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_household_id_idx` ON `users` (`household_id`);--> statement-breakpoint
DROP INDEX `apartments_url_unique`;--> statement-breakpoint
DROP INDEX `apartments_status_created_at_idx`;--> statement-breakpoint
ALTER TABLE `apartments` ADD `household_id` text NOT NULL REFERENCES households(id);--> statement-breakpoint
CREATE INDEX `apartments_household_id_idx` ON `apartments` (`household_id`);--> statement-breakpoint
CREATE INDEX `apartments_household_status_created_at_idx` ON `apartments` (`household_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `apartments_household_url_idx` ON `apartments` (`household_id`,`url`);--> statement-breakpoint
DROP INDEX `user_sessions_username_idx`;--> statement-breakpoint
--> SQLite refuses to ADD a NOT NULL column to a table that has rows, and every
--> existing session is keyed to a username that no longer identifies anything.
--> Clearing them logs everyone out once, which is expected when auth is replaced.
DELETE FROM `user_sessions`;--> statement-breakpoint
ALTER TABLE `user_sessions` ADD `user_id` text NOT NULL REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `user_sessions_user_id_idx` ON `user_sessions` (`user_id`);--> statement-breakpoint
ALTER TABLE `user_sessions` DROP COLUMN `username`;--> statement-breakpoint
DROP INDEX `user_profiles_username_unique`;--> statement-breakpoint
DROP INDEX `user_profiles_username_idx`;--> statement-breakpoint
--> Same NOT NULL restriction. A pre-household profile has no household to belong
--> to and cannot be assigned one without inventing an owner, so it is dropped
--> rather than guessed at. Re-run onboarding after signing up.
DELETE FROM `user_profiles`;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `household_id` text NOT NULL REFERENCES households(id);--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_household_id_unique` ON `user_profiles` (`household_id`);--> statement-breakpoint
CREATE INDEX `user_profiles_household_id_idx` ON `user_profiles` (`household_id`);--> statement-breakpoint
ALTER TABLE `user_profiles` DROP COLUMN `username`;