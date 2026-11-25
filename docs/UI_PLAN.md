# UI/UX polish plan

Goal: keep the brutalist look (black, red accent, hard borders), but make it condensed,
consistent, and detail-oriented, so it looks professional rather than rough. Some
character is fine; it shouldn't look unfinished.

Work in this order. Each phase should ship on its own with desktop and mobile checks.

## 1. Watch page (highest priority)

Problems the owner sees, and their causes in `frontend/src/pages/WatchPage.tsx`:

- **Player starts tiny, then jumps to full size.** The player sits in an `aspect-video`
  box, but Plyr sizes itself from the video's own dimensions, which aren't known until
  metadata loads. Fix: make Plyr and the `<video>` fill the reserved 16:9 box
  (`height: 100%`, `object-fit: contain`) so the space is fixed from the first paint.
- **Title pushed off screen on big videos/wide windows.** The player is full width at
  16:9, so on wide screens it's taller than the viewport. Fix: cap the player height
  (about `calc(100vh - header - title area)`) and size the width from that, centered,
  so the title and channel row are always visible without scrolling.
- **Source type is hard-coded to `video/mp4`** even for `.webm`/`.mkv` files (the
  downloader produced `.webm` in testing). Use the real type from the file extension.
- Tidy the area under the player: title, channel, date, description, and the related
  list spacing.

## 2. Shared building blocks

Before redesigning pages, settle a small set of reusable pieces so every page matches:

- Spacing and type scale: tighter padding, fewer giant headings, less all-caps monospace
  (keep it for labels and metadata, not body text).
- `Button` (primary/secondary/danger, one size + small), `Input`/`Select`/`Checkbox`,
  `Section` (titled panel), `StatusBadge`, `EmptyState`, `ErrorBanner`.
- Keep Tailwind. No component library; just a few small components in
  `frontend/src/components/ui/`.

## 3. Downloads page

`frontend/src/pages/DownloadsPage.tsx` is dense and hard to scan. Restructure into:

- Header row: status summary (running/queued/next scheduled run) + "Run all".
- Sources as a compact table/list (name, type, quality, destination, last result,
  actions), with add/edit in a drawer or inline panel instead of a long form.
- Activity: the active run on top with progress; history below, compact.
- Setup tucked into collapsible sections: schedule, cookies, tools, one-off URL, import.

## 4. Config page

Same treatment: group into clear sections (Libraries, Scanning, Metadata & images,
Liked order, Danger zone), consistent forms, less vertical sprawl.

## 5. General UX and accessibility

- Consistent loading (skeletons that match final layout size), empty, and error states.
- Keyboard: visible focus rings, logical tab order, Escape closes panels.
- Labels on all controls, sufficient contrast for zinc-on-black text, `aria-live` for
  scan/download progress.
- Check every page at phone width and on a large desktop.

## Verification for each phase

- `cd frontend && pnpm build` passes.
- Screenshots before/after at ~390px and ~1440px wide.
- Watch page: no layout jump while a video loads; title visible on a 1080p screen.
- Run the app with real data (`make dev`, or the Docker test setup on port 3002).

## Kickoff prompt for the next session

> Read docs/UI_PLAN.md. Start with phase 1 (Watch page). Show me before/after
> screenshots, then continue phase by phase, checking with me between phases.
