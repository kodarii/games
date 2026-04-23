CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`developer` text NOT NULL,
	`genre` text NOT NULL,
	`release_year` integer NOT NULL,
	`platform` text NOT NULL,
	`edition` text,
	`hours_played` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Backlog' NOT NULL,
	`created_at` integer
);
