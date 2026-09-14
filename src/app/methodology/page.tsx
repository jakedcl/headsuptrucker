import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import metadata from "../../../public/data/metadata.json";

export default function Methodology() {
  return <>
    <SiteHeader />
    <main className="methodology">
      <Link className="back-link" href="/">← Back to height entry</Link>
      <p className="eyebrow">THE NUMBERS BEHIND THE MAP</p>
      <h1>Posted values.<br />Visible sources.</h1>
      <p className="methodology-intro">
        Heads Up compares official posted-clearance records with the height you enter.
        It’s a reference map with partial coverage, not a route planner.
      </p>

      <section>
        <h2>In plain English</h2>
        <p className="methodology-plain">
          Enter your full vehicle height. Red means a posted clearance is at or below that height.
          Orange means it’s within the next 12 inches. Higher postings stay hidden unless you turn them on.
        </p>
        <p className="methodology-plain">
          Always trust the signs on the road. A missing marker does <strong>not</strong> mean the road is clear.
          No color on this map guarantees your vehicle will fit.
        </p>
      </section>
      <section>
        <h2>How warnings work</h2>
        <p className="methodology-plain">We compare each posted number with the height you typed.</p>
        <ul className="methodology-list">
          <li><strong>Red</strong> — posting is equal to or lower than your vehicle.</li>
          <li><strong>Orange</strong> — posting is 1–12 inches above your height.</li>
          <li><strong>Gray</strong> — higher postings, only when you choose to show them.</li>
        </ul>
        <p>Use your full measured vehicle height, including roof equipment. Check the map before driving and follow the signs at the road. No category guarantees that a vehicle will fit.</p>
      </section>
      <section>
        <h2>What’s in this version</h2>
        <p className="methodology-plain">
          Official posted clearances for NYC, Long Island, and southwest Connecticut.
          Here’s exactly what’s loaded and how we read it.
        </p>
        <p>
          <strong>{metadata.postedRecords} posted-clearance records</strong> across {metadata.uniqueStructures} structures
          in NYC, Nassau, Suffolk, and Fairfield County (CT). A structure may have separate postings for the road on it
          and the road under it.
        </p>
        <p>
          New York warnings use{" "}
          <a href="https://gis.dot.ny.gov/hostingny/rest/services/CommVehicleDataFeed/MapServer/1" target="_blank" rel="noreferrer">
            NYSDOT’s Posted Height Bridges layer
          </a>
          . We read its explicit posted fields, recover whole inches from decimal feet, reject unsupported values, and
          retain the agency’s road names and record links. Some source names are inventory codes. When that happens,
          the list leads with a readable crossing or location from the same record; the original name stays in the record details.
        </p>
        <p>
          Source downloaded: {metadata.retrievedAt.slice(0, 10)}. Layer update:{" "}
          {metadata.sourceUpdatedAt?.slice(0, 10) || "not supplied"}. A layer refresh is not the date each sign was inspected.
        </p>
      </section>
      <section>
        <h2>Connecticut (SW)</h2>
        <p className="methodology-plain">
          Southwest Connecticut uses CTDOT posted vertical clearances for Fairfield County towns near NYC
          (Stamford, Greenwich, Norwalk, Bridgeport, and nearby). These are posted sign values from the agency bridge inventory — not inventing numbers from measured NBI fields.
        </p>
        <p>
          {typeof metadata.ctdotPostedRecords === "number" ? (
            <>This build includes <strong>{metadata.ctdotPostedRecords} CTDOT posted records</strong> after town filtering. </>
          ) : null}
          The source is{" "}
          <a href="https://services1.arcgis.com/FCaUeJ5SOVtImake/arcgis/rest/services/CTDOT_Bridges/FeatureServer/0" target="_blank" rel="noreferrer">
            CTDOT Bridges
          </a>
          . We read <code>PostedVertUnderClrncFt</code> / <code>PostedVertUnderClrncIN</code> (under) and
          {" "}<code>PostedVertClrncFt_6000029</code> / <code>PostedVertClrncIN_6000030</code> (on), convert feet+inches to whole inches,
          and place each record at the polygon centroid. Town names come from <code>Town_NBI4</code>.
        </p>
        <p>
          Connecticut posting practice may differ from New York’s one-foot convention. We always warn off the posted number only;
          we never add cushion inches back in.
        </p>
      </section>
      <section>
        <h2>NYC Open Data: legacy comparison</h2>
        <p className="methodology-plain">We also keep an older NYC low-bridge set for comparison only. It does not drive the red/orange warning layer.</p>
<p>We also imported {metadata.nycLegacyRecords} locations from <a href="https://data.cityofnewyork.us/Transportation/Citywide-Low-Bridges/rn6h-i66u" target="_blank" rel="noreferrer">Citywide Low Bridges</a>. Its linked KML is dated July 2009. The catalog’s 2024 modification date does not establish that its clearance measurements were refreshed.</p>
        <p>The <a href="https://www.nyc.gov/html/dot/downloads/pdf/lowbridge_kml_readme_july09.pdf" target="_blank" rel="noreferrer">NYC documentation</a> describes expressways and parkways, excludes local streets, and includes some directional values. It does not unambiguously identify every clearance as a posted sign value. These records are preserved for comparison and overlap review; they are not mixed into the posted warning layer.</p>
      </section>
      <section>
        <h2>New York’s one-foot convention</h2>
        <p className="methodology-plain">In New York, many clearance signs are posted one foot below the measured opening. That NY-only rule does not automatically apply to Connecticut records. Everywhere, we warn off the <strong>posted</strong> number — we never add inches back in to guess if you’ll fit.</p>
<p><a href="https://www.law.cornell.edu/regulations/new-york/17-NYCRR-2B.108" target="_blank" rel="noreferrer">New York’s clearance-sign regulation</a> specifies a legal posting one foot below measured clearance for qualifying structures under 14 feet. We use the posted number for every warning. We never add 12 inches to estimate whether a vehicle will fit.</p>
        <p>When a record is red or orange for your height, the detail card notes this convention: physical clearance may be about a foot higher than the posted number, but driving past the posted limit is still illegal.</p>
      </section>
      <section>
        <h2>Checking a route (A → B)</h2>
        <p className="methodology-plain">Pick two places in NYC, Long Island, or southwest Connecticut. We draw a driving path and list posted clearances near that line — a nearby-records check, not turn-by-turn truck routing.</p>
<p>From the map you can enter two places in the coverage area. We look those up with OpenStreetMap Nominatim, trace a driving path with OSRM, and list posted-clearance records within about 120 meters of that path, in order from A to B. That is a nearby-records check, not turn-by-turn directions, truck routing, or a statement that the road is clear.</p>
        <p>Place lookup and the path line use public OpenStreetMap services. They have usage limits and no availability guarantee. No account is created. When OSRM returns meaningfully different alternatives, the map offers a path compare — we never invent extra routes. Your height, selected clearance, from/to places, and chosen path index stay in the shareable URL so a clearance card or a route check can be sent as a link.</p>
      </section>
      <section>
        <h2>Awareness overlays (NYC)</h2>
        <p className="methodology-plain">Extra layers stay off until you turn them on. They load only when requested and never feed the A→B path check. These overlays are NYC-only.</p>
<p>Optional map layers help you see nearby truck network context. They stay off until you turn them on, load only when requested, and never feed the A→B path check.</p>
        <p><strong>Truck routes</strong> come from <a href="https://data.cityofnewyork.us/Transportation/New-York-City-Truck-Routes/jjja-shxy" target="_blank" rel="noreferrer">NYC Truck Routes</a> (<code>jjja-shxy</code>) — the Through / Local / Limited Local network.</p>
        <p><strong>Construction closures</strong> are a different feed: <a href="https://data.cityofnewyork.us/Transportation/Street-Closures-due-to-Construction-Activities-by-/ezy6-djsf" target="_blank" rel="noreferrer">Street Closures due to Construction (by block)</a> (<code>ezy6-djsf</code>). We keep rows whose work end date is still ahead, convert State Plane (EPSG:2263) WKT lines to WGS84, and skip point-only rows. These are construction block closures, not live traffic incidents.</p>
        <p><strong>Loading zones</strong> come from DOT curb signs in <a href="https://data.cityofnewyork.us/Transportation/Street-Sign-Work-Orders/qt6m-xctn" target="_blank" rel="noreferrer">Street Sign Work Orders</a> (<code>qt6m-xctn</code>) for truck loading, plus <a href="https://data.cityofnewyork.us/Transportation/Neighborhood-Loading-Zone-signs-locations-NYCDOT/6pjf-tf5u" target="_blank" rel="noreferrer">Neighborhood Loading Zone signs</a> (<code>6pjf-tf5u</code>). We keep <code>Current</code> signs with State Plane coordinates and plot them as points. A sign marks a curb regulation, not a guarantee that space is open.</p>
        <p>These overlays are NYC-only. Long Island still has posted clearances, but not these truck-route or closure feeds.</p>
      </section>
      <section>
        <h2>What the map cannot tell you</h2>
        <ul className="methodology-list">
          <li>A missing marker does not mean there is no low clearance.</li>
          <li>Agency data can be incomplete or outdated.</li>
          <li>Coordinates mark structures — not always the exact warning sign.</li>
          <li>Clearance is separate from weight limits, commercial rules, and whether a road is legal for your vehicle.</li>
          <li>Turning on truck-route or closure overlays does not validate a path.</li>
        </ul>
        <p>A missing marker does not establish that a road has no low-clearance hazard. Agency data may be incomplete or outdated, and the NYSDOT layer does not supply lane-by-lane or directional sign details. Coordinates identify structures and may not mark the exact warning sign.</p>
        <p>Clearance is separate from commercial-vehicle restrictions, bridge weights, road legality, and routing. An apparently sufficient posting does not make a road legal for your vehicle. Turning on truck-route or closure overlays does not validate a path.</p>
      </section>
      <section>
        <h2>Basemap & privacy</h2>
        <p className="methodology-plain">No account. No analytics. Your height, map view, and optional from/to places live in the shareable URL. Location is requested only when you press the location button.</p>
<p>The map uses a free Carto Voyager vector style over OpenStreetMap data, with attribution to <a href="https://carto.com/" target="_blank" rel="noreferrer">CARTO</a> and <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Place suggestions and path lines use Nominatim and OSRM. These are best-effort public services with usage limits and no availability guarantee. Tile and geocoder hosting must be revisited before a high-traffic launch.</p>
        <p>No account or analytics are used. Your height, map view, and optional from/to places are stored in the shareable URL. Location permission is requested only when you press the location button.</p>
      </section>
    </main>
  </>;
}
