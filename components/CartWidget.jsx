"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  readCart, setLineQty, removeLine, cartCount, onCartChange, onCartOpen, MAX_QTY,
  cartCountry, setCartCountry,
} from "../lib/cart";
import { formatPrice } from "../lib/format";

export default function CartWidget() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [quote, setQuote] = useState(null); // { lines, subtotalCents, shippingCents, totalCents }
  const [quoteErr, setQuoteErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkoutErr, setCheckoutErr] = useState("");
  const [pop, setPop] = useState(false);
  const abortRef = useRef(null);
  const panelRef = useRef(null);

  const [fallbackLines, setFallbackLines] = useState([]);

  const requote = useCallback(() => {
    const lines = readCart();
    setQuoteErr("");
    setFallbackLines(lines);
    abortRef.current?.abort();
    if (!lines.length) {
      setQuote(null);
      return;
    }
    const ctl = new AbortController();
    abortRef.current = ctl;
    fetch("/api/cart-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: lines, country: cartCountry() }),
      signal: ctl.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (ctl.signal.aborted) return;
        if (data.error) {
          setQuote(null);
          setQuoteErr(data.error);
        } else setQuote(data);
      })
      .catch(() => {
        if (!ctl.signal.aborted) setQuoteErr("Couldn't price the cart — try again.");
      });
  }, []);

  // Count badge lives in the header from first paint; quote only when open.
  useEffect(() => {
    setCount(cartCount());
    const offChange = onCartChange(() => {
      setCount(cartCount());
      setPop(true);
      setTimeout(() => setPop(false), 350);
      requote();
    });
    const offOpen = onCartOpen(() => setOpen(true));
    return () => {
      offChange();
      offOpen();
    };
  }, [requote]);

  useEffect(() => {
    if (!open) return;
    requote();
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    panelRef.current?.querySelector("button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requote]);

  async function checkout() {
    if (!quote) return;
    setBusy(true);
    setCheckoutErr("");
    try {
      // Charge exactly the lines and country the drawer is DISPLAYING (the
      // quote), not a re-read of localStorage — another tab may have changed
      // the cart since, and the buyer must never pay a total they didn't see.
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: quote.lines.map((l) => ({ id: l.id, edition: l.edition, size: l.size, qty: l.qty })),
          country: quote.country,
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setCheckoutErr(data.error || "Checkout is not connected yet.");
    } catch {
      setCheckoutErr("Something hiccuped — try again.");
    } finally {
      setBusy(false);
    }
  }

  const lines = quote?.lines || [];

  return (
    <>
      <button
        className="cart-btn"
        onClick={() => setOpen(true)}
        aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}
      >
        CART
        {count > 0 && <span className={`cart-count ${pop ? "pop" : ""}`}>{count}</span>}
      </button>

      {open && <div className="cart-overlay" onClick={() => setOpen(false)} />}

      <aside className={`cart-drawer ${open ? "open" : ""}`} ref={panelRef} aria-hidden={!open}>
        <div className="cart-head">
          <h2>Your Cart</h2>
          <button className="cart-close" onClick={() => setOpen(false)} aria-label="Close cart">
            ×
          </button>
        </div>

        {count === 0 ? (
          <div className="cart-empty">
            <p>Nothing in the bag yet.</p>
            <p className="cart-empty-sub">The tees are waiting. So are the mugs.</p>
            <button className="buy-btn" onClick={() => setOpen(false)}>
              Keep browsing
            </button>
          </div>
        ) : (
          <>
            <div className="cart-lines">
              {lines.map((l) => (
                <div className="cart-line" key={`${l.id}:${l.size}`}>
                  <div className="cart-thumb">
                    <img src={l.image} alt={l.name} />
                  </div>
                  <div className="cart-line-info">
                    <span className="cart-line-name">{l.name}</span>
                    <span className="cart-line-meta">
                      {l.size ? `${l.size} • ` : ""}
                      {formatPrice(l.priceCents)} each
                    </span>
                    <div className="cart-qty">
                      <button
                        onClick={() => setLineQty(l, l.qty - 1)}
                        aria-label={`One less ${l.name}`}
                      >
                        −
                      </button>
                      <span>{l.qty}</span>
                      <button
                        onClick={() => setLineQty(l, l.qty + 1)}
                        disabled={l.qty >= MAX_QTY}
                        aria-label={`One more ${l.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="cart-line-end">
                    <span className="cart-line-total">{formatPrice(l.lineCents)}</span>
                    <button
                      className="cart-remove"
                      onClick={() => removeLine(l)}
                      aria-label={`Remove ${l.name}`}
                    >
                      remove
                    </button>
                  </div>
                </div>
              ))}
              {!quote && !quoteErr && <p className="cart-note">Pricing your haul…</p>}
              {quoteErr && (
                <>
                  <p className="cart-err">⚠ {quoteErr}</p>
                  {/* The quote failed (e.g. a product left the catalog), so the
                      priced lines above are empty — offer the raw cart so the
                      buyer can remove the dead line instead of being stuck. */}
                  {fallbackLines.map((l) => (
                    <div className="cart-line" key={`fb:${l.id}:${l.size}`}>
                      <div className="cart-line-info">
                        <span className="cart-line-name">{l.id}</span>
                        <span className="cart-line-meta">{l.size ? `${l.size} • ` : ""}qty {l.qty}</span>
                      </div>
                      <div className="cart-line-end">
                        <button className="cart-remove" onClick={() => removeLine(l)}>
                          remove
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="cart-country">
              <span className="opt-label">Ships to</span>
              {["US", "CA"].map((c) => (
                <button
                  key={c}
                  className={`opt ${(quote?.country || cartCountry()) === c ? "sel" : ""}`}
                  onClick={() => setCartCountry(c)}
                >
                  {c === "US" ? "United States" : "Canada"}
                </button>
              ))}
            </div>

            {quote && (
              <div className="cart-totals">
                <div>
                  <span>Subtotal</span>
                  <span>{formatPrice(quote.subtotalCents)}</span>
                </div>
                <div>
                  <span>Shipping</span>
                  <span>{formatPrice(quote.shippingCents)}</span>
                </div>
                <div className="cart-sage">
                  <span>🏳️‍🌈 5% to SAGE (included)</span>
                  <span>{formatPrice(quote.sageCents)}</span>
                </div>
                <div className="cart-grand">
                  <span>Total</span>
                  <span>{formatPrice(quote.totalCents)}</span>
                </div>
              </div>
            )}

            <button className="buy-btn cart-checkout" onClick={checkout} disabled={busy || !quote}>
              {busy ? "Summoning checkout…" : "Check out — printed just for you"}
            </button>
            {checkoutErr && <p className="cart-err">⚠ {checkoutErr}</p>}
            <p className="cart-note">
              Shipping is exactly what the printers charge us — no padding. 5% of
              every sale goes to SAGE for LGBTQ+ elders.
            </p>
          </>
        )}
      </aside>
    </>
  );
}
