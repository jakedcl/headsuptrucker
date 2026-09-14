"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Place } from "@/lib/path";

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
      {!loading && !error && !items.length && value.trim().length >= 2 && <li className="place-suggestion muted" role="presentation">No matches in NYC, Long Island, or SW Connecticut.</li>}
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

export function DriveForm({ initialFrom = "", initialTo = "", loading, error, active, onSubmit, onClear }: {
  initialFrom?: string; initialTo?: string; loading: boolean; error: string; active: boolean;
  onSubmit: (from: Place | string, to: Place | string) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [fromText, setFromText] = useState(initialFrom);
  const [toText, setToText] = useState(initialTo);
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [toPlace, setToPlace] = useState<Place | null>(null);

  useEffect(() => {
    if (active || loading) setOpen(true);
  }, [active, loading]);

  return <div className="drive-form">
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
      {active && <button className="text-button" type="button" onClick={onClear}>Clear</button>}
    </div>
    {open && (
      <form id="drive-form-fields" onSubmit={event => {
        event.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        const from = fromPlace && fromPlace.label === fromText.trim() ? fromPlace : fromText.trim();
        const to = toPlace && toPlace.label === toText.trim() ? toPlace : toText.trim();
        onSubmit(from, to);
      }}>
        <PlaceField label="From" inputId="drive-from" placeholder="JFK Airport" value={fromText} onChange={value => { setFromText(value); setFromPlace(null); }} onPick={place => { setFromText(place.label); setFromPlace(place); }} />
        <PlaceField label="To" inputId="drive-to" placeholder="Jones Beach" value={toText} onChange={value => { setToText(value); setToPlace(null); }} onPick={place => { setToText(place.label); setToPlace(place); }} />
        {error && <p role="alert" className="form-error">{error}</p>}
        {loading && <p className="drive-status" role="status">Looking up those places and posted clearances nearby…</p>}
        <button className="primary" type="submit" disabled={loading}>{loading ? "Going…" : "Go"}</button>
      </form>
    )}
  </div>;
}
