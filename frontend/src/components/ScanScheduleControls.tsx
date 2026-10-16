import { useEffect, useState } from "react";
import { getScanSchedule, updateScanSchedule } from "../lib/api";
import type { ScanScheduleStatus } from "../types";

export function ScanScheduleControls() {
	const [status, setStatus] = useState<ScanScheduleStatus | null>(null);
	const [enabled, setEnabled] = useState(false);
	const [hours, setHours] = useState("48");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [fetchError, setFetchError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		let active = true;
		let initialized = false;
		const refresh = async () => {
			try {
				const value = await getScanSchedule();
				if (!active) return;
				setStatus(value);
				setFetchError(null);
				if (!initialized) {
					setEnabled(value.enabled);
					setHours(String(value.intervalHours));
					initialized = true;
				}
			} catch (err) {
				if (active) setFetchError(err instanceof Error ? err.message : String(err));
			}
		};
		void refresh();
		const timer = setInterval(() => { void refresh(); }, 30_000);
		return () => { active = false; clearInterval(timer); };
	}, []);

	const save = async () => {
		const intervalHours = Number(hours);
		if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 8760) {
			setError("Choose a whole number from 1 to 8760 hours.");
			return;
		}
		setSaving(true);
		setError(null);
		setSaved(false);
		try {
			setStatus(await updateScanSchedule({ enabled, intervalHours }));
			setSaved(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	};

	let timing = "Loading schedule...";
	if (status) {
		if (!status.enabled) timing = "Automatic scans are off.";
		else if (status.waitingForLibraries) timing = "Waiting for an active library.";
		else if (!status.nextRunAt) timing = "Scheduling...";
		else if (Date.parse(status.nextRunAt) <= Date.now()) timing = "Scan due — waiting for the next check or an active job to finish.";
		else timing = `Next scan: ${new Date(status.nextRunAt).toLocaleString()}`;
	}
	const displayedError = error || fetchError || status?.lastError;

	return (
		<form onSubmit={(event) => { event.preventDefault(); void save(); }} className="mt-5 border-t-2 border-zinc-800 pt-4">
			<h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-300">Automatic scans</h3>
			<p className="mt-2 text-xs text-zinc-500">Run incremental scans across active libraries. Waits for other background jobs to finish.</p>
			<div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-mono text-zinc-300">
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={enabled} disabled={!status || saving} onChange={(event) => { setEnabled(event.target.checked); setSaved(false); }} className="h-4 w-4 accent-green-500" />
					Enable
				</label>
				<label className="flex items-center gap-2">
					Every
					<input aria-label="Automatic scan interval in hours" type="number" min="1" max="8760" step="1" required value={hours} disabled={!status || saving} onChange={(event) => { setHours(event.target.value); setSaved(false); }} className="w-20 border-2 border-zinc-800 bg-zinc-900 px-2 py-2 text-white outline-none focus:border-green-500" />
					hours
				</label>
				<button type="submit" disabled={!status || saving} className="border-2 border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-black uppercase tracking-wider text-zinc-300 hover:border-green-600 disabled:opacity-50">{saving ? "Saving..." : "Save schedule"}</button>
			</div>
			<p className="mt-3 text-xs font-mono text-zinc-500" aria-live="polite">
				{timing}
			</p>
			{saved && <p role="status" className="mt-2 text-xs text-green-400">Schedule saved.</p>}
			{displayedError && <p role="alert" className="mt-2 text-xs text-red-400">{displayedError}</p>}
		</form>
	);
}
