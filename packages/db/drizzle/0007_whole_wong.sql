CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`apartment_id` text NOT NULL,
	`sender` text NOT NULL,
	`text` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_apartment_id_idx` ON `messages` (`apartment_id`);--> statement-breakpoint
CREATE INDEX `messages_created_at_idx` ON `messages` (`created_at`);