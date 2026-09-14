"use client";
import { useState } from "react";

export function DriveForm({ initialFrom = "", initialTo = "", loading, error, active, onSubmit, onClear }: {
  initialFrom?: string; initialTo?: string; loading: boolean; error: string; active: boolean;
  onSubmit: (from: string, to: string) => void; onClear: () => void;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  return <form className="drive-form" onSubmit={event => { event.preventDefault(); onSubmit(from.trim(), to.trim()); }}>
    <div className="panel-heading"><span className="eyebrow">CHECK A DRIVE</span>{active && <button className="text-button" type="button" onClick={onClear}>Clear</button>}</div>
    <label><span>From</span><input name="from" autoComplete="off" spellCheck={false} placeholder="JFK Airport" value={from} onChange={e => setFrom(e.target.value)} aria-label="Starting place" /></label>
    <label><span>To</span><input name="to" autoComplete="off" spellCheck={false} placeholder="Jones Beach" value={to} onChange={e => setTo(e.target.value)} aria-label="Destination" /></label>
    {error && <p role="alert" className="form-error">{error}</p>}
    {loading && <p className="drive-status" role="status">Looking up those places and posted clearances nearby…</p>}
    <button className="primary" type="submit" disabled={loading}>{loading ? "Checking this path" : "Show lows on this path"}<span aria-hidden="true">↗</span></button>
    <p className="drive-status">Posted records near a driving path. Not turn-by-turn, and not a guarantee the road is clear.</p>
  </form>;
}
