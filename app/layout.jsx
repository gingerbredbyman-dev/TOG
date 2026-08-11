import "./globals.css";

export const metadata = {
  title: "The Official Gay Guy Shop",
  description:
    "The Official Gay Guy Shop — officially certified tees, caps, mugs and stickers, printed per order in the USA. Florida born. Standard or Ethical edition — your call.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Shrikhand&family=Pacifico&family=Archivo+Black&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="site-header">
          <a href="/" className="brand">
            <img src="/logo.png" alt="T.O.G. seal" className="brand-seal" />
            <span className="brand-words">
              <span className="brand-script">The Official</span>
              <span className="brand-chunk">GAY GUY SHOP</span>
              <span className="brand-sub">FLORIDA</span>
            </span>
          </a>
          <nav className="site-nav">
            <a href="/#tees">Tees</a>
            <a href="/#caps">Caps</a>
            <a href="/#mugs">Mug</a>
            <a href="/#stickers">Stickers</a>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p className="foot-script">the official gay guy shop</p>
          <p className="foot-fine">
            Florida • a 50/50 partner project • every item printed per order — no
            warehouses, no waste • Ethical Edition art from consenting sources only •
            satire • for entertainment purposes only
          </p>
        </footer>
      </body>
    </html>
  );
}
