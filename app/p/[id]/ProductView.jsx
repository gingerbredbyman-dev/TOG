"use client";
import { useState } from "react";
import { formatPrice, webPath } from "../../../lib/format";
import { addToCart, openCart, cartCountry } from "../../../lib/cart";

export default function ProductView({ product }) {
  const editions = Object.keys(product.editions);
  const [edition] = useState(editions[0]);
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

  function add() {
    addToCart({ id: product.id, edition, size, qty: 1 });
    openCart();
  }

  async function buyNow() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ id: product.id, edition, size, qty: 1 }],
          country: cartCountry(),
        }),
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
          🏳️‍🌈 5% of every sale goes to SAGE — fighting homelessness among LGBTQ+
          elders with affordable, discrimination-free housing.
        </p>

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

        <button className="buy-btn" onClick={add} disabled={busy}>
          Add to cart
        </button>
        <button className="buy-btn ghost" onClick={buyNow} disabled={busy}>
          {busy ? "Summoning checkout…" : "Buy it now — just this one"}
        </button>
        {err && <p className="buy-note">⚠ {err}</p>}
        <p className="buy-note">
          Printed &amp; shipped per order via Printful. Mix items in the cart — one
          order, one shipping charge.
        </p>
      </div>
    </main>
  );
}
