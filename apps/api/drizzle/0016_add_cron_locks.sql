CREATE TABLE `cron_locks` (
	`name` text PRIMARY KEY NOT NULL,
	`locked_until` integer NOT NULL,
	`owner` text NOT NULL
);
