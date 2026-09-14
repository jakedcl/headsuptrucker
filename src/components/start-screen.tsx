"use client";
import { useRouter } from "next/navigation";
import { HeightForm } from "./height-form";

export function StartScreen() {
  const router = useRouter();
  return <main className="start-screen">
    <section className="start-main"><p className="eyebrow">A LITTLE HEADS UP GOES A LONG WAY</p><h1>How tall<br />are you<span>?</span></h1><p className="start-description">Your van. Your RV. Your moving truck.<br />See the low clearances that matter to you.</p><HeightForm onSubmit={height => router.push(`/map?height=${height}`)} /><p className="height-tip">Measure your full vehicle height, including anything on the roof. Check the map before driving.</p></section>
    <section className="start-guide" aria-label="How clearance warnings work"><div className="guide-top"><span className="eyebrow">KNOW YOUR CLEARANCE</span><span className="guide-index">01 / 02</span></div><div className="example-posting"><span>POSTED CLEARANCE</span><strong>8′ 11″</strong><span className="posting-arrow" aria-hidden="true">↕</span></div><div className="guide-caption"><span className="example-tag">FOR A 9′ 0″ VEHICLE</span><h2>One inch makes<br />a difference.</h2><p>We compare the posted number with your height. Equal or lower is red. The next 12 inches are orange.</p></div><div className="guide-legend"><div><i className="swatch danger" />At or below your height</div><div><i className="swatch caution" />1–12″ above your height</div></div></section>
    <footer className="start-footer"><span>FREE TO USE. NO ACCOUNT. JUST A MAP.</span><span>Official NYSDOT records · Partial coverage</span></footer>
  </main>;
}
