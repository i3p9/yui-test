# Config Page Redesign Plan

> Goal: Reduce visual bulk and vertical scroll without losing the "everything at a glance"
> feel. Keep the brutalist aesthetic intact.

---

## Problem Analysis

The config page has grown to ~8 sections that all use the same visual weight:
full-width bordered boxes with `border-4`, large stat cards, and generous padding.
The result is a very long vertical scroll where nothing feels prioritized.

**Biggest space offenders (top to bottom):**

1. **Video Statistics** — 3 top-level stat cards + 2 sub-sections (Thumbnails By
   Source, Videos By Type) each with their own bordered boxes. Takes a huge chunk.
2. **Channel Image Manager** — 5 stat cards in a row + description paragraph +
   large action button. Tall for what it communicates.
3. **Metadata Manager** — 4 stat cards + info box + save location toggle + action
   button. Lots of vertical stacking.
4. **Scan History (Recent Scans)** — Shows up to 8 scan entries with error details
   expanded inline. Easily the tallest single section on the page.

---

## Proposed Changes

### 1. Compact the stat cards across all sections

**Current:** Each stat is a full bordered card (`border-2`, `p-4`, drop shadow) with
a label and a large number (`text-2xl` / `text-3xl`). These are visually heavy.

**Proposed:** Switch to an inline/dense stat row format. Instead of individual cards
in a grid, use a single bordered container with stats displayed as a horizontal row
of label-value pairs separated by dividers.

```
Before:
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Eligible │ │ Complete │ │ Missing  │ │ Missing  │ │ Missing  │
│    35    │ │    34    │ │ Either 1 │ │ Avatar 0 │ │ Banner 1 │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘

After:
┌─────────────────────────────────────────────────────────────────┐
│ ELIGIBLE  35  │  COMPLETE  34  │  MISSING  1  │  AVT  0  │  BNR  1 │
└─────────────────────────────────────────────────────────────────┘
```

**Applies to:** VideoStats top row, ChannelImageManager stats, MetadataManager stats,
LikedVideoOrderImport stats, DangerZone stats.

**How:** Replace the `grid` of individually bordered `div`s with a single `flex`
container with `divide-x divide-zinc-800`. Remove individual shadows. Reduce number
size from `text-2xl`/`text-3xl` to `text-lg`/`text-xl`. Keep the color coding on
numbers.

### 2. Merge Video Stats sub-sections into a single table

**Current:** "Thumbnails By Source" and "Videos By Type" are two separate bordered
boxes, each containing a mini-list of key-value rows.

**Proposed:** Combine into one compact table/list with a category column. Something
like:

```
┌─────────────────────────────────────────────────────────┐
│ BREAKDOWN                                               │
│  Thumbnails   Original Files ................ 3766      │
│               Generated (FFmpeg) .............  34      │
│  Videos       Channel Archive .............. 3172      │
│               Liked Videos ...................  678      │
└─────────────────────────────────────────────────────────┘
```

This merges two bordered boxes into one, cutting ~60px of borders + padding + gap.

### 3. Slim down Channel Image Manager

**Current layout:**
- Header + multi-line description
- 5 stat cards (grid)
- Full-width action button

**Proposed:**
- Keep header, shorten description to one line (or move to a tooltip/hover)
- Compact stat row (per change #1)
- Slim action button: reduce `py-4` to `py-3`, keep full width

### 4. Condense Metadata Manager info box

**Current:** The info box (`border-2 border-cyan-800`) has two paragraphs of
explanation text. Below it is the save location toggle.

**Proposed:** Merge the info text and the save location toggle into one block. The
info text can be a single shorter sentence. The "Save Metadata to Video Folder"
checkbox and its explanation can sit right under it in the same bordered container
instead of being a separate element.

### 5. Scan History: collapsed by default, show last result summary

This is the biggest win. The scan history table with 8 rows of dense data + inline
error messages is the longest section on the page.

**Current:** Full table always visible showing up to 8 scan entries.

**Proposed:**
- **Default state (collapsed):** Show only a single-line summary of the most recent
  scan result, styled inline with the section header. Example:

  ```
  ┌──────────────────────────────────────────────────────────────┐
  │ HISTORY FEED                                                 │
  │ RECENT SCANS                                    [EXPAND ▾]   │
  │                                                              │
  │ Last: COMPLETED • Incremental • Apr 3, 01:29 PM • 2m 48s    │
  │       Scanned 3060 • Added 82 • All Libraries               │
  └──────────────────────────────────────────────────────────────┘
  ```

  If the last scan failed, highlight the summary line in red to draw attention.

- **Expanded state:** The full table as it exists today, toggled via the expand
  button.

**Implementation:**
- Add `expanded` state (default `false`) to `ScanHistory` component
- When collapsed, render only `history[0]` as a formatted summary line
- The expand/collapse button sits in the header row next to "Refresh"

### 6. Tighten global spacing

**Current:** All sections use `mt-6` (24px) between them. Internal padding is `p-5`
or `p-6`.

**Proposed:**
- Keep `mt-6` between major section groups but reduce internal `p-6` to `p-5`
  consistently (some components use `p-6`, some `p-5` — normalize to `p-5`)
- Reduce `mb-6` inside components (header-to-content gap) to `mb-4`
- This is subtle but compounds across 8 sections

### 7. Like Order Import: reduce "Expected Format" box

**Current:** The "Expected Format" section shows a 3-line code example + explanation.
It takes noticeable vertical space for something that's essentially a one-time
reference.

**Proposed:** Move the format example into a collapsible detail or reduce to a single
line:

```
Format: <serial> <youtube_id> per line (1 = oldest)
```

Show the full multi-line example only when no file is selected (as a hint), or behind
a "Show format" toggle.

---

## Section-by-Section Summary

| Section | Change | Est. Height Savings |
|---------|--------|-------------------|
| Video Statistics | Compact stat row + merge sub-tables | ~80-100px |
| Channel Images | Compact stat row + shorter desc | ~40-60px |
| Metadata Manager | Compact stats + merge info/toggle | ~50-60px |
| Like Order Import | Condense format example | ~30-40px |
| Scan History | Collapse by default, show last result | ~250-350px |
| Global spacing | Normalize padding, tighten gaps | ~40-60px |
| **Total** | | **~490-670px saved** |

---

## What NOT to Change

- The brutalist border/shadow/monospace design language
- Color coding on status badges and stat numbers
- The section order on the page
- Library Management section (already compact, used frequently)
- Scan Controls + Scan Progress two-column layout (good as-is)
- DangerZone (already hidden behind a toggle — perfect)
- The page header

---

## Implementation Order

1. **Scan History collapse** — biggest single win, isolated to one component
2. **Compact stat rows** — apply the pattern to VideoStats first, then replicate to
   ChannelImageManager, MetadataManager, LikedVideoOrderImport
3. **Merge Video Stats sub-tables** — follows naturally from #2
4. **Metadata Manager info/toggle merge** — small targeted change
5. **Like Order format condensing** — small targeted change
6. **Global spacing normalization** — final pass across all components

Each step can be done independently and verified visually before moving to the next.
