import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { SearchInput } from "./SearchInput";

interface LayoutProps {
	children: React.ReactNode;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
// Inline SVGs kept small; shared between sidebar and bottom nav.

function HomeIcon({ className }: { className?: string }) {
	return (
		<svg className={className} fill="currentColor" viewBox="0 0 24 24">
			<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
		</svg>
	);
}

function ChannelsIcon({ className }: { className?: string }) {
	return (
		<svg className={className} fill="currentColor" viewBox="0 0 24 24">
			<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
		</svg>
	);
}

function LikedIcon({ className }: { className?: string }) {
	return (
		<svg className={className} fill="currentColor" viewBox="0 0 24 24">
			<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
		</svg>
	);
}

function ConfigIcon({ className }: { className?: string }) {
	return (
		<svg className={className} fill="currentColor" viewBox="0 0 24 24">
			<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
		</svg>
	);
}

function HamburgerIcon({ className }: { className?: string }) {
	return (
		<svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
		</svg>
	);
}

function GearIcon({ className }: { className?: string }) {
	return (
		<svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
			<path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
		</svg>
	);
}

// ─── Mobile bottom nav items ───────────────────────────────────────────────────

const NAV_ITEMS = [
	{ to: "/",          label: "HOME",      Icon: HomeIcon,     exact: true  },
	{ to: "/channels",  label: "CHANNELS",  Icon: ChannelsIcon, exact: false },
	{ to: "/liked",     label: "LIKED",     Icon: LikedIcon,    exact: false },
	{ to: "/configure", label: "CONFIG",    Icon: ConfigIcon,   exact: false },
] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

export function Layout({ children }: LayoutProps) {
	const location = useLocation();
	const isWatchPage = location.pathname.startsWith("/watch");

	// Sidebar collapsed state (desktop only)
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
		const saved = localStorage.getItem("sidebarCollapsed");
		if (saved !== null) return JSON.parse(saved);
		return isWatchPage;
	});

	useEffect(() => {
		localStorage.setItem("sidebarCollapsed", JSON.stringify(isSidebarCollapsed));
	}, [isSidebarCollapsed]);

	// Auto-collapse sidebar on watch page (desktop)
	useEffect(() => {
		setIsSidebarCollapsed(isWatchPage);
	}, [isWatchPage]);

	const isActive = (to: string, exact: boolean) =>
		exact ? location.pathname === to : location.pathname.startsWith(to);

	return (
		<div className="min-h-screen bg-black text-white flex flex-col">

			{/* ── Header ─────────────────────────────────────────────────────── */}
			<header className="bg-zinc-950 border-b-4 border-red-600 sticky top-0 z-50">
				<div className="px-4 md:px-6 py-3 md:py-4 flex items-center gap-3">

					{/* Hamburger — desktop only */}
					<button
						onClick={() => setIsSidebarCollapsed((c: boolean) => !c)}
						className="hidden md:flex w-10 h-10 bg-zinc-900 border-2 border-zinc-800 items-center justify-center hover:bg-zinc-800 hover:border-red-600 transition-colors flex-shrink-0"
						aria-label="Toggle sidebar"
					>
						<HamburgerIcon className="w-5 h-5" />
					</button>

					{/* Logo */}
					<Link to="/" className="flex items-center gap-2 group flex-shrink-0">
						<div className="w-8 h-8 md:w-10 md:h-10 bg-red-600 flex items-center justify-center font-black text-xl md:text-2xl group-hover:scale-110 transition-transform">
							Y
						</div>
						<span className="text-xl md:text-2xl font-black tracking-tight">YUI</span>
					</Link>

					{/* Search — full width on both, just more margin on desktop */}
					<SearchInput />

					{/* Config gear — desktop only (mobile uses bottom nav) */}
					<Link
						to="/configure"
						className="hidden md:flex w-10 h-10 bg-zinc-900 border-2 border-zinc-800 items-center justify-center hover:bg-zinc-800 hover:border-zinc-700 transition-colors flex-shrink-0"
						aria-label="Configure"
					>
						<GearIcon className="w-5 h-5" />
					</Link>
				</div>
			</header>

			{/* ── Body ───────────────────────────────────────────────────────── */}
			<div className="flex flex-1 min-h-0">

				{/* Sidebar — desktop only */}
				<aside
					className={`hidden md:block bg-zinc-950 border-r-4 border-zinc-900 flex-shrink-0 transition-all duration-300 ${
						isSidebarCollapsed ? "w-0 border-r-0 overflow-hidden" : "w-64"
					}`}
				>
					<nav className="p-4 space-y-1 w-64">
						{NAV_ITEMS.map(({ to, label, Icon, exact }) => (
							<Link
								key={to}
								to={to}
								className={`block px-4 py-3 font-bold text-sm tracking-wide transition-all ${
									isActive(to, exact)
										? "bg-red-600 text-white"
										: "text-zinc-400 hover:bg-zinc-900 hover:text-white"
								}`}
							>
								<div className="flex items-center gap-3">
									<Icon className="w-5 h-5 flex-shrink-0" />
									<span>{label}</span>
								</div>
							</Link>
						))}
					</nav>
				</aside>

				{/* Main content — extra bottom padding on mobile for the bottom nav */}
				<main className={`flex-1 overflow-auto ${isWatchPage ? "" : "pb-20 md:pb-0"}`}>
					{children}
				</main>
			</div>

			{/* ── Mobile bottom nav ──────────────────────────────────────────── */}
			{/* Hidden on desktop and on the watch page (immersive video UX) */}
			{!isWatchPage && (
				<nav
					className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t-4 border-zinc-900"
					style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
				>
					<div className="flex">
						{NAV_ITEMS.map(({ to, label, Icon, exact }) => {
							const active = isActive(to, exact);
							return (
								<Link
									key={to}
									to={to}
									className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 border-t-2 transition-colors ${
										active
											? "text-red-500 border-red-600"
											: "text-zinc-500 border-transparent hover:text-zinc-300"
									}`}
								>
									<Icon className="w-6 h-6" />
									<span className="text-[10px] font-black tracking-widest">
										{label}
									</span>
								</Link>
							);
						})}
					</div>
				</nav>
			)}
		</div>
	);
}
