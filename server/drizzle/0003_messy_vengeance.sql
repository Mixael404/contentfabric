CREATE TABLE `max_chats` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`title` text,
	`type` text DEFAULT 'chat' NOT NULL,
	`link` text,
	`status` text DEFAULT 'active' NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
