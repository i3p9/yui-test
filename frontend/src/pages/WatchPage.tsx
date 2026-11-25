import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import Plyr from "plyr-react";
import "plyr-react/plyr.css";
import {
	getVideo,
	getStreamUrl,
	getRelatedVideos,
	getVideoNavigation,
	updateWatchProgress,
	getWatchProgress,
	getThumbnailUrl,
} from "../lib/api";
import { ErrorBanner } from "../components/ui";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { ChannelAvatar } from "../components/ChannelCard";
import { formatDuration, formatFullDate, formatUploadDate } from "../utils/format";

interface Video {
	videoId: string;
	title: string;
	uploader: string | null;
	uploadDate: string | null;
	durationSeconds: number | null;
	description: string | null;
	uploaderId: string | null;
	thumbnailPath: string | null;
	videoPath?: string | null;
	hasThumbnails?: boolean | null;
	thumbnailSource?: string | null;
}

// Types the browser can be told up front. Anything else (e.g. .mkv) is left
// untyped so the browser sniffs the stream instead of rejecting the source.
const SOURCE_TYPES: Record<string, string> = {
	mp4: "video/mp4",
	m4v: "video/mp4",
	webm: "video/webm",
	mov: "video/quicktime",
};

const PLYR_OPTIONS = {
	controls: [
		"play-large",
		"play",
		"progress",
		"current-time",
		"duration",
		"mute",
		"volume",
		"settings",
		"fullscreen",
	],
	keyboard: { focused: true, global: true },
	autoplay: true,
};

const pulse = "bg-zinc-800 animate-pulse";

export function WatchPage() {
	const { videoId } = useParams<{ videoId: string }>();
	const playerRef = useRef<any>(null);
	const resumeAt = useRef(0);
	const lastSaved = useRef(0);

	const [video, setVideo] = useState<Video | null>(null);
	const [relatedVideos, setRelatedVideos] = useState<Video[]>([]);
	const [prevVideo, setPrevVideo] = useState<Video | null>(null);
	const [nextVideo, setNextVideo] = useState<Video | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showFullDescription, setShowFullDescription] =
		useState(false);

	useEffect(() => {
		if (videoId) {
			setShowFullDescription(false);
			loadVideo();
			loadRelated();
			loadNavigation();
		}
	}, [videoId]);

	const loadVideo = async () => {
		if (!videoId) return;

		try {
			setLoading(true);
			setError(null);
			// Fetch saved progress first: the player is only created once `video`
			// is set, so the position is ready when its metadata loads.
			const [data, progressData] = await Promise.all([
				getVideo(videoId),
				getWatchProgress(videoId).catch(() => ({ progress: null })),
			]);
			const saved = progressData.progress;
			resumeAt.current = saved && !saved.completed ? saved.positionSeconds : 0;
			setVideo(data);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load video"
			);
		} finally {
			setLoading(false);
		}
	};

	const loadRelated = async () => {
		if (!videoId) return;
		try {
			const data = await getRelatedVideos(videoId, 20);
			setRelatedVideos(data.videos);
		} catch (err) {
			console.error("Failed to load related videos:", err);
		}
	};

	const loadNavigation = async () => {
		if (!videoId) return;
		try {
			const data = await getVideoNavigation(videoId);
			setPrevVideo(data.prev);
			setNextVideo(data.next);
		} catch (err) {
			console.error("Failed to load navigation:", err);
		}
	};

	const saveProgress = async () => {
		if (!videoId || !playerRef.current?.plyr) return;
		const player = playerRef.current.plyr;
		try {
			await updateWatchProgress(
				videoId,
				Math.floor(player.currentTime),
				Math.floor(player.duration || 0)
			);
		} catch (err) {
			console.error("Failed to save progress:", err);
		}
	};

	// timeupdate fires several times a second; save at most every 5 seconds.
	const handleTimeUpdate = () => {
		const now = Date.now();
		if (now - lastSaved.current < 5000) return;
		lastSaved.current = now;
		saveProgress();
	};

	// Resume where the viewer left off (skipped near the very end).
	const handleLoadedMetadata = () => {
		const player = playerRef.current?.plyr;
		const at = resumeAt.current;
		resumeAt.current = 0;
		if (player && at > 5 && at < (player.duration || Infinity) - 10) player.currentTime = at;
	};

	// plyr-react rebuilds the player whenever `source` changes identity, so it
	// must stay the same object across re-renders (e.g. expanding the description).
	const loadedId = video?.videoId;
	const videoPath = video?.videoPath;
	const source = useMemo(() => {
		if (!loadedId) return null;
		const type = SOURCE_TYPES[videoPath?.split(".").pop()?.toLowerCase() ?? ""];
		return {
			type: "video" as const,
			sources: [{ src: getStreamUrl(loadedId), ...(type && { type }) }],
		};
	}, [loadedId, videoPath]);

	// Plyr swaps in its own <video> element when it loads a source, so React's
	// media props never fire. Media events don't bubble, but they do pass through
	// ancestors in the capture phase, so listen on the box we own.
	const handlers = useRef({ handleTimeUpdate, handleLoadedMetadata, saveProgress });
	handlers.current = { handleTimeUpdate, handleLoadedMetadata, saveProgress };
	const playerBox = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const box = playerBox.current;
		if (!box) return;
		const listeners: [string, () => void][] = [
			["timeupdate", () => handlers.current.handleTimeUpdate()],
			["loadedmetadata", () => handlers.current.handleLoadedMetadata()],
			["pause", () => handlers.current.saveProgress()],
		];
		listeners.forEach(([type, fn]) => box.addEventListener(type, fn, true));
		return () => listeners.forEach(([type, fn]) => box.removeEventListener(type, fn, true));
	}, [loading]);

	useDocumentTitle(video?.title);

	if (!loading && (error || !video || !videoId)) {
		return (
			<div className='p-4 md:p-6'>
				<ErrorBanner>{error || "Video not found"}</ErrorBanner>
			</div>
		);
	}


	return (
		<div className='h-full overflow-y-auto lg:flex lg:overflow-hidden bg-black'>
			{/* Main column */}
			<div className='lg:flex-1 lg:min-w-0 lg:overflow-y-auto'>
				{/* Player: box is sized before the video is known, so no jump */}
				<div className='watch-column md:px-6 md:pt-4 md:box-content'>
					<div ref={playerBox} className='watch-player bg-zinc-950'>
						{video && source ? (
							<Plyr
								ref={playerRef}
								source={source}
								options={PLYR_OPTIONS}
							/>
						) : (
							<div className={`w-full h-full ${pulse}`} />
						)}
					</div>

					{/* Info */}
					<div className='px-4 md:px-0 pt-3 pb-6'>
						{video ? (
							<>
								<h1 className='text-lg md:text-xl font-bold leading-snug text-white line-clamp-2'>
									{video.title}
								</h1>

								<div className='mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-sm'>
									{video.uploader && (
										<Link
											to={
												video.uploaderId
													? `/channels/${video.uploaderId}`
													: "#"
											}
											className='flex items-center gap-2 font-semibold text-white hover:text-red-500 transition-colors'
										>
											{video.uploaderId && (
												<ChannelAvatar channelId={video.uploaderId} className='h-8 w-8' />
											)}
											{video.uploader}
										</Link>
									)}
									{video.uploadDate && (
										<span className='text-xs text-zinc-400' title={formatFullDate(video.uploadDate)}>
											{formatUploadDate(video.uploadDate)}
										</span>
									)}
								</div>
							</>
						) : (
							<>
								<div className={`h-6 w-3/4 ${pulse}`} />
								<div className='mt-3 flex items-center gap-3'>
									<div className={`w-7 h-7 rounded-full ${pulse}`} />
									<div className={`h-4 w-32 ${pulse}`} />
									<div className={`h-3 w-20 ${pulse}`} />
								</div>
							</>
						)}

						{/* Description */}
						{video?.description && (
							<div className='mt-4 bg-zinc-950 border-2 border-zinc-800 px-4 py-3'>
								<div
									className={`text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap break-words ${
										!showFullDescription ? "line-clamp-3" : ""
									}`}
								>
									{video.description}
								</div>
								{video.description.length > 200 && (
									<button
										onClick={() =>
											setShowFullDescription(!showFullDescription)
										}
										className='mt-2 font-mono text-xs font-bold text-red-500 hover:text-red-400'
									>
										{showFullDescription ? "SHOW LESS" : "SHOW MORE"}
									</button>
								)}
							</div>
						)}

						{/* Prev / next */}
						{(prevVideo || nextVideo) && (
							<div className='mt-4 grid grid-cols-2 gap-2'>
								{[
									{ v: prevVideo, label: "← PREVIOUS", align: "" },
									{ v: nextVideo, label: "NEXT →", align: "text-right col-start-2" },
								].map(
									({ v, label, align }) =>
										v && (
											<Link
												key={label}
												to={`/watch/${v.videoId}`}
												className={`${align} bg-zinc-950 border-2 border-zinc-800 hover:border-red-600 px-3 py-2 transition-colors min-w-0`}
											>
												<div className='font-mono text-[11px] text-zinc-500'>
													{label}
												</div>
												<div className='text-sm font-semibold text-white truncate'>
													{v.title}
												</div>
											</Link>
										)
								)}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Related: below the info on narrow screens, sidebar on lg+ */}
			<aside className='lg:w-96 lg:flex-shrink-0 lg:overflow-y-auto bg-zinc-950 border-t-4 lg:border-t-0 lg:border-l-4 border-zinc-900'>
				<div className='p-4'>
					<h2 className='font-mono text-xs font-bold tracking-widest text-zinc-400 mb-3'>
						RELATED
					</h2>
					<div className='space-y-3'>
						{relatedVideos.length === 0 && loading
							? Array.from({ length: 6 }).map((_, i) => (
									<div key={i} className='flex gap-3'>
										<div className={`w-40 aspect-video flex-shrink-0 ${pulse}`} />
										<div className='flex-1 space-y-2'>
											<div className={`h-4 w-full ${pulse}`} />
											<div className={`h-3 w-1/2 ${pulse}`} />
										</div>
									</div>
							  ))
							: relatedVideos.map((rv) => (
									<Link
										key={rv.videoId}
										to={`/watch/${rv.videoId}`}
										className='flex gap-3 group'
									>
										<div className='relative w-40 aspect-video bg-zinc-900 border-2 border-zinc-800 group-hover:border-red-600 transition-colors flex-shrink-0 overflow-hidden'>
											{rv.hasThumbnails || rv.thumbnailPath ? (
												<img
													src={getThumbnailUrl(rv.videoId, "small")}
													alt=''
													loading='lazy'
													className='w-full h-full object-cover'
												/>
											) : (
												<div className='w-full h-full flex items-center justify-center'>
													<svg
														className='w-8 h-8 text-zinc-700'
														fill='currentColor'
														viewBox='0 0 24 24'
													>
														<path d='M8 5v14l11-7z' />
													</svg>
												</div>
											)}
											{!!rv.durationSeconds && (
												<span className='absolute bottom-1 right-1 bg-black/85 px-1 font-mono text-[10px] font-bold'>
													{formatDuration(rv.durationSeconds)}
												</span>
											)}
										</div>
										<div className='flex-1 min-w-0'>
											<h3 className='text-sm font-semibold leading-snug line-clamp-2 text-white group-hover:text-red-500 transition-colors'>
												{rv.title}
											</h3>
											{rv.uploader && (
												<p className='mt-1 text-xs text-zinc-400 truncate'>
													{rv.uploader}
												</p>
											)}
											{rv.uploadDate && (
												<p className='text-xs text-zinc-500' title={formatFullDate(rv.uploadDate)}>
													{formatUploadDate(rv.uploadDate)}
												</p>
											)}
										</div>
									</Link>
							  ))}
					</div>
				</div>
			</aside>
		</div>
	);
}
