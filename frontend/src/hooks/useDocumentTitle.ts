import { useEffect } from 'react'

/** Sets the browser tab title to "<title> · YUI" (or just "YUI"). */
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · YUI` : 'YUI'
  }, [title])
}
