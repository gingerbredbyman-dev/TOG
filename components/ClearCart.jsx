"use client";
import { useEffect } from "react";
import { clearCart } from "../lib/cart";

// Rendered on /success: the order is placed, so the cart empties itself.
export default function ClearCart() {
  useEffect(() => {
    clearCart();
  }, []);
  return null;
}
