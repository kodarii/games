DROP TABLE `igdb_oauth_token`;
--> statement-breakpoint
CREATE TABLE `integration_oauth_token` (
	`user_id` text NOT NULL,
	`integration` text NOT NULL,
	`access_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`obtained_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `integration`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
