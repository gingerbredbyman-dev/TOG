import { getProduct } from "../../../lib/catalog";
import ProductView from "./ProductView";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product || product.comingSoon) {
    return (
      <main className="success-wrap">
        <h1>Not here yet</h1>
        <p>
          That one is still at the printers. <a href="/">← Back to the shop</a>
        </p>
      </main>
    );
  }
  return <ProductView key={product.id} product={product} />;
}
