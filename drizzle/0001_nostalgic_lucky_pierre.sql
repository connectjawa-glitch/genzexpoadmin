ALTER TABLE `stall_bookings` ADD `status` integer DEFAULT 0 NOT NULL CONSTRAINT `valid_status` CHECK (`status` IN (0, 1, 2));
