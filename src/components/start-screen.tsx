"use client";
import { useRouter } from "next/navigation";
import { HeightForm } from "./height-form";

export function StartScreen() {
  const router = useRouter();
  return <main className="start-screen">
    <section className="start-main">
      <p className="eyebrow">NOT A TRUCKER GPS</p>
      <h1>Posted truck<br /><span>clearances.</span></h1>
      <p className="start-description">A map of low bridges around NYC, Long Island, southwest Connecticut, and northeast New Jersey. For the van, the box truck, the car with a mattress on the roof. Enter your vehicle height — red means you don’t fit.</p>
      <HeightForm onSubmit={height => router.push(`/map?height=${height}`)} />
      <p className="height-tip">Measure your full vehicle height, including anything on the roof. This map covers vehicles up to 13′6″ — taller than that is an oversized load we don’t support yet.</p>
    </section>
    <section className="start-guide" aria-label="How clearance warnings work">
      <div className="guide-top"><span className="eyebrow">KNOW YOUR CLEARANCE</span><span className="guide-index">01 / 02</span></div>
      <div className="example-posting"><span>POSTED CLEARANCE</span><strong>8′ 11″</strong><span className="posting-arrow" aria-hidden="true">↕</span></div>
      <div className="guide-caption">
        <span className="example-tag">FOR A 9′ 0″ VEHICLE</span>
        <h2>One inch makes<br />a difference.</h2>
        <p>Enter your height. We show the posted lows. No CDL software, no account — just whether you’ll fit.</p>
      </div>
    </section>
    <footer className="start-footer">
      <span>FREE. NO ACCOUNT. NOT A TRUCKER GPS.</span>
      <span>Official NYSDOT + CTDOT records · Partial coverage</span>
    </footer>
  </main>;
}
