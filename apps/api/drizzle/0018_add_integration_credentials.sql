CREATE TABLE `integration_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`integration` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_ciphertext` text NOT NULL,
	`last_verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_credentials_user_integration_unique` ON `integration_credentials` (`user_id`,`integration`);
