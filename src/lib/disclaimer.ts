export const SAFETY_DISCLAIMER_STORAGE_KEY = "heads-up-safety-disclaimer-v2";

export const DISCLAIMER_HEADLINE = "Do not rely on this website.";

/** Shown in the first-visit modal — keep in sync with registry agencies. */
export const DATA_SOURCES_SUMMARY =
  "Heads Up aggregates publicly available government and open-data feeds — including NYSDOT, NYC DOT, CTDOT, NJDOT, Port Authority crossing references, and selected OpenStreetMap tags — into one reference map. Coverage is partial; we do not field-verify postings.";

export const MAP_REFERENCE_NOTICE =
  "Do not rely on this map alone. Verify posted clearances at signs. Missing markers do not guarantee clearance.";

export function mapPathDisclaimer(hasPath: boolean) {
  return hasPath
    ? "Do not rely on this map alone. Posted records near this path only — verify signs. Missing markers do not guarantee clearance."
    : MAP_REFERENCE_NOTICE;
}

export const CLEARANCE_VERIFY_LINE = "Verify posted clearance at the sign.";

export const FOOTER_DISCLAIMER =
  "Do not rely on this website. Aggregated public agency and open data — may be inaccurate or outdated. Obey posted signs and do your own research.";
