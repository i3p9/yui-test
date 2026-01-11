import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { SearchInput } from "./SearchInput";

interface LayoutProps {
	children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
	const location = useLocation();
	const isWatchPage = location.pathname.startsWith("/watch");
	console.log("isWatchPage:: ", isWatchPage);

	// Sidebar collapsed state - default to collapsed on watch page
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
		const saved = localStorage.getItem("sidebarCollapsed");
		if (saved !== null) return JSON.parse(saved);
		return isWatchPage; // Default: collapsed on watch page, expanded elsewhere
	});

	// Save state to localStorage
	useEffect(() => {
		localStorage.setItem(
			"sidebarCollapsed",
			JSON.stringify(isSidebarCollapsed)
		);
	}, [isSidebarCollapsed]);

	const isActive = (path: string) => {
		if (path === "/") return location.pathname === "/";
		return location.pathname.startsWith(path);
	};

	const toggleSidebar = () => {
		setIsSidebarCollapsed(!isSidebarCollapsed);
	};

	useEffect(() => {
		if (isWatchPage) {
			setIsSidebarCollapsed(true);
		} else {
			setIsSidebarCollapsed(false);
		}
	}, [isWatchPage]);

	return (
		<div className='min-h-screen bg-black text-white flex flex-col'>
			{/* Header */}
			<header className='bg-zinc-950 border-b-4 border-red-600 sticky top-0 z-50'>
				<div className='px-6 py-4 flex items-center justify-between'>
					<div className='flex items-center gap-4'>
						{/* Sidebar Toggle Button */}
						<button
							onClick={toggleSidebar}
							className='w-10 h-10 bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center hover:bg-zinc-800 hover:border-red-600 transition-colors'
							aria-label='Toggle sidebar'
						>
							<svg
								className='w-5 h-5'
								fill='none'
								stroke='currentColor'
								viewBox='0 0 24 24'
							>
								<path
									strokeLinecap='square'
									strokeLinejoin='miter'
									strokeWidth={2}
									d='M4 6h16M4 12h16M4 18h16'
								/>
							</svg>
						</button>

						<Link to='/' className='flex items-center gap-3 group'>
							<div className='w-10 h-10 bg-red-600 flex items-center justify-center font-black text-2xl transform group-hover:scale-110 transition-transform'>
								Y
							</div>
							<span className='text-2xl font-black tracking-tight'>
								YUI
							</span>
						</Link>
					</div>

					<SearchInput />

					<Link
						to='/configure'
						className='w-10 h-10 bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center hover:bg-zinc-800 hover:border-zinc-700 transition-colors'
					>
						<svg
							className='w-5 h-5'
							fill='none'
							stroke='currentColor'
							viewBox='0 0 24 24'
						>
							<path
								strokeLinecap='square'
								strokeLinejoin='miter'
								strokeWidth={2}
								d='M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
							/>
							<path
								strokeLinecap='square'
								strokeLinejoin='miter'
								strokeWidth={2}
								d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
							/>
						</svg>
					</Link>
				</div>
			</header>

			<div className='flex flex-1'>
				{/* Sidebar */}
				<aside
					className={`bg-zinc-950 border-r-4 border-zinc-900 flex-shrink-0 transition-all duration-300 ${
						isSidebarCollapsed
							? "w-0 border-r-0 overflow-hidden"
							: "w-64"
					}`}
				>
					<nav className='p-4 space-y-1 w-64'>
						<Link
							to='/'
							className={`block px-4 py-3 font-bold text-sm tracking-wide transition-all ${
								isActive("/")
									? "bg-red-600 text-white"
									: "text-zinc-400 hover:bg-zinc-900 hover:text-white"
							}`}
						>
							<div className='flex items-center gap-3'>
								<svg
									className='w-5 h-5 flex-shrink-0'
									fill='currentColor'
									viewBox='0 0 24 24'
								>
									<path d='M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' />
								</svg>
								<span>HOME</span>
							</div>
						</Link>

						<Link
							to='/channels'
							className={`block px-4 py-3 font-bold text-sm tracking-wide transition-all ${
								isActive("/channels")
									? "bg-red-600 text-white"
									: "text-zinc-400 hover:bg-zinc-900 hover:text-white"
							}`}
						>
							<div className='flex items-center gap-3'>
								<svg
									className='w-5 h-5 flex-shrink-0'
									fill='currentColor'
									viewBox='0 0 24 24'
								>
									<path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z' />
								</svg>
								<span>CHANNELS</span>
							</div>
						</Link>

						<Link
							to='/liked'
							className={`block px-4 py-3 font-bold text-sm tracking-wide transition-all ${
								isActive("/liked")
									? "bg-red-600 text-white"
									: "text-zinc-400 hover:bg-zinc-900 hover:text-white"
							}`}
						>
							<div className='flex items-center gap-3'>
								<svg
									className='w-5 h-5 flex-shrink-0'
									fill='currentColor'
									viewBox='0 0 24 24'
								>
									<path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
								</svg>
								<span>LIKED</span>
							</div>
						</Link>

						<div className='pt-4 mt-4 border-t-2 border-zinc-900'>
							<Link
								to='/configure'
								className={`block px-4 py-3 font-bold text-sm tracking-wide transition-all ${
									isActive("/configure")
										? "bg-red-600 text-white"
										: "text-zinc-400 hover:bg-zinc-900 hover:text-white"
								}`}
							>
								<div className='flex items-center gap-3'>
									<svg
										className='w-5 h-5 flex-shrink-0'
										fill='currentColor'
										viewBox='0 0 24 24'
									>
										<path d='M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z' />
									</svg>
									<span>CONFIGURE</span>
								</div>
							</Link>
						</div>
					</nav>
				</aside>

				{/* Main content */}
				<main className='flex-1 overflow-auto'>{children}</main>
			</div>
		</div>
	);
}
