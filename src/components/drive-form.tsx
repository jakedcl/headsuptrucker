"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Place } from "@/lib/path";
import { EXAMPLE_DRIVE } from "@/lib/path";

type Suggestion = Place;

function PlaceField({ label, value, onChange, onPick, placeholder, inputId }: {
  label: string; value: string; placeholder: string; inputId: string;
  onChange: (value: string) => void; onPick: (place: Place) => void;
}) {
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState("");

  function closeSuggestions() {
    setOpen(false);
    setActive(-1);
  }

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setItems([]);
      setLoading(false);
      setError("");
      closeSuggestions();
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(async response => {
        const json = await response.json() as { places?: Suggestion[]; error?: string };
        if (!response.ok) throw new Error(json.error || "Suggestions unavailable.");
        setItems(Array.isArray(json.places) ? json.places : []);
        setActive(-1);
        // Late fetches were reopening the list after Go / other clicks.
        if (focused.current) setOpen(true);
      }).catch(err => {
        if (err.name === "AbortError") return;
        setItems([]);
        setError(err.message);
        if (focused.current) setOpen(true);
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) {
        focused.current = false;
        closeSuggestions();
      }
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  function choose(place: Place) {
    onPick(place);
    setItems([]);
    focused.current = false;
    closeSuggestions();
  }

  return <div className="place-field" ref={wrap}>
    <label htmlFor={inputId}><span>{label}</span>
      <input
        id={inputId}
        name={label.toLowerCase()}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        role="combobox"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={e => onChange(e.target.value)}
        onFocus={() => {
          focused.current = true;
          if (items.length || error || loading || value.trim().length >= 2) setOpen(true);
        }}
        onBlur={() => {
          focused.current = false;
          window.setTimeout(() => {
            if (focused.current) return;
            if (wrap.current?.contains(document.activeElement)) return;
            closeSuggestions();
          }, 0);
        }}
        onKeyDown={e => {
          if (e.key === "Escape") { closeSuggestions(); return; }
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp") && items.length) { setOpen(true); return; }
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(i => Math.min((i < 0 ? -1 : i) + 1, items.length - 1)); return; }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); return; }
          if (e.key === "Enter" && open && active >= 0 && items[active]) { e.preventDefault(); choose(items[active]); }
        }}
      />
    </label>
    {open && <ul id={listId} className="place-suggestions" role="listbox" aria-label={`${label} suggestions`}>
      {loading && <li className="place-suggestion muted" role="presentation">Searching places…</li>}
      {!loading && error && <li className="place-suggestion muted" role="presentation">{error}</li>}
      {!loading && !error && !items.length && value.trim().length >= 2 && <li className="place-suggestion muted" role="presentation">No matches in NYC, Long Island, SW Connecticut, or NE New Jersey.</li>}
      {items.map((place, index) => (
        <li
          key={`${place.label}-${place.lng}-${place.lat}`}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={active === index}
          className={`place-suggestion ${active === index ? "active" : ""}`}
          onMouseEnter={() => setActive(index)}
          onMouseDown={e => e.preventDefault()}
          onClick={() => choose(place)}
        >{place.label}</li>
      ))}
    </ul>}
  </div>;
}

export function DriveForm({ initialFrom = "", initialTo = "", loading, error, active, onSubmit, onClear, onOpenChange, editRequest = 0 }: {
  initialFrom?: string; initialTo?: string; loading: boolean; error: string; active: boolean;
  onSubmit: (from: Place | string, to: Place | string) => void; onClear: () => void;
  onOpenChange?: (open: boolean) => void;
  /** Bump to force-open the A→B fields (e.g. “Change route”). */
  editRequest?: number;
}) {
  const [open, setOpen] = useState(false);
  const [fromText, setFromText] = useState(initialFrom || EXAMPLE_DRIVE.from);
  const [toText, setToText] = useState(initialTo || EXAMPLE_DRIVE.to);
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [toPlace, setToPlace] = useState<Place | null>(null);
  const wasLoading = useRef(loading);

  useEffect(() => {
    // Collapse A→B only when a lookup finishes — not when “Change route” reopens the fields.
    if (wasLoading.current && !loading && active) setOpen(false);
    wasLoading.current = loading;
  }, [active, loading]);

  useEffect(() => {
    if (editRequest > 0) setOpen(true);
  }, [editRequest]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  return <div className={`drive-form ${open ? "is-open" : ""}`}>
    <div className="panel-heading">
      <button
        type="button"
        className="drive-toggle"
        aria-expanded={open}
        aria-controls="drive-form-fields"
        onClick={() => setOpen(value => !value)}
      >
        <span className="eyebrow">CHECK A ROUTE</span>
        <span className="drive-chevron" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {active && open && <button className="text-button" type="button" onClick={onClear}>Clear path</button>}
    </div>
    {open && (
      <form id="drive-form-fields" onSubmit={event => {
        event.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        const fromValue = fromText.trim() || EXAMPLE_DRIVE.from;
        const toValue = toText.trim() || EXAMPLE_DRIVE.to;
        if (!fromText.trim()) setFromText(EXAMPLE_DRIVE.from);
        if (!toText.trim()) setToText(EXAMPLE_DRIVE.to);
        const from = fromPlace && fromPlace.label === fromText.trim() ? fromPlace : fromValue;
        const to = toPlace && toPlace.label === toText.trim() ? toPlace : toValue;
        setOpen(false);
        onSubmit(from, to);
      }}>
        <PlaceField label="From" inputId="drive-from" placeholder={EXAMPLE_DRIVE.from} value={fromText} onChange={value => { setFromText(value); setFromPlace(null); }} onPick={place => { setFromText(place.label); setFromPlace(place); }} />
        <PlaceField label="To" inputId="drive-to" placeholder={EXAMPLE_DRIVE.to} value={toText} onChange={value => { setToText(value); setToPlace(null); }} onPick={place => { setToText(place.label); setToPlace(place); }} />
        {error && <p role="alert" className="form-error">{error}</p>}
        <button className="primary" type="submit" disabled={loading}>{loading ? "Going…" : "Go"}</button>
      </form>
    )}
  </div>;
}
