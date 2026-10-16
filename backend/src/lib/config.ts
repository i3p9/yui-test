// Reads and validates config.json from project root

import { readFile, writeFile, mkdir, rename } from "fs/promises";
import { resolve, dirname } from "path";
import { z } from "zod";
import type { Config } from "../types/index.js";

// Zod schema for runtime validation
export const ScanScheduleSchema = z.object({
	enabled: z.boolean(),
	intervalHours: z.number().int().min(1).max(8760),
});

const ConfigSchema = z.object({
	libraries: z.array(
		z.object({
			path: z.string(),
			mediaType: z.enum(["channel_archive", "liked_videos"]),
			name: z.string(),
			skip: z.boolean(),
		})
	),
	thumbnailDir: z.string(),
	metadataDir: z.string(),
	databaseUrl: z.string(),
	scanOptions: z.object({
		parallelism: z.number(),
		followSymlinks: z.boolean(),
		generateThumbnails: z.boolean(),
		thumbnailConcurrency: z.number(),
		fetchMetadata: z.boolean(),
		metadataConcurrency: z.number(),
	}),
	scanSchedule: ScanScheduleSchema.default({ enabled: false, intervalHours: 48 }),
	// Optional — if absent, the app runs without auth
	auth: z.object({ password: z.string() }).optional(),
});

let cachedConfig: Config | null = null;
let pendingUpdate: Promise<unknown> = Promise.resolve();

// Default configuration
function getDefaultConfig(): Config {
	return {
		libraries: [],
		thumbnailDir: ".thumbnails",
		metadataDir: ".metadata",
		databaseUrl: process.env.DATABASE_URL || "file:/data/yui.db",
		scanSchedule: { enabled: false, intervalHours: 48 },
		scanOptions: {
			parallelism: 4,
			followSymlinks: false,
			generateThumbnails: true,
			thumbnailConcurrency: 2,
			fetchMetadata: false,
			metadataConcurrency: 2,
		},
	};
}

export function getConfigPath(): string {
	return process.env.CONFIG_PATH
		? resolve(process.env.CONFIG_PATH)
		: resolve(process.cwd(), "./config.json");
}

async function ensureConfigExists(configPath: string): Promise<void> {
	try {
		await readFile(configPath, "utf-8");
	} catch (error: any) {
		if (error.code === "ENOENT") {
			// Config doesn't exist, create default
			console.log(
				"Config file not found, creating default at:",
				configPath
			);

			// Ensure directory exists
			const dir = dirname(configPath);
			await mkdir(dir, { recursive: true });

			// Write default config
			const defaultConfig = getDefaultConfig();
			await writeFile(
				configPath,
				JSON.stringify(defaultConfig, null, 2),
				"utf-8"
			);

			console.log("✓ Created default config file");
		} else {
			throw error;
		}
	}
}

export async function loadConfig(): Promise<Config> {
	if (cachedConfig) return cachedConfig;

	const configPath = getConfigPath();

	// Ensure config file exists (create if missing)
	await ensureConfigExists(configPath);

	try {
		const configFile = await readFile(configPath, "utf-8");
		const configData = JSON.parse(configFile);

		// Add defaults for new fields (backward compatibility)
		if (!configData.metadataDir) {
			configData.metadataDir = ".metadata";
		}
		if (!configData.scanOptions.fetchMetadata) {
			configData.scanOptions.fetchMetadata = false;
		}
		if (!configData.scanOptions.metadataConcurrency) {
			configData.scanOptions.metadataConcurrency = 2;
		}

		const validated = ConfigSchema.parse(configData);

		cachedConfig = validated as Config;
		return cachedConfig;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to load config: ${error.message}`);
		}
		throw error;
	}
}

export function clearConfigCache(): void {
	cachedConfig = null;
}

// Serialize independent settings editors and replace the file atomically.
export function updateConfig(update: (current: Config) => Config): Promise<Config> {
	const operation = pendingUpdate.then(async () => {
		const config = update(await loadConfig());
		const configPath = getConfigPath();
		await writeFile(`${configPath}.tmp`, JSON.stringify(config, null, 2), "utf-8");
		await rename(`${configPath}.tmp`, configPath);
		clearConfigCache();
		return config;
	});
	pendingUpdate = operation.catch(() => {});
	return operation;
}
