// ============================================
// SCANNER SERVICE
// ============================================
// Walks directory trees and finds video files

import { readdir, access, readFile } from "fs/promises";
import { join, basename, dirname, resolve } from "path";
import type {
	VideoCandidate,
	Library,
	ChannelOverrides,
	ChannelImageCandidate,
} from "../types/index.js";

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

// Extract YouTube Channel ID from brackets [UC...]
const CHANNEL_ID_REGEX = /\[(UC[A-Za-z0-9_-]{22})\]/;

export function extractChannelId(text: string): string | null {
	const match = text.match(CHANNEL_ID_REGEX);
	return match ? match[1] : null;
}

// Check if file list contains .ignore marker (no syscall needed)
function hasIgnoreMarker(fileNames: Set<string>): boolean {
	return fileNames.has(".ignore");
}

// Read and parse overrides.txt file from channel root (single syscall)
async function readChannelOverrides(
	dirPath: string
): Promise<ChannelOverrides | null> {
	try {
		const content = await readFile(join(dirPath, "overrides.txt"), "utf-8");
		return JSON.parse(content);
	} catch {
		return null; // File doesn't exist or invalid JSON
	}
}

// ============================================
// MAIN SCANNER CLASS
// ============================================

export class Scanner {
	// Channel images found during the last walkLibrary call
	private _channelImages: ChannelImageCandidate[] = [];

	/**
	 * Walk a library directory and yield video candidates.
	 * Also collects channel images during the same traversal
	 * so we don't need a second walk.
	 */
	async *walkLibrary(
		rootPath: string
	): AsyncGenerator<VideoCandidate> {
		const normalizedRootPath = resolve(rootPath);
		this._channelImages = [];

		// Stack stores [path, overrides] tuples
		const stack: Array<[string, ChannelOverrides | null]> = [
			[normalizedRootPath, null],
		];

		while (stack.length > 0) {
			const [currentPath, currentOverrides] = stack.pop()!;

			// Read directory contents (single readdir per directory)
			let entries;
			try {
				entries = await readdir(currentPath, { withFileTypes: true });
			} catch (error) {
				console.error(`Cannot read directory ${currentPath}:`, error);
				continue;
			}

			// Build a set of all names for fast lookups (.ignore check etc.)
			const allNames = new Set(entries.map((e) => e.name));

			// Check for .ignore marker from the listing (no extra syscall)
			if (allNames.has(".ignore")) {
				continue;
			}

			// Separate files and directories (filter hidden)
			const files = entries
				.filter((e) => e.isFile() && !e.name.startsWith("."))
				.map((e) => e.name);

			const dirs = entries
				.filter((e) => e.isDirectory() && !e.name.startsWith("."))
				.map((e) => e.name);

			// Check if this is a channel root and read overrides
			let overrides = currentOverrides;
			const parentPath = dirname(currentPath);

			if (parentPath === normalizedRootPath && !currentOverrides) {
				overrides = allNames.has("overrides.txt")
					? await readChannelOverrides(currentPath)
					: null;
			}

			// Detect channel images in this directory (piggyback on same walk)
			const detectedImages = this.detectChannelImages(currentPath, files);
			if (detectedImages.length > 0) {
				this._channelImages.push(...detectedImages);
			}

			// Check if this directory contains media files
			const mediaFiles = files.filter(isMediaFile);

			if (mediaFiles.length > 0) {
				const videoIds = new Set(
					mediaFiles
						.map(extractYouTubeId)
						.filter((id): id is string => id !== null)
				);

				// Case 1: Canonical video folder (single video ID)
				if (videoIds.size === 1) {
					yield {
						type: "directory",
						path: currentPath,
						files: files,
						overrides: overrides || undefined,
					};
					continue; // Don't descend
				}
			}

			// Case 2: Loose video files with YouTube IDs
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

			for (const [videoId, videoFiles] of looseVideos) {
				const relatedFiles = files.filter((f) => f.includes(videoId));
				yield {
					type: "loose",
					path: currentPath,
					files: relatedFiles,
					videoId: videoId,
					overrides: overrides || undefined,
				};
			}

			// Add subdirs for traversal (reverse to keep original order)
			for (let i = dirs.length - 1; i >= 0; i--) {
				stack.push([join(currentPath, dirs[i]), overrides]);
			}
		}
	}

	/**
	 * Get channel images found during the last walkLibrary call.
	 */
	getCollectedChannelImages(): ChannelImageCandidate[] {
		return this._channelImages;
	}

	/**
	 * Detect channel images in a given directory
	 * Looks for files that match the channel ID pattern
	 */
	detectChannelImages(
		dirPath: string,
		files: string[]
	): ChannelImageCandidate[] {
		const channelImages: ChannelImageCandidate[] = [];

		for (const file of files) {
			// Check if file is an image
			if (!isThumbnailFile(file)) continue;

			// Extract channel ID from filename
			const channelId = extractChannelId(file);
			if (!channelId) continue;

			// Extract channel name from filename
			// Pattern: "NA - gabi belle - Videos [UC-...].jpg"
			// Remove the channel ID part and extract the name
			let channelName = file
				.replace(/\[UC[A-Za-z0-9_-]{22}\].*$/, "") // Remove [UC...].ext
				.replace(/^.*? - /, "") // Remove "NA - " prefix
				.replace(/ - Videos $/, "") // Remove " - Videos" suffix
				.trim();

			// Fallback: use directory name if we can't parse the name
			if (!channelName) {
				channelName = basename(dirPath);
			}

			channelImages.push({
				channelId,
				imagePath: join(dirPath, file),
				channelName,
			});
		}

		return channelImages;
	}

	/**
	 * Scan a single library. Returns video candidates.
	 * Channel images are collected during the walk — retrieve with getCollectedChannelImages().
	 */
	async scanLibrary(library: Library): Promise<VideoCandidate[]> {
		const candidates: VideoCandidate[] = [];

		try {
			await access(library.path);
		} catch {
			throw new Error(`Library path does not exist: ${library.path}`);
		}

		for await (const candidate of this.walkLibrary(library.path)) {
			candidates.push(candidate);
		}

		return candidates;
	}
}
