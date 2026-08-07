CREATE TABLE `portal_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_normalized` text NOT NULL,
	`username_normalized` text NOT NULL,
	`role` text NOT NULL,
	`title` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_users_email_normalized_unique` ON `portal_users` (`email_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_users_username_normalized_unique` ON `portal_users` (`username_normalized`);--> statement-breakpoint
CREATE INDEX `portal_users_role_active_idx` ON `portal_users` (`role`,`active`);--> statement-breakpoint
CREATE TABLE `portal_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `portal_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portal_sessions_user_id_idx` ON `portal_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `portal_sessions_expires_at_idx` ON `portal_sessions` (`expires_at`);
