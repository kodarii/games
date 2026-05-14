CREATE TABLE `rate_limit_buckets` (
	`user_id` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `window_start`)
);
--> statement-breakpoint
CREATE INDEX `rate_limit_buckets_window_start_idx` ON `rate_limit_buckets` (`window_start`);