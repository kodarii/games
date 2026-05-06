CREATE TABLE `genres` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `external_id` text NOT NULL,
  `created_at` integer
);

CREATE INDEX `genres_user_id_idx` ON `genres` (`user_id`);
CREATE UNIQUE INDEX `genres_user_id_name_unq` ON `genres` (`user_id`, `name`);
CREATE UNIQUE INDEX `genres_user_id_external_id_unq` ON `genres` (`user_id`, `external_id`);

CREATE TABLE `developers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `external_id` text NOT NULL,
  `created_at` integer
);

CREATE INDEX `developers_user_id_idx` ON `developers` (`user_id`);
CREATE UNIQUE INDEX `developers_user_id_name_unq` ON `developers` (`user_id`, `name`);
CREATE UNIQUE INDEX `developers_user_id_external_id_unq` ON `developers` (`user_id`, `external_id`);
