// Display helpers shared by cards, the watch page, and lists.

/** 1:05 / 12:04 / 1:02:03 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0:00'
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60)
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

// Upload dates are plain YYYY-MM-DD; read them as local calendar dates so they never shift a day.
function parseDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value)
  return isNaN(d.getTime()) ? null : d
}

/** Full date, e.g. "May 6, 2017". */
export function formatFullDate(value: string | null | undefined): string {
  const d = value ? parseDay(value) : null
  return d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

/** "Today", "Yesterday", "3 days ago" within a week; the actual date after that. */
export function formatUploadDate(value: string | null | undefined): string {
  const d = value ? parseDay(value) : null
  if (!d) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return formatFullDate(value)
}
