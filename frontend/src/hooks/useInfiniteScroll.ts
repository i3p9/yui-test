// ============================================
// useInfiniteScroll
// ============================================
// Attaches an IntersectionObserver to a sentinel element placed at the bottom
// of a list. When the sentinel enters the viewport (with a 400px head-start),
// onLoadMore is called.
//
// Usage:
//   const sentinelRef = useInfiniteScroll(loadNextPage, !loading && hasMore)
//   ...
//   <div ref={sentinelRef} />   ← place at the very end of the list
//
// enabled should be false while a fetch is in flight and when there are no
// more pages — this prevents duplicate requests and unnecessary observer churn.

import { useEffect, useRef } from 'react'

export function useInfiniteScroll(
  onLoadMore: () => void,
  enabled: boolean
): React.RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Keep onLoadMore in a ref so the effect never needs to re-run because the
  // callback reference changed (avoids stale closure issues without useCallback).
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore

  useEffect(() => {
    if (!enabled) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMoreRef.current()
        }
      },
      // Fire 400px before the sentinel actually hits the viewport — gives the
      // fetch time to complete before the user reaches the bottom.
      { rootMargin: '400px' }
    )

    if (sentinelRef.current) observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [enabled]) // re-attach when enabled flips (e.g. loading finished)

  return sentinelRef
}
