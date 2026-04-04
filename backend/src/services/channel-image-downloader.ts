// ============================================
// CHANNEL IMAGE DOWNLOADER SERVICE
// ============================================
// Downloads channel avatars and banners via yt-dlp.

import { execFile } from "child_process";
import { promisify } from "util";
import {
	access,
	copyFile,
	mkdir,
	readdir,
	rm,
	rename,
	unlink,
} from "fs/promises";
import { extname, join, resolve } from "path";
import { tmpdir } from "os";
import { mkdtemp } from "fs/promises";
import { getPrismaClient } from "../lib/database.js";
import { loadConfig } from "../lib/config.js";
import { channelImageState } from "../lib/channel-image-state.js";

const execFileAsync = promisify(execFile);
const MIN_VIDEO_COUNT = 5;

interface ChannelImageRecord {
	uploaderId: string;
	name: string;
	videoCount: number;
	avatarPath: string | null;
	bannerPath: string | null;
}

export interface ChannelImageStatusSummary {
	eligibleChannels: number;
	completeChannels: number;
	missingEither: number;
	missingAvatar: number;
	missingBanner: number;
}

export class ChannelImageDownloader {
	private prisma = getPrismaClient();

	async downloadMissingImages(): Promise<void> {
		const channels = await this.prisma.channel.findMany({
			where: {
				videoCount: {
					gte: MIN_VIDEO_COUNT,
				},
			},
			orderBy: [{ videoCount: "desc" }, { name: "asc" }],
			select: {
				uploaderId: true,
				name: true,
				videoCount: true,
				avatarPath: true,
				bannerPath: true,
			},
		});

		channelImageState.start(channels.length);

		try {
			const config = await loadConfig();
			const channelRoot = resolve(
				process.cwd(),
				config.thumbnailDir,
				"channels"
			);
			await mkdir(channelRoot, { recursive: true });

			let processed = 0;
			let skipped = 0;
			let avatarsDownloaded = 0;
			let bannersDownloaded = 0;
			let failed = 0;

			for (const channel of channels) {
				channelImageState.updateProgress({
					currentChannel: channel.name || channel.uploaderId,
				});

				try {
					const avatarExists = await this.pathExists(channel.avatarPath);
					const bannerExists = await this.pathExists(channel.bannerPath);

					if (avatarExists && bannerExists) {
						processed++;
						skipped++;
						channelImageState.updateProgress({
							processed,
							skipped,
						});
						continue;
					}

					const result = await this.downloadForChannel(channel, channelRoot);

					if (result.avatarPath) {
						avatarsDownloaded++;
					}
					if (result.bannerPath) {
						bannersDownloaded++;
					}
					if (result.error) {
						failed++;
						channelImageState.addError(result.error);
					}

					processed++;
					channelImageState.updateProgress({
						processed,
						avatarsDownloaded,
						bannersDownloaded,
						failed,
					});
				} catch (error) {
					processed++;
					failed++;
					const message = `Failed ${channel.uploaderId}: ${
						error instanceof Error ? error.message : String(error)
					}`;
					channelImageState.addError(message);
					channelImageState.updateProgress({
						processed,
						failed,
					});
				}
			}
		} finally {
			channelImageState.complete();
		}
	}

	async getStatusSummary(): Promise<ChannelImageStatusSummary> {
		const [eligibleChannels, completeChannels, missingEither, missingAvatar, missingBanner] =
			await Promise.all([
				this.prisma.channel.count({
					where: {
						videoCount: {
							gte: MIN_VIDEO_COUNT,
						},
					},
				}),
				this.prisma.channel.count({
					where: {
						videoCount: {
							gte: MIN_VIDEO_COUNT,
						},
						avatarPath: { not: null },
						bannerPath: { not: null },
					},
				}),
				this.prisma.channel.count({
					where: {
						videoCount: {
							gte: MIN_VIDEO_COUNT,
						},
						OR: [{ avatarPath: null }, { bannerPath: null }],
					},
				}),
				this.prisma.channel.count({
					where: {
						videoCount: {
							gte: MIN_VIDEO_COUNT,
						},
						avatarPath: null,
					},
				}),
				this.prisma.channel.count({
					where: {
						videoCount: {
							gte: MIN_VIDEO_COUNT,
						},
						bannerPath: null,
					},
				}),
			]);

		return {
			eligibleChannels,
			completeChannels,
			missingEither,
			missingAvatar,
			missingBanner,
		};
	}

	private async downloadForChannel(
		channel: ChannelImageRecord,
		channelRoot: string
	): Promise<{
		avatarPath?: string;
		bannerPath?: string;
		error?: string;
	}> {
		const needsAvatar = !(await this.pathExists(channel.avatarPath));
		const needsBanner = !(await this.pathExists(channel.bannerPath));

		if (!needsAvatar && !needsBanner) {
			return {};
		}

		const tempDir = await mkdtemp(join(tmpdir(), "yui-channel-images-"));

		try {
			await execFileAsync(
				"yt-dlp",
				[
					"--playlist-items",
					"0",
					"--skip-download",
					"--write-all-thumbnails",
					`https://www.youtube.com/channel/${channel.uploaderId}`,
				],
				{
					cwd: tempDir,
					maxBuffer: 10 * 1024 * 1024,
				}
			);

			const files = await readdir(tempDir);
			const avatarSource = files.find((file) =>
				/\.avatar_uncropped\.[^.]+$/i.test(file)
			);
			const bannerSource = files.find((file) =>
				/\.banner_uncropped\.[^.]+$/i.test(file)
			);

			const outputDir = join(channelRoot, channel.uploaderId);
			const updateData: {
				avatarPath?: string;
				bannerPath?: string;
			} = {};

			if (needsAvatar && avatarSource) {
				updateData.avatarPath = await this.storeAsset(
					join(tempDir, avatarSource),
					outputDir,
					"avatar"
				);
			}

			if (needsBanner && bannerSource) {
				updateData.bannerPath = await this.storeAsset(
					join(tempDir, bannerSource),
					outputDir,
					"banner"
				);
			}

			if (Object.keys(updateData).length > 0) {
				await this.prisma.channel.update({
					where: { uploaderId: channel.uploaderId },
					data: updateData,
				});
			}

			const errors: string[] = [];
			if (needsAvatar && !updateData.avatarPath) {
				errors.push(`missing avatar for ${channel.uploaderId}`);
			}
			if (needsBanner && !updateData.bannerPath) {
				errors.push(`missing banner for ${channel.uploaderId}`);
			}

			return {
				...updateData,
				error: errors.length > 0 ? errors.join("; ") : undefined,
			};
		} catch (error) {
			return {
				error: `download failed for ${channel.uploaderId}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			};
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	}

	private async storeAsset(
		sourcePath: string,
		outputDir: string,
		baseName: "avatar" | "banner"
	): Promise<string> {
		await mkdir(outputDir, { recursive: true });
		await this.removeExistingVariants(outputDir, baseName);

		const extension = extname(sourcePath).toLowerCase() || ".jpg";
		const targetPath = join(outputDir, `${baseName}${extension}`);
		await this.moveFile(sourcePath, targetPath);
		return targetPath;
	}

	private async removeExistingVariants(
		dirPath: string,
		baseName: "avatar" | "banner"
	): Promise<void> {
		const entries = await readdir(dirPath).catch(() => []);
		await Promise.all(
			entries
				.filter((entry) => entry.startsWith(`${baseName}.`))
				.map((entry) => unlink(join(dirPath, entry)).catch(() => undefined))
		);
	}

	private async moveFile(sourcePath: string, targetPath: string): Promise<void> {
		try {
			await rename(sourcePath, targetPath);
		} catch (error: any) {
			if (error?.code !== "EXDEV") {
				throw error;
			}

			await copyFile(sourcePath, targetPath);
			await unlink(sourcePath);
		}
	}

	private async pathExists(filePath?: string | null): Promise<boolean> {
		if (!filePath) return false;

		try {
			await access(filePath);
			return true;
		} catch {
			return false;
		}
	}
}
