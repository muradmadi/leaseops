ALTER TABLE `user_profiles` ADD `space_requirements` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profiles` DROP COLUMN `auto_translate_listings`;