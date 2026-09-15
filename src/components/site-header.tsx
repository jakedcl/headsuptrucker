import Link from "next/link";

export function SiteHeader() {
  return <header className="site-header"><Link className="brand" href="/" aria-label="Heads' Up home"><span className="brand-mark" aria-hidden="true">↕</span>HEADS<span className="brand-mark-unit" aria-hidden="true">'</span> UP<span className="brand-mark-unit" aria-hidden="true">"</span></Link><nav><span className="region-label">NYC + LI + SW CT + NE NJ</span><Link href="/methodology">How the data works <span aria-hidden="true">↗</span></Link></nav></header>;
}
