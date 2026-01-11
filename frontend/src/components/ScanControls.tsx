import { useState, useEffect } from "react";
import { startScan } from "../lib/api";

interface ScanControlsProps {
	onScanStarted: () => void;
	isScanning: boolean;
}

export function ScanControls({
	onScanStarted,
	isScanning,
}: ScanControlsProps) {
	const [mode, setMode] = useState<"full" | "incremental">("full");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	// Clear success message when scan stops
	useEffect(() => {
		if (!isScanning && success) {
			const timer = setTimeout(() => setSuccess(null), 2000);
			return () => clearTimeout(timer);
		}
	}, [isScanning, success]);

	const handleStartScan = async () => {
		setLoading(true);
		setError(null);
		setSuccess(null);

		try {
			const result = await startScan({ mode });
			setSuccess(result.message);
			onScanStarted();
		} catch (err: any) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className='border-4 border-zinc-900 bg-zinc-950 p-5 shadow-[8px_8px_0_0_#09090b]'>
			<div className='mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
				<div>
					<p className='text-xs font-mono uppercase tracking-[0.25em] text-zinc-500'>
						CONTROL PANEL
					</p>
					<h2 className='mt-1 text-base font-black tracking-widest text-white'>
						SCAN CONTROLS
					</h2>
				</div>
				<div
					className={`inline-flex items-center gap-2 border-2 px-3 py-2 text-xs font-black uppercase tracking-[0.2em] ${
						isScanning
							? "border-red-600 bg-red-950 text-red-400"
							: "border-zinc-700 bg-zinc-900 text-zinc-300"
					}`}
				>
					<span className='inline-block h-2 w-2 bg-current' />
					{isScanning ? "Live" : "Standby"}
				</div>
			</div>

			<div className='space-y-4'>
				<div>
					<label className='mb-2 block text-xs font-mono uppercase tracking-[0.25em] text-zinc-500'>
						Scan Mode
					</label>
					<div className='flex flex-col gap-2 md:flex-row'>
						<button
							onClick={() => setMode("full")}
							disabled={isScanning}
							className={`flex-1 border-2 px-3 py-3 text-left transition-colors cursor-pointer ${
								mode === "full"
									? "border-red-600 bg-red-950 text-red-200"
									: "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-white"
							} ${isScanning ? "cursor-not-allowed opacity-60" : ""}`}
						>
							<div className='text-sm font-black uppercase tracking-wide'>
								Full Scan
							</div>
							<div className='mt-1 text-xs font-mono uppercase text-zinc-500'>
								Scan all videos and refresh metadata
							</div>
						</button>
						<button
							onClick={() => setMode("incremental")}
							disabled={isScanning}
							className={`flex-1 border-2 px-3 py-3 text-left transition-colors cursor-pointer ${
								mode === "incremental"
									? "border-red-600 bg-red-950 text-red-200"
									: "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-white"
							} ${isScanning ? "cursor-not-allowed opacity-60" : ""}`}
						>
							<div className='text-sm font-black uppercase tracking-wide'>
								Incremental
							</div>
							<div className='mt-1 text-xs font-mono uppercase text-zinc-500'>
								Only process changed files
							</div>
						</button>
					</div>
				</div>

				<button
					onClick={handleStartScan}
					disabled={loading || isScanning}
					className={`w-full border-4 px-4 py-3 font-black uppercase tracking-[0.25em] transition-colors ${
						loading || isScanning
							? "cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-500"
							: "border-green-600 bg-green-950 text-green-300 hover:border-green-500 hover:text-green-200"
					}`}
				>
					{loading
						? "Starting..."
						: isScanning
						? "Scan In Progress"
						: "Initiate Scan"}
				</button>

				{error && (
					<div className='border-2 border-red-600 bg-red-950 p-4'>
						<p className='text-xs font-mono uppercase tracking-widest text-red-300'>
							{error}
						</p>
					</div>
				)}
				{success && (
					<div className='border-2 border-green-600 bg-green-950 p-4'>
						<p className='text-xs font-mono uppercase tracking-widest text-green-300'>
							{success}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
