"use client";
import { useEffect, useState } from "react";

// The Official Gay Guy Shop — owner admin.
// Password-gated (ADMIN_PASSWORD env). Edit / hide / delete any product, add new
// ones, all without touching code. Requires Supabase for writes (README: Admin setup).

const BLANK = {
  id: "",
  section: "tees",
  name: "",
  tagline: "",
  priceCents: 2999,
  shipCents: 499,
  garment: "black",
  sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
  editions: { standard: { image: "/designs/" } },
  pf: { type: "tshirt", color: "Black", placement: "front" },
};

export default function Admin() {
  const [pw, setPw] = useState("");
  const [ok, setOk] = useState(false);
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // JSON text being edited
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState("");

  async function load(password) {
    const res = await fetch("/api/admin/products", {
      headers: { "x-admin-password": password },
    });
    if (res.status === 401) {
      setMsg("Wrong password (or ADMIN_PASSWORD not set in env).");
      return;
    }
    setOk(true);
    setData(await res.json());
    setMsg("");
  }

  async function save(text) {
    let product;
    try {
      product = JSON.parse(text);
    } catch {
      setMsg("That's not valid JSON — check for missing commas/quotes.");
      return;
    }
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": pw },
      body: JSON.stringify({ product }),
    });
    const j = await res.json();
    setMsg(res.ok ? `Saved ${product.id} ✓` : `Save failed: ${j.error}`);
    if (res.ok) {
      setEditing(null);
      setEditingId(null);
      load(pw);
    }
  }

  async function remove(id) {
    if (!confirm(`Delete "${id}" permanently? (Hide is reversible; delete is not.)`)) return;
    const res = await fetch("/api/admin/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-admin-password": pw },
      body: JSON.stringify({ id }),
    });
    const j = await res.json();
    setMsg(res.ok ? `Deleted ${id}` : `Delete failed: ${j.error}`);
    load(pw);
  }

  async function toggleHidden(p) {
    await save(JSON.stringify({ ...p, hidden: !p.hidden }));
  }

  if (!ok) {
    return (
      <main className="admin-wrap">
        <h1>Shop Admin</h1>
        <p>Owner access for The Official Gay Guy Shop.</p>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="admin password"
          className="admin-input"
          onKeyDown={(e) => e.key === "Enter" && load(pw)}
        />
        <button className="opt sel" onClick={() => load(pw)}>Enter</button>
        {msg && <p className="admin-msg">{msg}</p>}
      </main>
    );
  }

  return (
    <main className="admin-wrap wide">
      <h1>Shop Admin</h1>
      {!data?.editable && (
        <p className="admin-msg">
          ⚠ Read-only: connect Supabase (README → Admin setup) to enable saving.
        </p>
      )}
      {msg && <p className="admin-msg">{msg}</p>}

      <button
        className="opt"
        onClick={() => {
          setEditingId("__new__");
          setEditing(JSON.stringify(BLANK, null, 2));
        }}
      >
        + Add product
      </button>

      {editing !== null && (
        <div className="admin-editor">
          <h3>{editingId === "__new__" ? "New product" : `Editing ${editingId}`}</h3>
          <p className="admin-hint">
            Plain-English fields: <code>name</code>, <code>tagline</code>,{" "}
            <code>priceCents</code> (2999 = $29.99), <code>sizes</code>,{" "}
            <code>editions.standard.image</code> (a file under /designs/),{" "}
            <code>situ</code> (photo under /mockups/), <code>hidden</code> true/false.
          </p>
          <textarea
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            rows={18}
            spellCheck={false}
          />
          <div className="admin-row">
            <button className="opt sel" onClick={() => save(editing)}>Save</button>
            <button className="opt" onClick={() => { setEditing(null); setEditingId(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {data?.sections?.map((s) => (
        <section key={s.id}>
          <h2>{s.title}</h2>
          <table className="admin-table">
            <tbody>
              {data.products
                .filter((p) => p.section === s.id)
                .map((p) => (
                  <tr key={p.id} className={p.hidden ? "row-hidden" : ""}>
                    <td className="cell-img">
                      <img
                        src={(p.editions?.standard || Object.values(p.editions || {})[0])?.image?.replace("/designs/", "/web/").replace(".png", ".webp")}
                        alt=""
                      />
                    </td>
                    <td>
                      <strong>{p.name}</strong>
                      <br />
                      <small>{p.id} · ${(p.priceCents / 100).toFixed(2)}{p.comingSoon ? " · SOON" : ""}{p.hidden ? " · HIDDEN" : ""}</small>
                    </td>
                    <td className="cell-actions">
                      <button
                        className="opt"
                        onClick={() => {
                          setEditingId(p.id);
                          setEditing(JSON.stringify(p, null, 2));
                        }}
                      >
                        Edit
                      </button>
                      <button className="opt" onClick={() => toggleHidden(p)}>
                        {p.hidden ? "Show" : "Hide"}
                      </button>
                      <button className="opt danger" onClick={() => remove(p.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
