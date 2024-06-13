-- Your SQL goes here
-- Your SQL goes here
CREATE TABLE `channels` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `message_id` BIGINT UNSIGNED NOT NULL
);

CREATE TABLE `countdowns` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `title` TEXT NOT NULL,
    `url` TEXT NOT NULL,
    `channel_id` BIGINT UNSIGNED NOT NULL,
    `date_time` DATETIME NOT NULL,
    FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON DELETE CASCADE
);

CREATE TABLE `verifications` (
    `email` VARCHAR(64) NOT NULL PRIMARY KEY,
    `name` TEXT,
    `in_gryphlife` BOOLEAN,
    `has_paid` BOOLEAN,
    `discord_id` BIGINT UNSIGNED
);

CREATE TABLE `verification_sessions` (
    `email` VARCHAR(64) NOT NULL PRIMARY KEY,
    `discord_id` BIGINT UNSIGNED NOT NULL,
    `code` BIGINT UNSIGNED NOT NULL,
    `timestamp` BIGINT UNSIGNED NOT NULL,
    FOREIGN KEY (`email`) REFERENCES `verifications`(`email`) ON DELETE CASCADE,
    UNIQUE (`discord_id`)
);

CREATE TABLE `feature_flags` (
    `name` VARCHAR(128) NOT NULL PRIMARY KEY,
    `value` TEXT,
    `flag_type` TEXT NOT NULL
);