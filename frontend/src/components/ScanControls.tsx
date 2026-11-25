import { useState, useEffect } from "react";
import { startScan } from "../lib/api";
import { ScanScheduleControls } from "./ScanScheduleControls";
import { Button, ErrorBanner, label } from "./ui";

interface ScanControlsProps {
	onScanStarted: () => void;
	isScanning: boolean;
}

export function ScanControls({
	onScanStarted,
	isScanning,
}: ScanControlsProps) {
	const [mode, setMode] = useState<"full" | "incremental">("incremental");
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

	const modes = [
		{ key: "incremental", title: "Incremental", hint: "New and changed files" },
		{ key: "full", title: "Full", hint: "All files, refresh metadata" },
	] as const;

	return (
		<div className='space-y-3'>
			<fieldset disabled={isScanning} className='grid grid-cols-2 gap-2'>
				<legend className={`${label} mb-1`}>Scan mode</legend>
				{modes.map((m) => (
					<label
						key={m.key}
						className={`cursor-pointer border-2 px-3 py-2 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-red-500 ${
							mode === m.key ? "border-red-600 bg-red-950/40" : "border-zinc-800 hover:border-zinc-600"
						} ${isScanning ? "cursor-not-allowed opacity-50" : ""}`}
					>
						<input type='radio' name='scan-mode' className='sr-only' checked={mode === m.key} onChange={() => setMode(m.key)} />
						<span className='block text-sm font-bold'>{m.title}</span>
						<span className='block text-xs text-zinc-500'>{m.hint}</span>
					</label>
				))}
			</fieldset>

			<Button variant='primary' onClick={handleStartScan} disabled={loading || isScanning}>
				{loading ? "Starting…" : isScanning ? "Scan in progress" : `Start ${mode} scan`}
			</Button>

			{error && <ErrorBanner>{error}</ErrorBanner>}
			{success && <p role='status' className='text-xs text-emerald-300'>{success}</p>}
			<ScanScheduleControls />
		</div>
	);
}
