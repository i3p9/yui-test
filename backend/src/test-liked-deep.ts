// Test to find which folder causes scanning to stop
import { Scanner } from "./services/scanner.js";
import { readdir } from "fs/promises";

const LIKED_PATH = "/Volumes/BigStorage/media/youtube/liked";

async function testDeepDive() {
	console.log("Testing scanner with detailed logging...\n");

	// Get all folders first
	const entries = await readdir(LIKED_PATH, { withFileTypes: true });
	const allFolders = entries
		.filter((e) => e.isDirectory() && !e.name.startsWith("."))
		.map((e) => e.name)
		.sort();

	console.log(`Total folders to scan: ${allFolders.length}\n`);

	const scanner = new Scanner();
	const scanned = [];
	let lastFolder = "";

	try {
		for await (const candidate of scanner.walkLibrary(LIKED_PATH)) {
			scanned.push(candidate);
			lastFolder = candidate.path.split("/").pop()!;

			if (scanned.length % 50 === 0) {
				console.log(`Progress: ${scanned.length} scanned`);
			}
		}

		console.log(`\n✓ Scan completed successfully!`);
		console.log(`Total scanned: ${scanned.length}/${allFolders.length}`);
	} catch (error) {
		console.error(`\n✗ Scanner crashed!`);
		console.error(`Last successfully scanned: ${lastFolder}`);
		console.error(`Scanned ${scanned.length}/${allFolders.length} before crash`);
		console.error(`Error:`, error);

		// Find the next folder that wasn't scanned
		const scannedNames = new Set(scanned.map((c) => c.path.split("/").pop()));
		const firstUnscanned = allFolders.find((f) => !scannedNames.has(f));
		if (firstUnscanned) {
			console.error(`\nNext folder that should have been scanned: ${firstUnscanned}`);
		}
	}
}

testDeepDive().catch(console.error);
