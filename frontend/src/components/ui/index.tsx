// Small shared UI pieces. Brutalist: black, hard 2px borders, red accent.
// Monospace caps are for labels and metadata only; body text stays sans.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cloneElement, forwardRef, isValidElement, useEffect, useId, useRef, useState } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export const label = 'font-mono text-[11px] uppercase tracking-wider text-zinc-400'

// ─── Layout ──────────────────────────────────────────────────────────────────

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('px-4 py-4 md:px-6 md:py-4', className)}>{children}</div>
}

/** Page title row: title + red rule, optional meta line, actions on the right. */
export function PageHeader({ title, meta, actions, icon }: {
  title: ReactNode; meta?: ReactNode; actions?: ReactNode; icon?: ReactNode
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b-2 border-zinc-900 pb-2">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-lg font-black uppercase tracking-tight md:text-xl">
          {icon}<span className="truncate">{title}</span>
        </h1>
        <div className="mt-1 h-0.5 w-8 bg-red-600" />
        {meta && <p className="mt-1.5 font-mono text-xs text-zinc-500">{meta}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Titled panel. `tone="danger"` for destructive areas. */
export function Section({ title, description, actions, children, tone, className, id }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode
  tone?: 'danger'; className?: string; id?: string
}) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section id={id} aria-labelledby={headingId}
      className={cx('border-2 bg-zinc-950', tone === 'danger' ? 'border-red-900' : 'border-zinc-800', className)}>
      <div className={cx('flex flex-wrap items-center justify-between gap-2 border-b-2 px-3 py-2',
        tone === 'danger' ? 'border-red-900' : 'border-zinc-800')}>
        <div className="min-w-0">
          <h2 id={headingId} className={cx('text-xs font-bold uppercase tracking-wider', tone === 'danger' && 'text-red-400')}>{title}</h2>
          {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children !== undefined && <div className="p-3">{children}</div>}
    </section>
  )
}

// ─── Controls ────────────────────────────────────────────────────────────────

const buttonVariants = {
  primary: 'border-red-600 bg-red-600 text-white hover:border-red-500 hover:bg-red-500',
  secondary: 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 hover:text-white',
  danger: 'border-zinc-700 bg-zinc-900 text-red-400 hover:border-red-600 hover:bg-red-950 hover:text-red-200',
  ghost: 'border-transparent text-zinc-400 hover:border-zinc-700 hover:text-white',
}

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonVariants; size?: 'md' | 'sm' }) {
  return (
    <button type={type} {...props} className={cx(
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap border-2 font-bold uppercase tracking-wide transition-colors',
      'disabled:pointer-events-none disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-500',
      size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-8 px-2.5 text-[11px]',
      buttonVariants[variant], className)} />
  )
}

const control = 'w-full min-w-0 border-2 border-zinc-700 bg-black px-2.5 text-sm text-white placeholder-zinc-600 transition-colors hover:border-zinc-600 focus:border-red-600 focus:outline-none disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} {...props} className={cx(control, props.type === 'file' ? 'h-8 py-0.5 file:mr-3 file:border-0 file:bg-zinc-800 file:h-full file:px-2 file:text-xs file:font-bold file:uppercase file:text-zinc-200' : 'h-8', className)} />
  })

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(control, 'h-8 cursor-pointer pr-7', className)} />
}

export function Checkbox({ label: text, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-300', props.disabled && 'cursor-not-allowed opacity-50', className)}>
      <input type="checkbox" {...props} className="h-4 w-4 accent-red-600" />
      {text}
    </label>
  )
}

/** Label + one control + optional hint. The label is linked to the control by id. */
export function Field({ label: text, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={id} className={cx(label, 'mb-1 block')}>{text}</label>
      {isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

// ─── Feedback ────────────────────────────────────────────────────────────────

const badgeTones = {
  neutral: 'border-zinc-700 text-zinc-300',
  active: 'border-red-600 bg-red-950/50 text-red-300',
  success: 'border-emerald-800 text-emerald-300',
  warning: 'border-amber-700 text-amber-300',
  error: 'border-red-700 bg-red-950 text-red-300',
}

export function StatusBadge({ tone = 'neutral', children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider', badgeTones[tone])}>
      {tone === 'active' && <span className="h-1.5 w-1.5 animate-pulse bg-red-500" />}
      {children}
    </span>
  )
}

export function ErrorBanner({ children, onRetry, className }: { children: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cx('flex items-start gap-3 border-2 border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-200', className)}>
      <span className="mt-px font-mono text-[11px] font-bold uppercase tracking-wider text-red-400">Error</span>
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onRetry && <Button size="sm" variant="danger" onClick={onRetry}>Retry</Button>}
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 px-4 py-10 text-center">
      {icon && <div className="mb-3 text-zinc-700 [&>svg]:h-10 [&>svg]:w-10">{icon}</div>}
      <p className="text-sm font-bold uppercase tracking-wide text-zinc-300">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-zinc-500">{children}</div>}
    </div>
  )
}

export function Spinner({ label: text, className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cx('flex items-center justify-center gap-3 py-10', className)}>
      <span className="h-5 w-5 animate-spin border-2 border-zinc-700 border-t-red-600" />
      {text && <span className={label}>{text}</span>}
    </div>
  )
}

// ─── Disclosure ──────────────────────────────────────────────────────────────

/** Native <details> panel for setup areas that are rarely needed. */
export function Collapsible({ title, summary, defaultOpen, children }: { title: ReactNode; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group border-2 border-zinc-800 bg-zinc-950">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
        {summary && <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-500">{summary}</span>}
        <svg className="ml-auto h-3 w-3 flex-shrink-0 text-zinc-500 transition-transform group-open:rotate-90" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M4 2l5 4-5 4z" /></svg>
      </summary>
      <div className="border-t-2 border-zinc-800 p-3">{children}</div>
    </details>
  )
}

/** Right-hand side panel. Escape or the backdrop closes it; focus returns to the opener. */
export function Drawer({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  // Read during the first render: an autoFocus field inside would otherwise take focus first.
  const [opener] = useState(() => document.activeElement as HTMLElement | null)
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.() }
  }, [opener])
  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={cx('relative flex h-full w-full flex-col border-l-2 border-zinc-800 bg-zinc-950 focus:outline-none', wide ? 'max-w-3xl' : 'max-w-md')}>
        <div className="flex items-center justify-between gap-2 border-b-2 border-zinc-800 px-3 py-2">
          <h2 id={titleId} className="text-xs font-bold uppercase tracking-wider">{title}</h2>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close panel">Esc ✕</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  )
}

// ─── Data display ────────────────────────────────────────────────────────────

const statTones = { default: 'text-white', good: 'text-emerald-400', warn: 'text-amber-400', bad: 'text-red-400' }

/** Small labelled number. */
export function Stat({ label: text, value, hint, tone = 'default' }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: keyof typeof statTones }) {
  return (
    <div className="min-w-0 border-2 border-zinc-900 bg-black px-3 py-2">
      <div className={cx(label, 'truncate')}>{text}</div>
      <div className={cx('mt-0.5 truncate text-lg font-bold tabular-nums', statTones[tone])}>{value}</div>
      {hint && <div className="truncate text-[11px] text-zinc-500">{hint}</div>}
    </div>
  )
}

/** Thin bar; pass `value`/`max`, or neither for an indeterminate pulse. */
export function ProgressBar({ value, max, label: text }: { value?: number; max?: number; label: string }) {
  const pct = max ? Math.min(100, Math.round(((value ?? 0) / max) * 100)) : null
  return (
    <div className="h-1.5 bg-zinc-800" role="progressbar" aria-label={text} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
      <div className={cx('h-full bg-red-600 transition-[width] duration-300', pct == null && 'w-1/3 animate-pulse')} style={pct == null ? undefined : { width: `${pct}%` }} />
    </div>
  )
}
