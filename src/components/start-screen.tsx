"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { HeightForm } from "./height-form";

export function StartScreen() {
  const router = useRouter();
  const [commercial, setCommercial] = useState(false);
  return <main className="start-screen">
    <section className="start-main">
      <p className="eyebrow">NYC · LI · SW CT · NE NJ</p>
      <h1>Low bridge<br /><span>clearances</span></h1>
      <p className="start-description">Posted truck heights on a map — not a GPS. For the van, the box truck, the car with a mattress on the roof. Enter your vehicle height. Red means you don’t fit under the sign.</p>
      <HeightForm
        showCommercial
        commercial={commercial}
        onCommercialChange={setCommercial}
        onSubmit={height => {
          const params = new URLSearchParams({ height: String(height) });
          if (commercial) params.set("commercial", "1");
          router.push(`/map?${params}`);
        }}
      />
      <p className="height-tip">Measure full vehicle height, including anything on the roof. Covers vehicles up to 13′6″ — taller than that is an oversized load we don’t support yet.</p>
    </section>
    <section className="start-guide" aria-label="How clearance warnings work">
      <div className="guide-top"><span className="eyebrow">Caution · Know your clearance</span><span className="guide-index">01 / 02</span></div>
      <div className="example-posting"><span>Low clearance</span><strong>8′ 11″</strong><span className="posting-arrow" aria-hidden="true">↕</span></div>
      <div className="guide-caption">
        <span className="example-tag">For a 9′ 0″ vehicle</span>
        <h2>One inch<br />makes a difference</h2>
        <p>Enter your vehicle height. We mark the posted lows. No CDL software, no account — just whether the sign clears you.</p>
      </div>
    </section>
    <footer className="start-footer">
      <span>Free · No account · Not a trucker GPS</span>
      <span>Official NYSDOT + CTDOT records · Partial coverage</span>
    </footer>
  </main>;
}
