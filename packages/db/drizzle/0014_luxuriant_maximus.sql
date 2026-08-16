ALTER TABLE `apartments` ADD `is_active` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `qualifying_threshold` real DEFAULT 70 NOT NULL;