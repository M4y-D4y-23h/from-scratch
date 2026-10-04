CREATE TABLE `drones_prontos` (
	`id` text PRIMARY KEY NOT NULL,
	`arquetipo_id` text NOT NULL,
	`tipo` text NOT NULL,
	`marca` text NOT NULL,
	`modelo` text NOT NULL,
	`preco_min_usd` real,
	`preco_max_usd` real,
	`dados` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `drones_prontos_arquetipo_idx` ON `drones_prontos` (`arquetipo_id`);