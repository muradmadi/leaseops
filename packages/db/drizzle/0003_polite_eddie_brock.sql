CREATE TABLE `user_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`target_location` text DEFAULT '' NOT NULL,
	`target_language` text DEFAULT 'English' NOT NULL,
	`auto_translate_listings` integer DEFAULT true NOT NULL,
	`auto_draft_messages` integer DEFAULT true NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`ideal_rent` real DEFAULT 1200 NOT NULL,
	`max_rent` real DEFAULT 1500 NOT NULL,
	`feature_weights` text DEFAULT '{}' NOT NULL,
	`tenant_persona` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_username_unique` ON `user_profiles` (`username`);--> statement-breakpoint
CREATE INDEX `user_profiles_username_idx` ON `user_profiles` (`username`);--> statement-breakpoint
CREATE INDEX `user_profiles_updated_at_idx` ON `user_profiles` (`updated_at`);