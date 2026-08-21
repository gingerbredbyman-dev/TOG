"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  readCart, setLineQty, removeLine, cartCount, onCartChange, onCartOpen, MAX_QTY,
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

  const requote = useCallback(() => {
    const lines = readCart();
    setQuoteErr("");
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
      body: JSON.stringify({ items: lines }),
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
    setBusy(true);
    setCheckoutErr("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: readCart() }),
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
              {quoteErr && <p className="cart-err">⚠ {quoteErr}</p>}
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
              One order, one shipping charge — everything prints when you do.
            </p>
          </>
        )}
      </aside>
    </>
  );
}
