// ============================================
// DIAGNOSTIC SCRIPT FOR LIKED VIDEOS SCANNING
// ============================================
// This script helps diagnose why the scanner isn't finding all videos

import { Scanner } from "./services/scanner.js";
import { readdir } from "fs/promises";
import { join } from "path";

const LIKED_PATH = "/Volumes/BigStorage/media/youtube/liked";

async function countDirectories(path: string): Promise<number> {
	try {
		const entries = await readdir(path, { withFileTypes: true });
		return entries.filter(
			(e) => e.isDirectory() && !e.name.startsWith(".")
		).length;
	} catch (error) {
		console.error(`Error reading directory ${path}:`, error);
		return 0;
	}
}

async function diagnose() {
	console.log("=".repeat(60));
	console.log("LIKED VIDEOS SCANNER DIAGNOSTIC");
	console.log("=".repeat(60));
	console.log(`Library Path: ${LIKED_PATH}\n`);

	// 1. Get all actual folders
	console.log("Step 1: Getting all folders in Liked directory...");
	const entries = await readdir(LIKED_PATH, { withFileTypes: true });
	const allFolders = entries
		.filter((e) => e.isDirectory() && !e.name.startsWith("."))
		.map((e) => e.name)
		.sort();
	console.log(`Found ${allFolders.length} folders\n`);

	// 2. Run scanner
	console.log("Step 2: Running scanner...");
	const scanner = new Scanner();
	const candidates: any[] = [];

	try {
		for await (const candidate of scanner.walkLibrary(LIKED_PATH)) {
			candidates.push(candidate);
		}
	} catch (error) {
		console.error("Scanner error:", error);
	}

	console.log(`\n${"=".repeat(60)}`);
	console.log("RESULTS:");
	console.log(`Actual folders: ${allFolders.length}`);
	console.log(`Videos found by scanner: ${candidates.length}`);
	console.log(`Missing: ${allFolders.length - candidates.length}`);
	console.log("=".repeat(60));

	// 3. Find missing folders
	const scannedFolderNames = new Set(
		candidates.map((c) => c.path.split("/").pop())
	);
	const missingFolders = allFolders.filter(
		(f) => !scannedFolderNames.has(f)
	);

	if (missingFolders.length > 0) {
		console.log("\nMissing folders:");
		for (const folder of missingFolders) {
			console.log(`  - ${folder}`);

			// Check what's inside this folder
			const folderPath = join(LIKED_PATH, folder);
			try {
				const files = await readdir(folderPath);
				console.log(`    Files in folder: ${files.join(", ")}`);
			} catch (error) {
				console.log(`    Error reading folder: ${error}`);
			}
		}
	}

	// 4. Detailed breakdown
	console.log("\nCandidate breakdown:");
	const byType = candidates.reduce((acc, c) => {
		acc[c.type] = (acc[c.type] || 0) + 1;
		return acc;
	}, {} as Record<string, number>);

	for (const [type, count] of Object.entries(byType)) {
		console.log(`  ${type}: ${count}`);
	}
}

diagnose().catch(console.error);
