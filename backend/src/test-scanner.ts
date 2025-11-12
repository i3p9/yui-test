import { Scanner } from "./services/scanner.js";
import { MetadataParser } from "./services/metadata-parser.js";
import { loadConfig } from "./lib/config.js";
import { bytesToSize } from "./utils/index.js";

async function main() {
	console.log("Loading config...");
	const config = await loadConfig();

	const scanner = new Scanner();
	const parser = new MetadataParser();

	for (const library of config.libraries) {
		console.log(`\n${"=".repeat(60)}`);
		console.log(
			`${library.skip ? "Skipping " : ""}Scanning: ${library.name}`
		);
		console.log(`Path: ${library.path}`);
		console.log(`Type: ${library.mediaType}`);
		console.log("=".repeat(60));

		if (!library.skip) {
			try {
				const candidates = await scanner.scanLibrary(library);

				console.log(
					`\nFound ${candidates.length} candidates. Parsing metadata...\n`
				);

				for (const candidate of candidates.slice(0, 5)) {
					// Show first 5
					const metadata = await parser.parseCandidate(
						candidate,
						library
					);

					if (metadata) {
						console.log(`\n📹 ${metadata.title}`);
						console.log(`   ID: ${metadata.videoId}`);
						console.log(
							`   Uploader: ${metadata.uploader || "Unknown"}`
						);
						console.log(
							`   Date: ${metadata.uploadDate || "Unknown"}`
						);
						console.log(
							`   Duration: ${
								metadata.durationSeconds
									? `${Math.floor(metadata.durationSeconds / 60)}:${(
											metadata.durationSeconds % 60
									  )
											.toString()
											.padStart(2, "0")}`
									: "Unknown"
							}`
						);
						console.log(`   Path: ${metadata.videoPath}`);
						console.log(
							`   Metadata: ${metadata.metadataSource} ${
								metadata.hasCompleteMetadata ? "✅" : "⚠️"
							}`
						);
						console.log(`   Subtitles: ${metadata.subtitles.length}`);
						console.log(
							`   Filesize: ${bytesToSize(metadata.filesizeBytes)}`
						);
					}
				}

				if (candidates.length > 5) {
					console.log(
						`\n... and ${candidates.length - 5} more videos`
					);
				}
			} catch (error) {
				console.error(`Error scanning library:`, error);
			}
		}
	}

	console.log("\n✅ Scan complete!");
}

main().catch(console.error);
