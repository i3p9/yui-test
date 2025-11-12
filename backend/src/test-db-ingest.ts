// ============================================
// FULL SCAN TEST - Ingests to Database
// ============================================

import { ScanOrchestrator } from "./services/scan-orchestrator.js";
import { getPrismaClient } from "./lib/database.js";

async function main() {
	console.log("🚀 Starting full scan with database ingestion...\n");

	const orchestrator = new ScanOrchestrator();

	// Run the scan
	const result = await orchestrator.scan({
		mode: "full",
	});

	// Show summary
	console.log("\n📊 Final Results:");
	console.log(`   Duration: ${(result.duration / 1000).toFixed(2)}s`);
	console.log(`   Videos Scanned: ${result.videosScanned}`);
	console.log(`   Videos Added: ${result.videosAdded}`);
	console.log(`   Videos Updated: ${result.videosUpdated}`);
	console.log(`   Videos Removed: ${result.videosRemoved}`);
	console.log(`   Errors: ${result.errors.length}`);

	if (result.errors.length > 0) {
		console.log("\n❌ Errors:");
		result.errors.forEach((err) => console.log(`   - ${err}`));
	}

	// Query database to verify
	const prisma = getPrismaClient();
	const totalVideos = await prisma.video.count();
	const totalChannels = await prisma.channel.count();

	console.log("\n💾 Database Status:");
	console.log(`   Total Videos: ${totalVideos}`);
	console.log(`   Total Channels: ${totalChannels}`);

	// Show a few sample videos
	const sampleVideos = await prisma.video.findMany({
		take: 3,
		orderBy: { lastScannedAt: "desc" },
		select: {
			videoId: true,
			title: true,
			uploader: true,
			uploadDate: true,
			metadataSource: true,
			hasCompleteMetadata: true,
		},
	});

	console.log("\n📹 Sample Videos:");
	sampleVideos.forEach((v) => {
		console.log(`   ${v.videoId}: ${v.title}`);
		console.log(
			`      ${v.uploader || "Unknown"} - ${v.uploadDate || "No date"}`
		);
		console.log(
			`      Metadata: ${v.metadataSource} ${
				v.hasCompleteMetadata ? "✅" : "⚠️"
			}`
		);
	});

	await prisma.$disconnect();
}

main().catch(console.error);
