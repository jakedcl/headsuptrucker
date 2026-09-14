"use client";

import { useState } from "react";
import { parseVehicleHeight } from "@/lib/clearance";

export function HeightForm({ initialHeight = 108, onSubmit, compact = false }: { initialHeight?: number; onSubmit: (height: number) => void; compact?: boolean }) {
  const [feet, setFeet] = useState(String(Math.floor(initialHeight / 12)));
  const [inches, setInches] = useState(String(initialHeight % 12));
  const [error, setError] = useState("");
  return <form className={`height-form ${compact ? "compact" : ""}`} onSubmit={event => {
    event.preventDefault();
    const value = parseVehicleHeight(feet, inches);
    if (value === null) { setError("Enter 1–20 feet, with inches from 0 to 11."); return; }
    setError(""); onSubmit(value);
  }}>
    <div className="height-inputs">
      <label><span>Feet</span><input aria-label="Vehicle height in feet" aria-describedby={error ? "height-error" : undefined} inputMode="numeric" type="number" min="1" max="20" step="1" required value={feet} onChange={e => setFeet(e.target.value)} /></label>
      <span className="height-divider" aria-hidden="true">/</span>
      <label><span>Inches</span><input aria-label="Vehicle height in inches" inputMode="numeric" type="number" min="0" max="11" step="1" required value={inches} onChange={e => setInches(e.target.value)} /></label>
    </div>
    {error && <p id="height-error" role="alert" className="form-error">{error}</p>}
    <button className="primary" type="submit">{compact ? "Update height" : "Show clearances"}<span aria-hidden="true">↗</span></button>
  </form>;
}
