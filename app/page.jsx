import { allSections } from "../lib/catalog";
import { formatPrice, webPath } from "../lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sections = await allSections();
  return (
    <main>
      <section className="hero">
        <h1>
          OFFICIALLY <span className="hl">CERTIFIED</span> MERCH
        </h1>
        <p>
          Tees, caps, mugs and stickers from The Official Gay Guy — printed one at a
          time, only when you order. Most designs come in two editions:
          <strong> Standard</strong> or <strong>Ethical ✦</strong> (labeled AI art from
          consenting sources only, lettering hand-set by actual fonts with actual
          licenses). And it all gives back: <strong>5% of all proceeds go to a gay
          charity of TOGG&rsquo;s choosing.</strong>
        </p>
        <div className="badge-row">
          <span className="pill">PRINTED PER ORDER</span>
          <span className="pill alt">CERTIFIED ✦ AUTHENTIC</span>
          <span className="pill alt2">ETHICAL EDITION AVAILABLE</span>
          <span className="pill charity">5% TO A GAY CHARITY</span>
        </div>
      </section>

      {sections.map((s) => (
        <section className="section" id={s.id} key={s.id}>
          <h2>{s.title}</h2>
          <div className="grid">
            {s.products.map((p) => {
              const firstEdition = p.editions.standard || Object.values(p.editions)[0];
              const ethicalOnly = !p.editions.standard;
              const cardImg = p.situ || webPath(firstEdition.image);
              const card = (
                <div className={`card ${p.comingSoon ? "soon" : ""}`}>
                  {p.comingSoon && <span className="soon-badge">SOON</span>}
                  {p.luxe && !p.comingSoon && <span className="luxe-badge">LUXE ✦</span>}
                  {ethicalOnly && <span className="eth-chip">ETHICAL AI ✦</span>}
                  <div className={`card-img garment-${p.garment || "white"}`}>
                    <img src={cardImg} alt={p.name} loading="lazy" />
                  </div>
                  <div className="card-body">
                    <h3>{p.name}</h3>
                    <p className="card-tag">{p.tagline}</p>
                    <span className="card-price">{formatPrice(p.priceCents)}</span>
                  </div>
                </div>
              );
              return p.comingSoon ? (
                <div key={p.id}>{card}</div>
              ) : (
                <a href={`/p/${p.id}`} key={p.id}>
                  {card}
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
