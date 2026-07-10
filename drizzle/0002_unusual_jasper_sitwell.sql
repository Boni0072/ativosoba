CREATE TABLE `budgetItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetId` int NOT NULL,
	`description` varchar(255) NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`type` enum('capex','opex') NOT NULL,
	`accountingClass` varchar(100),
	`assetClass` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budgetItems_id` PRIMARY KEY(`id`)
);
