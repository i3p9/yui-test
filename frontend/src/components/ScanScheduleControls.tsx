import { useEffect, useState } from "react";
import { getScanSchedule, updateScanSchedule } from "../lib/api";
import type { ScanScheduleStatus } from "../types";
import { Button, Checkbox, Field, Input, label } from "./ui";

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
		else timing = `Next scan ${new Date(status.nextRunAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}.`;
	}
	const displayedError = error || fetchError || status?.lastError;

	return (
		<form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-2 border-t-2 border-zinc-900 pt-3">
			<h3 className={label}>Automatic scans</h3>
			<div className="flex flex-wrap items-end gap-3">
				<Checkbox label="Enable" className="h-8" checked={enabled} disabled={!status || saving} onChange={(event) => { setEnabled(event.target.checked); setSaved(false); }} />
				<Field label="Every (hours)" className="w-28">
					<Input aria-label="Automatic scan interval in hours" type="number" min="1" max="8760" step="1" required value={hours} disabled={!status || saving} onChange={(event) => { setHours(event.target.value); setSaved(false); }} />
				</Field>
				<Button type="submit" disabled={!status || saving}>{saving ? "Saving…" : "Save schedule"}</Button>
			</div>
			<p className="text-xs text-zinc-500" aria-live="polite">{timing}</p>
			{saved && <p role="status" className="text-xs text-emerald-300">Schedule saved.</p>}
			{displayedError && <p role="alert" className="text-xs text-red-400">{displayedError}</p>}
		</form>
	);
}
