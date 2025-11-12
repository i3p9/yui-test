// ============================================
// SCANNER SERVICE
// ============================================
// Walks directory trees and finds video files

import { readdir, stat, access } from "fs/promises";
import { join, basename } from "path";
import type { VideoCandidate, Library } from "../types/index.js";

// ============================================
// FILESYSTEM I/O CONCEPTS
// ============================================
/*
Key Node.js fs/promises APIs:

1. readdir(path, { withFileTypes: true })
   - Returns Dirent objects (file entries with type info)
   - Dirent.isFile() / Dirent.isDirectory() / Dirent.isSymbolicLink()
   - More efficient than stat() for each file

2. stat(path)
   - Returns Stats object with file metadata
   - .size, .mtime (modified time), .birthtime (created time)

3. access(path)
   - Checks if file/folder exists and is accessible
   - Throws if not accessible

4. Async Generators (function*)
   - Allows us to "stream" results one at a time
   - Memory efficient for large directories
   - Can be consumed with for await...of
*/

// ============================================
// UTILITY FUNCTIONS
// ============================================

const MEDIA_EXTENSIONS = [
	".mp4",
	".mkv",
	".webm",
	".m4v",
	".m4a",
	".avi",
	".mov",
];
const SUBTITLE_EXTENSIONS = [".vtt", ".srt", ".ass"];
const THUMBNAIL_EXTENSIONS = [".webp", ".jpg", ".jpeg", ".png"];

export function isMediaFile(filename: string): boolean {
	return MEDIA_EXTENSIONS.some((ext) =>
		filename.toLowerCase().endsWith(ext)
	);
}

export function isSubtitleFile(filename: string): boolean {
	return SUBTITLE_EXTENSIONS.some((ext) =>
		filename.toLowerCase().endsWith(ext)
	);
}

export function isThumbnailFile(filename: string): boolean {
	return THUMBNAIL_EXTENSIONS.some((ext) =>
		filename.toLowerCase().endsWith(ext)
	);
}

// Extract YouTube ID from brackets [dQw4w9WgXcQ]
const YOUTUBE_ID_REGEX = /\[([A-Za-z0-9_-]{11})\]/;

export function extractYouTubeId(text: string): string | null {
	const match = text.match(YOUTUBE_ID_REGEX);
	return match ? match[1] : null;
}

// Check if directory contains .ignore marker file
async function hasIgnoreMarker(dirPath: string): Promise<boolean> {
	try {
		await access(join(dirPath, ".ignore"));
		return true;
	} catch {
		return false; // File doesn't exist or not accessible
	}
}

// ============================================
// MAIN SCANNER CLASS
// ============================================

export class Scanner {
	/**
	 * Walk a library directory and yield video candidates
	 *
	 * Algorithm:
	 * 1. Use a stack-based depth-first traversal (not recursive to avoid stack overflow)
	 * 2. Check for .ignore markers before descending
	 * 3. Identify video containers (directories with media files)
	 * 4. Identify loose video files with YouTube IDs
	 * 5. Yield candidates as we find them (async generator pattern)
	 */
	async *walkLibrary(
		rootPath: string
	): AsyncGenerator<VideoCandidate> {
		const stack: string[] = [rootPath];

		while (stack.length > 0) {
			// console.log("stack: ", stack);
			const currentPath = stack.pop()!;
			// console.log("currentPath: ", currentPath);

			// Check for .ignore marker - skip this directory if found
			if (await hasIgnoreMarker(currentPath)) {
				console.log(`Skipping ignored directory: ${currentPath}`);
				continue;
			}

			// Read directory contents
			let entries;
			try {
				entries = await readdir(currentPath, { withFileTypes: true }); //Dirent objects
			} catch (error) {
				console.error(`Cannot read directory ${currentPath}:`, error);
				continue;
			}
			// console.log("entries: ", entries);

			// Separate files and directories
			// Filter out hidden files (starting with .)
			const files = entries
				.filter((e) => e.isFile() && !e.name.startsWith("."))
				.map((e) => e.name);

			const dirs = entries
				.filter((e) => e.isDirectory() && !e.name.startsWith("."))
				.map((e) => e.name);

			// Check if this directory contains media files
			const mediaFiles = files.filter(isMediaFile);

			if (mediaFiles.length > 0) {
				// Extract YouTube IDs from all media files
				const videoIds = new Set(
					mediaFiles
						.map(extractYouTubeId)
						.filter((id): id is string => id !== null)
				);

				// Case 1: All media files belong to the SAME video ID
				// This is a canonical video folder (dedicated to one video)
				// Example: /Danny Gonzalez/2024-08-02 - Video Title [abc]/video.mp4
				if (videoIds.size === 1) {
					yield {
						type: "directory",
						path: currentPath,
						files: files,
					};

					// Don't descend into canonical video folders
					continue;
				}

				// If videoIds.size > 1 or === 0:
				// This is a container folder with multiple videos
				// Fall through to process loose videos and continue descending
			}

			// Case 2: Check for loose video files with YouTube IDs
			// Example: /Liked/Random Video [abc12345678].mkv
			const looseVideos = new Map<string, string[]>();

			for (const file of files) {
				const youtubeId = extractYouTubeId(file);
				if (youtubeId && isMediaFile(file)) {
					if (!looseVideos.has(youtubeId)) {
						looseVideos.set(youtubeId, []);
					}
					looseVideos.get(youtubeId)!.push(file);
				}
			}

			// Yield each loose video group
			for (const [videoId, videoFiles] of looseVideos) {
				// search all related files if available
				const relatedFiles = files.filter((f) => f.includes(videoId));

				yield {
					type: "loose",
					path: currentPath,
					files: relatedFiles,
					videoId: videoId,
				};
			}

			//add subdirs for travarsal
			for (let i = dirs.length - 1; i >= 0; i--) {
				//reverse to keep original order
				stack.push(join(currentPath, dirs[i]));
			}
		}
	}

	/**
	 * Scan a single library
	 */
	async scanLibrary(library: Library): Promise<VideoCandidate[]> {
		console.log(
			`Scanning library: ${library.name} (${library.path})`
		);

		const candidates: VideoCandidate[] = [];

		try {
			await access(library.path);
		} catch {
			throw new Error(`Library path does not exist: ${library.path}`);
		}

		// Walk the library and collect all candidates
		for await (const candidate of this.walkLibrary(library.path)) {
			candidates.push(candidate);
			console.log(
				`Found ${candidate.type} candidate: ${basename(
					candidate.path
				)}`
			);
		}

		console.log(
			`Found ${candidates.length} video candidates in ${library.name}`
		);
		return candidates;
	}
}
