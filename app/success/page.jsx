export default async function Success({ searchParams }) {
  const params = await searchParams;
  const demo = params?.demo === "1";
  return (
    <main className="success-wrap">
      <h1>{demo ? "Demo checkout ✦ complete" : "Officially yours!"}</h1>
      {demo ? (
        <p>
          This store is in <strong>preview mode</strong> — no money moved and nothing
          was printed. Once Mike&apos;s Stripe is connected, this exact flow charges the
          card and sends the order straight to the printers.
        </p>
      ) : (
        <p>
          Your order is confirmed and heading to the printers — made just for you,
          because you ordered it. A receipt is in your email. Wear it loudly. 🏳️‍🌈
        </p>
      )}
      <p>
        <a href="/">← Back to the shop</a>
      </p>
    </main>
  );
}
