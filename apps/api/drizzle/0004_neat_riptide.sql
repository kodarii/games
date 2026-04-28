CREATE TABLE `platforms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `platforms_user_id_idx` ON `platforms` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `platforms_user_id_name_unq` ON `platforms` (`user_id`,`name`);