CREATE TABLE `idempotency_keys` (
	`key` text NOT NULL,
	`user_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` integer NOT NULL,
	`response_body` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`key`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `idempotency_keys_created_at_idx` ON `idempotency_keys` (`created_at`);
