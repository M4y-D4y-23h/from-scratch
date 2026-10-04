CREATE TABLE `arquetipos` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`firmware` text NOT NULL,
	`dados` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `catalogo_meta` (
	`fonte` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`itens` integer NOT NULL,
	`sincronizado_em` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `componentes` (
	`id` text PRIMARY KEY NOT NULL,
	`categoria` text NOT NULL,
	`marca` text NOT NULL,
	`modelo` text NOT NULL,
	`massa_g` real,
	`preco_min_brl` real,
	`preco_max_brl` real,
	`preco_min_usd` real,
	`preco_max_usd` real,
	`status_verificacao` text NOT NULL,
	`dados` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `componentes_categoria_idx` ON `componentes` (`categoria`);--> statement-breakpoint
CREATE TABLE `configuracoes` (
	`chave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL,
	`atualizado_em` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `eventos_seguranca` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`origem` text NOT NULL,
	`texto` text NOT NULL,
	`classificacao` text NOT NULL,
	`categorias` text DEFAULT '[]' NOT NULL,
	`motivo` text NOT NULL,
	`acao` text NOT NULL,
	`projeto_id` text,
	`criado_em` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ferramentas` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`tipo` text NOT NULL,
	`prioridade` text NOT NULL,
	`preco_min_brl` real NOT NULL,
	`preco_max_brl` real NOT NULL,
	`preco_data` text NOT NULL,
	`dados` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ferramentas_que_tenho` (
	`ferramenta_id` text PRIMARY KEY NOT NULL,
	`criado_em` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mensagens_chat` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projeto_id` text NOT NULL,
	`papel` text NOT NULL,
	`conteudo` text NOT NULL,
	`passo_id` text,
	`anexos` text DEFAULT '[]' NOT NULL,
	`criado_em` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`projeto_id`) REFERENCES `projetos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mensagens_chat_projeto_idx` ON `mensagens_chat` (`projeto_id`);--> statement-breakpoint
CREATE TABLE `perfis_firmware` (
	`id` text PRIMARY KEY NOT NULL,
	`firmware` text NOT NULL,
	`versao_min` text NOT NULL,
	`dados` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `progresso_passos` (
	`projeto_id` text NOT NULL,
	`passo_id` text NOT NULL,
	`status` text NOT NULL,
	`checkpoint_confirmado_em` integer,
	`atualizado_em` integer NOT NULL,
	PRIMARY KEY(`projeto_id`, `passo_id`),
	FOREIGN KEY (`projeto_id`) REFERENCES `projetos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projetos` (
	`id` text PRIMARY KEY NOT NULL,
	`categoria` text DEFAULT 'drone' NOT NULL,
	`titulo` text NOT NULL,
	`prompt_original` text NOT NULL,
	`versao_atual` integer DEFAULT 1 NOT NULL,
	`criado_em` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`atualizado_em` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tabelas_empuxo` (
	`id` text PRIMARY KEY NOT NULL,
	`motor_id` text NOT NULL,
	`helice_id` text NOT NULL,
	`celulas` integer NOT NULL,
	`status_verificacao` text NOT NULL,
	`dados` text NOT NULL,
	FOREIGN KEY (`motor_id`) REFERENCES `componentes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`helice_id`) REFERENCES `componentes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tabelas_empuxo_conjunto_idx` ON `tabelas_empuxo` (`motor_id`,`helice_id`,`celulas`);--> statement-breakpoint
CREATE TABLE `termos_glossario` (
	`termo` text PRIMARY KEY NOT NULL,
	`explicacao` text NOT NULL,
	`analogia` text,
	`relacionados` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`hash` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`largura` integer NOT NULL,
	`altura` integer NOT NULL,
	`bytes` integer NOT NULL,
	`caminho` text NOT NULL,
	`criado_em` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uso_api` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rota` text NOT NULL,
	`modelo` text NOT NULL,
	`tokens_entrada` integer NOT NULL,
	`tokens_saida` integer NOT NULL,
	`tokens_cache_escrita` integer DEFAULT 0 NOT NULL,
	`tokens_cache_leitura` integer DEFAULT 0 NOT NULL,
	`custo_usd` real NOT NULL,
	`cambio_brl` real NOT NULL,
	`custo_brl` real NOT NULL,
	`projeto_id` text,
	`criado_em` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `uso_api_data_idx` ON `uso_api` (`criado_em`);--> statement-breakpoint
CREATE TABLE `versoes_projeto` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projeto_id` text NOT NULL,
	`numero` integer NOT NULL,
	`motivo` text NOT NULL,
	`catalogo_hash` text NOT NULL,
	`intencao` text,
	`respostas` text,
	`opcoes` text,
	`opcao_escolhida` text,
	`bom` text,
	`calculos` text,
	`dificuldade` text,
	`custos` text,
	`locais` text,
	`alertas` text,
	`cena` text,
	`criado_em` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`projeto_id`) REFERENCES `projetos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `versoes_projeto_numero_idx` ON `versoes_projeto` (`projeto_id`,`numero`);