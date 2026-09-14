"use client";
import { useRouter } from "next/navigation";
import { HeightForm } from "./height-form";

export function StartScreen() {
  const router = useRouter();
  return <main className="start-screen">
    <section className="start-main"><p className="eyebrow">A LITTLE HEADS UP GOES A LONG WAY</p><h1>How tall<br />are you<span>?</span></h1><p className="start-description">Your van. Your RV. Your moving truck.<br />See the low clearances that matter to you.</p><HeightForm onSubmit={height => router.push(`/map?height=${height}`)} /><p className="height-tip">Measure your full vehicle height, including anything on the roof. On the map, check a route from A to B or pan around.</p></section>
    <section className="start-guide" aria-label="How clearance warnings work"><div className="guide-top"><span className="eyebrow">KNOW YOUR CLEARANCE</span><span className="guide-index">01 / 02</span></div><div className="example-posting"><span>POSTED CLEARANCE</span><strong>8′ 11″</strong><span className="posting-arrow" aria-hidden="true">↕</span></div><div className="guide-caption"><span className="example-tag">FOR A 9′ 0″ VEHICLE</span><h2>One inch makes<br />a difference.</h2></div></section>
    <footer className="start-footer"><span>FREE TO USE. NO ACCOUNT. JUST A MAP.</span><span>Official NYSDOT + CTDOT records · Partial coverage</span></footer>
  </main>;
}
