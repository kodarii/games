ALTER TABLE `games` ADD `metadata_provider` text;--> statement-breakpoint
ALTER TABLE `games` ADD `metadata_provider_id` text;--> statement-breakpoint
ALTER TABLE `games` ADD `metadata_matched_at` text;--> statement-breakpoint
CREATE TABLE `metadata_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`cache_key` text NOT NULL,
	`candidates_json` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metadata_cache_provider_cache_key_unq` ON `metadata_cache` (`provider`,`cache_key`);--> statement-breakpoint
CREATE TABLE `igdb_oauth_token` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`access_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`obtained_at` integer NOT NULL
);
