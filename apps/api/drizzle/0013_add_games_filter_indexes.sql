CREATE INDEX IF NOT EXISTS `games_user_kind_idx` ON `games` (`user_id`,`kind`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `games_user_kind_platform_idx` ON `games` (`user_id`,`kind`,`platform`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `games_user_kind_format_idx` ON `games` (`user_id`,`kind`,`format`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `games_user_kind_releaseyear_idx` ON `games` (`user_id`,`kind`,`release_year`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `games_user_kind_title_idx` ON `games` (`user_id`,`kind`,`title`);
