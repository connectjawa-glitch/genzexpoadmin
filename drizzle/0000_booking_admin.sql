CREATE TABLE `admin_login_limits` (
	`client_key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`generation` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_sessions_expiry` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `stall_bookings` (
	`stall` integer PRIMARY KEY NOT NULL,
	`booked` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "valid_stall" CHECK("stall_bookings"."stall" BETWEEN 1 AND 193),
	CONSTRAINT "valid_booked" CHECK("stall_bookings"."booked" IN (0, 1)),
	CONSTRAINT "valid_revision" CHECK("stall_bookings"."revision" > 0)
);
