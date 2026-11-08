CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`system_prompt` text NOT NULL,
	`model` text NOT NULL,
	`reasoning_effort` text DEFAULT 'low' NOT NULL,
	`web_search` integer DEFAULT true NOT NULL,
	`search_context_size` text DEFAULT 'medium' NOT NULL,
	`schedule_times` text DEFAULT '[]' NOT NULL,
	`timezone` text DEFAULT 'Europe/Moscow' NOT NULL,
	`language` text DEFAULT 'ru' NOT NULL,
	`telegram_chat_id` text,
	`max_chat_id` text,
	`mode` text DEFAULT 'review' NOT NULL,
	`image_provider` text DEFAULT 'auto' NOT NULL,
	`image_required` integer DEFAULT false NOT NULL,
	`max_body_length` integer DEFAULT 2500 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text,
	`provider` text NOT NULL,
	`provider_id` text NOT NULL,
	`source_url` text NOT NULL,
	`hotlink_url` text,
	`page_url` text,
	`author` text,
	`author_url` text,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`mime_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`file_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_campaign_idx` ON `media` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`title` text NOT NULL,
	`body_markdown` text NOT NULL,
	`image_query` text,
	`image_alt` text,
	`sources` text DEFAULT '[]' NOT NULL,
	`hashtags` text DEFAULT '[]' NOT NULL,
	`draft_json` text NOT NULL,
	`model` text NOT NULL,
	`usage` text,
	`media_id` text,
	`telegram_html` text NOT NULL,
	`telegram_mode` text NOT NULL,
	`max_html` text NOT NULL,
	`plain_text` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`review_message_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `posts_campaign_idx` ON `posts` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `posts_status_idx` ON `posts` (`status`);--> statement-breakpoint
CREATE TABLE `publications` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`run_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`channel` text NOT NULL,
	`target` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`external_message_id` text,
	`error` text,
	`sent_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `publications_post_idx` ON `publications` (`post_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`trigger` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`slot_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`stage` text,
	`force_review` integer DEFAULT false NOT NULL,
	`error` text,
	`log` text DEFAULT '[]' NOT NULL,
	`post_id` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runs_slot_key_idx` ON `runs` (`slot_key`);--> statement-breakpoint
CREATE INDEX `runs_campaign_idx` ON `runs` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `runs_status_idx` ON `runs` (`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
