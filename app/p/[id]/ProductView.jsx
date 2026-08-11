"use client";
import { useState } from "react";
import { formatPrice } from "../../../lib/catalog";

export default function ProductView({ product }) {
  const editions = Object.keys(product.editions);
  const [edition, setEdition] = useState(editions[0]);
  const [size, setSize] = useState(product.sizes?.[0] || null);
  const [side, setSide] = useState("image");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const ed = product.editions[edition];
  const shownImage = side === "back" && ed.back ? ed.back : ed.image;
  const hasToggle = editions.length > 1 && !product.unifiedEdition;

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

  return (
    <main className="pp">
      <div>
        <div className={`pp-img garment-${product.garment || "white"}`}>
          <img src={shownImage} alt={product.name} />
        </div>
        {product.twoSided && ed.back && (
          <div className="pp-thumbs">
            <button
              className={side === "image" ? "active" : ""}
              onClick={() => setSide("image")}
              aria-label="front"
            >
              <img src={ed.image} alt="front" />
            </button>
            <button
              className={side === "back" ? "active" : ""}
              onClick={() => setSide("back")}
              aria-label="back"
            >
              <img src={ed.back} alt="back" />
            </button>
          </div>
        )}
      </div>

      <div className="pp-info">
        <h1>{product.name}</h1>
        <p className="pp-tag">{product.tagline}</p>
        <div className="pp-price">{formatPrice(product.priceCents)}</div>

        {hasToggle && (
          <>
            <div className="opt-label">Edition</div>
            <div className="opt-row">
              {editions.map((e) => (
                <button
                  key={e}
                  className={`opt ${edition === e ? "sel" : ""}`}
                  onClick={() => setEdition(e)}
                >
                  {e === "standard" ? "Standard" : "Ethical ✦"}
                </button>
              ))}
            </div>
            <div className="edition-note">
              {edition === "ethical" ? (
                <>
                  <strong>Ethical Edition:</strong> lettering hand-set in open-licensed
                  fonts (zero AI type) and painterly art from a model trained only on
                  public-domain &amp; permissioned works. Same price — your values, your
                  call.
                </>
              ) : (
                <>
                  <strong>Standard Edition:</strong> the full-gloss flagship artwork.
                  Prefer art from consenting sources only? Flip to Ethical ✦ — same
                  price.
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
