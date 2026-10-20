"use client";

import { useEffect, useState } from "react";
import {
  DATA_SOURCES_SUMMARY,
  DISCLAIMER_HEADLINE,
  SAFETY_DISCLAIMER_STORAGE_KEY,
} from "@/lib/disclaimer";

export function SafetyDisclaimerModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SAFETY_DISCLAIMER_STORAGE_KEY) !== "1") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function acknowledge() {
    try {
      localStorage.setItem(SAFETY_DISCLAIMER_STORAGE_KEY, "1");
    } catch {
      /* still close */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="safety-modal-backdrop" role="presentation">
      <div
        className="safety-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-disclaimer-title"
      >
        <p className="eyebrow">Important</p>
        <h2 id="safety-disclaimer-title">{DISCLAIMER_HEADLINE}</h2>
        <p className="safety-modal-lead">{DATA_SOURCES_SUMMARY}</p>
        <ul className="safety-modal-list">
          <li>Clearance and corridor data may be inaccurate, outdated, or incomplete.</li>
          <li>Always obey posted clearance signs and do your own research.</li>
          <li>Not a substitute for official agency records or truck navigation systems.</li>
          <li>New York parkways prohibit commercial vehicles regardless of heights shown here.</li>
        </ul>
        <button type="button" className="primary safety-modal-ack" onClick={acknowledge}>
          I understand
        </button>
      </div>
    </div>
  );
}
