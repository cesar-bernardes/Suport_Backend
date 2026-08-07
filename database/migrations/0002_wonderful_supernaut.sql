CREATE TABLE `portal_agenda_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`client_id` text,
	`assignee_id` text NOT NULL,
	`created_by` text NOT NULL,
	`scheduled_start` text,
	`estimated_minutes` integer,
	`status` text NOT NULL,
	`actual_start` text,
	`actual_end` text,
	`outcome` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`deleted_by` text
);
--> statement-breakpoint
CREATE INDEX `portal_agenda_assignee_start_idx` ON `portal_agenda_entries` (`assignee_id`,`scheduled_start`);--> statement-breakpoint
CREATE INDEX `portal_agenda_active_status_idx` ON `portal_agenda_entries` (`deleted_at`,`status`);