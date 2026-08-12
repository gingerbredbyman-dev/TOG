"use client";
import { useState } from "react";
import { formatPrice, webPath } from "../../../lib/format";

export default function ProductView({ product }) {
  const editions = Object.keys(product.editions);
  const [edition, setEdition] = useState(editions[0]);
  const [size, setSize] = useState(product.sizes?.[0] || null);
  const [view, setView] = useState("front"); // front | back | situ
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const ed = product.editions[edition];
  const shownImage =
    view === "situ" && product.situ
      ? product.situ
      : view === "back" && ed.back
        ? webPath(ed.back)
        : webPath(ed.image);
  const hasToggle = editions.length > 1 && !product.unifiedEdition;
  const isEthical = edition === "ethical";

  async function buy() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, edition, size }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setErr(data.error || "Checkout is not connected yet.");
    } catch {
      setErr("Something hiccuped — try again.");
    } finally {
      setBusy(false);
    }
  }

  const thumbs = [
    { key: "front", src: webPath(ed.image), label: product.twoSided ? "front" : "design" },
    ...(product.twoSided && ed.back ? [{ key: "back", src: webPath(ed.back), label: "back" }] : []),
    ...(product.situ ? [{ key: "situ", src: product.situ, label: "in real life" }] : []),
  ];

  return (
    <main className="pp">
      <div>
        <div className={`pp-img garment-${product.garment || "white"}`}>
          {isEthical && <span className="eth-label">ETHICALLY-SOURCED AI ART ✦</span>}
          <img src={shownImage} alt={product.name} />
        </div>
        {thumbs.length > 1 && (
          <div className="pp-thumbs">
            {thumbs.map((t) => (
              <button
                key={t.key}
                className={view === t.key ? "active" : ""}
                onClick={() => setView(t.key)}
                aria-label={t.label}
                title={t.label}
              >
                <img src={t.src} alt={t.label} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pp-info">
        <h1>{product.name}</h1>
        <p className="pp-tag">{product.tagline}</p>
        <div className="pp-price">{formatPrice(product.priceCents)}</div>
        <p className="charity-note">
          🏳️‍🌈 5% of all proceeds go to a gay charity of TOG&rsquo;s choosing.
        </p>

        {hasToggle && (
          <>
            <div className="opt-label">Edition</div>
            <div className="opt-row">
              {editions.map((e) => (
                <button
                  key={e}
                  className={`opt ${edition === e ? "sel" : ""}`}
                  onClick={() => {
                    setEdition(e);
                    if (view === "back" && !product.editions[e].back) setView("front");
                  }}
                >
                  {e === "standard" ? "Standard" : "Ethical ✦"}
                </button>
              ))}
            </div>
            <div className="edition-note">
              {isEthical ? (
                <>
                  <strong>Ethical Edition — labeled AI:</strong> this artwork is
                  AI-generated from consenting sources only (a model trained
                  exclusively on public-domain and permissioned works) with lettering
                  hand-set in open-licensed fonts. Same price — your values, your call.
                </>
              ) : (
                <>
                  <strong>Standard Edition:</strong> the flagship artwork. Prefer
                  AI art from consenting sources only? Flip to Ethical ✦ — same price.
                </>
              )}
            </div>
          </>
        )}

        {product.sizes && product.sizes.length > 1 && (
          <>
            <div className="opt-label">Size</div>
            <div className="opt-row">
              {product.sizes.map((s) => (
                <button
                  key={s}
                  className={`opt ${size === s ? "sel" : ""}`}
                  onClick={() => setSize(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        <button className="buy-btn" onClick={buy} disabled={busy}>
          {busy ? "Summoning checkout…" : "Buy it — printed just for you"}
        </button>
        {err && <p className="buy-note">⚠ {err}</p>}
        <p className="buy-note">
          Printed &amp; shipped per order via Printful. Quantity adjustable at checkout.
        </p>
      </div>
    </main>
  );
}
