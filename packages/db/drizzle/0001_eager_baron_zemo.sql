CREATE INDEX `apartments_created_at_idx` ON `apartments` (`created_at`);--> statement-breakpoint
CREATE INDEX `apartments_status_created_at_idx` ON `apartments` (`status`,`created_at`);