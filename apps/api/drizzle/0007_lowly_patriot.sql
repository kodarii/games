PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`developer` text NOT NULL,
	`genre` text NOT NULL,
	`release_year` integer,
	`platform` text NOT NULL,
	`edition` text,
	`hours_played` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Backlog' NOT NULL,
	`format` text DEFAULT 'digital' NOT NULL,
	`cover_color` text,
	`external_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_games`("id", "user_id", "title", "developer", "genre", "release_year", "platform", "edition", "hours_played", "status", "format", "cover_color", "external_id", "created_at") SELECT "id", "user_id", "title", "developer", "genre", "release_year", "platform", "edition", "hours_played", "status", "format", "cover_color", "external_id", "created_at" FROM `games`;--> statement-breakpoint
DROP TABLE `games`;--> statement-breakpoint
ALTER TABLE `__new_games` RENAME TO `games`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `games_user_id_idx` ON `games` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `games_user_id_external_id_unq` ON `games` (`user_id`,`external_id`);