PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`kind` text DEFAULT 'owned' NOT NULL,
	`title` text NOT NULL,
	`developer` text,
	`genre` text NOT NULL,
	`release_year` integer,
	`platform` text NOT NULL,
	`edition` text,
	`hours_played` integer,
	`status` text,
	`format` text DEFAULT 'digital' NOT NULL,
	`cover_color` text,
	`cover_image` text,
	`price` integer,
	`purchased_at` text,
	`external_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `games_kind_consistency` CHECK (
		(`kind` = 'owned' AND `status` IS NOT NULL AND `hours_played` IS NOT NULL)
		OR
		(`kind` = 'wishlist' AND `status` IS NULL AND `hours_played` IS NULL AND `purchased_at` IS NULL)
	)
);
--> statement-breakpoint
INSERT INTO `__new_games`("id", "user_id", "kind", "title", "developer", "genre", "release_year", "platform", "edition", "hours_played", "status", "format", "cover_color", "cover_image", "price", "purchased_at", "external_id", "created_at") SELECT
  "id", "user_id",
  CASE WHEN "status" = 'Wishlist' THEN 'wishlist' ELSE 'owned' END,
  "title",
  CASE WHEN "developer" = 'Unknown' OR "developer" IS NULL OR TRIM("developer") = '' THEN NULL ELSE "developer" END,
  "genre", "release_year", "platform", "edition",
  CASE WHEN "status" = 'Wishlist' THEN NULL ELSE "hours_played" END,
  CASE WHEN "status" = 'Wishlist' THEN NULL ELSE "status" END,
  "format", "cover_color", "cover_image", "price",
  CASE WHEN "status" = 'Wishlist' THEN NULL ELSE "purchased_at" END,
  "external_id", "created_at"
FROM `games`;--> statement-breakpoint
DROP TABLE `games`;--> statement-breakpoint
ALTER TABLE `__new_games` RENAME TO `games`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `games_user_id_idx` ON `games` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `games_user_id_external_id_unq` ON `games` (`user_id`,`external_id`);