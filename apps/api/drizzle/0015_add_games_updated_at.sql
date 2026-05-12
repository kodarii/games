ALTER TABLE `games` ADD `updated_at` integer;--> statement-breakpoint
UPDATE `games` SET `updated_at` = unixepoch();
