export const mediaTypeHumanReadable = (mediaType: string) => {
	switch (mediaType) {
		case "channel_archive":
			return "Channel Archive";
		case "liked_videos":
			return "Liked Videos";
		default:
			return mediaType;
	}
};
