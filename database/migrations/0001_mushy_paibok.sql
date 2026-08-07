CREATE TABLE `portal_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`client_id` text NOT NULL,
	`system_id` text NOT NULL,
	`module_id` text NOT NULL,
	`catalog_item_id` text,
	`other_error` text,
	`description` text NOT NULL,
	`severity` text NOT NULL,
	`occurred_at` text NOT NULL,
	`status` text NOT NULL,
	`responsible_id` text NOT NULL,
	`author_id` text NOT NULL,
	`attachments_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`deleted_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_occurrences_number_unique` ON `portal_occurrences` (`number`);--> statement-breakpoint
CREATE INDEX `portal_occurrences_active_updated_idx` ON `portal_occurrences` (`deleted_at`,`updated_at`);--> statement-breakpoint
CREATE INDEX `portal_occurrences_responsible_idx` ON `portal_occurrences` (`responsible_id`);--> statement-breakpoint
ALTER TABLE `portal_users` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `portal_users` ADD `deleted_by` text;
