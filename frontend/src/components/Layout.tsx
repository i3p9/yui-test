import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { SearchInput } from "./SearchInput";
import { getHealth } from "../lib/api";

interface LayoutProps {
	children: React.ReactNode;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
// 24px outline icons in one style; the active nav item gets the filled variant.

type IconProps = { className?: string; filled?: boolean }
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

function HomeIcon({ className, filled }: IconProps) {
	return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...stroke} fill={filled ? 'currentColor' : 'none'}>
		<path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z" />
	</svg>;
}
function ChannelsIcon({ className, filled }: IconProps) {
	return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
		<rect x="3" y="6" width="18" height="14" fill={filled ? 'currentColor' : 'none'} /><path d="M7 3h10" />
		<path d="m10 10 5 3-5 3z" fill={filled ? 'black' : 'currentColor'} stroke={filled ? 'black' : 'currentColor'} />
	</svg>;
}
function LikedIcon({ className, filled }: IconProps) {
	return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...stroke} fill={filled ? 'currentColor' : 'none'}>
		<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
	</svg>;
}
function DownloadsIcon({ className, filled }: IconProps) {
	return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={filled ? 2.6 : 1.8}>
		<path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />
	</svg>;
}
function ConfigIcon({ className, filled }: IconProps) {
	return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={filled ? 2.6 : 1.8}>
		<path d="M4 7h9m4 0h3M4 17h3m4 0h9" /><circle cx="15" cy="7" r="2" fill={filled ? 'currentColor' : 'none'} /><circle cx="9" cy="17" r="2" fill={filled ? 'currentColor' : 'none'} />
	</svg>;
}
function HamburgerIcon({ className }: { className?: string }) {
	return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
	{ to: "/",          label: "Home",      Icon: HomeIcon,      exact: true  },
	{ to: "/channels",  label: "Channels",  Icon: ChannelsIcon,  exact: false },
	{ to: "/liked",     label: "Liked",     Icon: LikedIcon,     exact: false },
	{ to: "/downloads", label: "Downloads", Icon: DownloadsIcon, exact: false },
	{ to: "/configure", label: "Config",    Icon: ConfigIcon,    exact: false },
] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

export function Layout({ children }: LayoutProps) {
	const location = useLocation();
	const isWatchPage = location.pathname.startsWith("/watch");

	// Desktop rail: shown by default, hidden on the watch page; the hamburger toggles it.
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(isWatchPage);

	// Hide the Downloads tab when the server runs with DOWNLOADS_ENABLED=false.
	const [downloadsEnabled, setDownloadsEnabled] = useState(true);
	useEffect(() => {
		getHealth().then((h) => setDownloadsEnabled(h.downloadsEnabled !== false)).catch(() => {});
	}, []);
	const navItems = NAV_ITEMS.filter((item) => item.to !== "/downloads" || downloadsEnabled);

	useEffect(() => {
		setIsSidebarCollapsed(isWatchPage);
	}, [isWatchPage]);

	const isActive = (to: string, exact: boolean) =>
		exact ? location.pathname === to : location.pathname.startsWith(to);

	return (
		<div className="min-h-screen bg-black text-white flex flex-col">

			{/* ── Header ─────────────────────────────────────────────────────── */}
			<header className="sticky top-0 z-50 border-b-2 border-red-600 bg-zinc-950">
				<div className="flex h-14 items-center gap-2 px-3 md:gap-4 md:px-4">
					<button
						onClick={() => setIsSidebarCollapsed((c: boolean) => !c)}
						className="hidden h-10 w-10 flex-shrink-0 items-center justify-center text-zinc-300 hover:bg-zinc-900 hover:text-white md:flex"
						aria-label={isSidebarCollapsed ? "Show navigation" : "Hide navigation"}
						aria-expanded={!isSidebarCollapsed}
					>
						<HamburgerIcon className="h-6 w-6" />
					</button>

					<Link to="/" className="group flex flex-shrink-0 items-center gap-1.5" aria-label="YUI home">
						<span className="flex h-7 w-7 items-center justify-center bg-red-600 text-lg font-black transition-transform group-hover:-rotate-6">Y</span>
						<span className="hidden text-lg font-black tracking-tight sm:inline">YUI</span>
					</Link>

					<div className="flex min-w-0 flex-1 justify-center">
						<SearchInput />
					</div>
					{/* Balances the hamburger + logo so the search box stays centred */}
					<div className="hidden w-[5.5rem] flex-shrink-0 lg:block" />
				</div>
			</header>

			{/* ── Body ───────────────────────────────────────────────────────── */}
			<div className="flex flex-1 min-h-0">

				{/* Rail — desktop only, YouTube-style icon over label */}
				{!isSidebarCollapsed && (
					<nav aria-label="Main" className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[4.5rem] flex-shrink-0 flex-col gap-1 bg-black px-1 py-2 md:flex">
						{navItems.map(({ to, label, Icon, exact }) => {
							const active = isActive(to, exact);
							return (
								<Link
									key={to}
									to={to}
									aria-current={active ? "page" : undefined}
									className={`relative flex flex-col items-center gap-1 py-3.5 text-[10px] font-medium transition-colors ${
										active ? "bg-zinc-900 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
									}`}
								>
									{active && <span className="absolute inset-y-2 left-0 w-0.5 bg-red-600" />}
									<Icon className={`h-6 w-6 ${active ? "text-red-500" : ""}`} filled={active} />
									<span>{label}</span>
								</Link>
							);
						})}
					</nav>
				)}

				{/* Main content — extra bottom padding on mobile for the bottom nav */}
				<main className={`flex-1 min-w-0 overflow-auto ${isWatchPage ? "" : "pb-20 md:pb-0"}`}>
					{children}
				</main>
			</div>

			{/* ── Mobile bottom nav (hidden on the watch page) ───────────────── */}
			{!isWatchPage && (
				<nav
					aria-label="Main"
					className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t-2 border-zinc-900 bg-zinc-950"
					style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
				>
					<div className="flex">
						{navItems.map(({ to, label, Icon, exact }) => {
							const active = isActive(to, exact);
							return (
								<Link
									key={to}
									to={to}
									aria-current={active ? "page" : undefined}
									className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
										active ? "text-white" : "text-zinc-500 hover:text-zinc-300"
									}`}
								>
									<Icon className={`h-6 w-6 ${active ? "text-red-500" : ""}`} filled={active} />
									<span>{label}</span>
								</Link>
							);
						})}
					</div>
				</nav>
			)}
		</div>
	);
}
