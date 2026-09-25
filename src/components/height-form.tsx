"use client";

import { useState } from "react";
import { isOversizedHeight, OVERSIZED_LOAD_MESSAGE, parseVehicleHeight } from "@/lib/clearance";

export function HeightForm({
  initialHeight = 108,
  onSubmit,
  compact = false,
  showCommercial = false,
  commercial = false,
  onCommercialChange,
}: {
  initialHeight?: number;
  onSubmit: (height: number) => void;
  compact?: boolean;
  showCommercial?: boolean;
  commercial?: boolean;
  onCommercialChange?: (value: boolean) => void;
}) {
  const [feet, setFeet] = useState(String(Math.floor(initialHeight / 12)));
  const [inches, setInches] = useState(String(initialHeight % 12));
  const [error, setError] = useState("");
  function applyDraft(nextFeet: string, nextInches: string) {
    setFeet(nextFeet);
    setInches(nextInches);
    if (isOversizedHeight(nextFeet, nextInches)) setError(OVERSIZED_LOAD_MESSAGE);
    else if (error === OVERSIZED_LOAD_MESSAGE) setError("");
  }
  return <form className={`height-form ${compact ? "compact" : ""}`} onSubmit={event => {
    event.preventDefault();
    const value = parseVehicleHeight(feet, inches);
    if (value === null) {
      setError(isOversizedHeight(feet, inches) ? OVERSIZED_LOAD_MESSAGE : "Enter 1–13 feet, with inches from 0 to 11. Max height is 13′6″.");
      return;
    }
    setError(""); onSubmit(value);
  }}>
    <div className="height-inputs">
      <label><span>Feet</span><input aria-label="Vehicle height in feet" aria-describedby={error ? "height-error" : undefined} inputMode="numeric" type="number" min="1" max="20" step="1" required value={feet} onChange={e => applyDraft(e.target.value, inches)} /></label>
      <span className="height-divider" aria-hidden="true">/</span>
      <label><span>Inches</span><input aria-label="Vehicle height in inches" inputMode="numeric" type="number" min="0" max="11" step="1" required value={inches} onChange={e => applyDraft(feet, e.target.value)} /></label>
    </div>
    {error && <p id="height-error" role="alert" className="form-error">{error}</p>}
    {showCommercial ? (
      <label className="all-toggle">
        <input
          type="checkbox"
          checked={commercial}
          onChange={e => onCommercialChange?.(e.target.checked)}
        />
        Commercial / truck plates
      </label>
    ) : null}
    <button className="primary" type="submit">{compact ? "Update height" : "Check clearances"}<span aria-hidden="true">↗</span></button>
  </form>;
}
