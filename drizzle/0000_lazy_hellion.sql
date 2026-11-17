CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`author_voter_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`hidden_at` integer,
	CONSTRAINT "ideas_text_length" CHECK(length("ideas"."text") between 1 and 140)
);
--> statement-breakpoint
CREATE INDEX `ideas_visible_created_idx` ON `ideas` (`hidden_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `votes` (
	`idea_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`idea_id`, `voter_id`),
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `votes_voter_idx` ON `votes` (`voter_id`);