ALTER TABLE `games` ADD `user_id` text NOT NULL REFERENCES user(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `games_user_id_idx` ON `games` (`user_id`);