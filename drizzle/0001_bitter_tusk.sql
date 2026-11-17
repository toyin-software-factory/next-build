CREATE TABLE `rate_events` (
	`kind` text NOT NULL,
	`voter_key` text NOT NULL,
	`ip_key` text NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_events_voter_idx` ON `rate_events` (`kind`,`voter_key`,`window_start`);--> statement-breakpoint
CREATE INDEX `rate_events_ip_idx` ON `rate_events` (`kind`,`ip_key`,`window_start`);--> statement-breakpoint
CREATE INDEX `rate_events_window_idx` ON `rate_events` (`window_start`);