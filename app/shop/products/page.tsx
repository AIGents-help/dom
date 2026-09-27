import Link from "next/link";
import Image from "next/image";
import BarrierProductVisual from "@/components/shop/BarrierProductVisual";
import QuantityBuyButton from "@/components/shop/QuantityBuyButton";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export default async function StoreCatalogPage() {
  const { data: products } = await getSupabaseAdmin().from("shop_inventory").select("product_key,product_name,description,unit_amount_cents,variants,category,image_url,fulfillment_mode,available_quantity").eq("active", true).order("sort_order").order("product_name");
  return <main className="min-h-screen bg-[#090f16] py-16 text-white"><div className="container-app"><p className="text-sm font-black uppercase tracking-[.2em] text-[#f26a1b]">DOM Store</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-4xl font-black">Available products</h1><p className="mt-2 text-slate-400">Active inventory and current pricing, managed by DOM.</p></div><Link href="/shop" className="font-bold text-[#f26a1b]">← Shop home</Link></div><div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{(products ?? []).map((product) => {
          const soldOut = product.fulfillment_mode === "stocked" && (product.available_quantity ?? 0) < 1;
          const barrierMatch = product.product_key.match(/^barrier-(1|3|4|6|12|24)$/);
          return (
            <article key={product.product_key} className="overflow-hidden rounded-2xl border border-white/10 bg-[#111923]">
              <div className="aspect-[4/3] overflow-hidden border-b border-white/10 bg-white">
                {product.image_url ? (
                  <Image src={product.image_url} alt={product.product_name} width={900} height={675} unoptimized className="h-full w-full object-contain p-3" />
                ) : barrierMatch ? (
                  <BarrierProductVisual count={Number(barrierMatch[1]) as 1 | 3 | 4 | 6 | 12 | 24} className="h-full w-full object-contain" label={product.product_name} />
                ) : (
                  <div className="grid h-full place-items-center bg-slate-100 px-6 text-center text-sm font-bold text-slate-400">Product image coming soon</div>
                )}
              </div>
              <div className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-wider text-[#f26a1b]">{product.category}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                    soldOut
                      ? "border-amber-400/35 bg-amber-400/10 text-amber-300"
                      : product.fulfillment_mode === "stocked"
                        ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300"
                        : "border-sky-400/35 bg-sky-400/10 text-sky-300"
                  }`}>
                    {soldOut
                      ? "Out of stock"
                      : product.fulfillment_mode === "stocked"
                        ? `${product.available_quantity ?? 0} in stock`
                        : "Made to order"}
                  </span>
                </div>
                <h2 className="mt-2 text-xl font-black">{product.product_name}</h2>
                <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">{product.description}</p>
                {product.fulfillment_mode === "made_to_order" ? (
                  <p className="mt-3 text-xs font-semibold text-slate-500">Built when ordered · quantity is not limited by stocked inventory.</p>
                ) : null}
                <strong className="mt-5 block text-2xl">${(product.unit_amount_cents / 100).toFixed(2)}</strong>
                {soldOut ? (
                  <p className="mt-5 font-bold text-amber-400">Temporarily out of stock</p>
                ) : (
                  <QuantityBuyButton
                    productKey={product.product_key}
                    unitPrice={product.unit_amount_cents / 100}
                    options={product.variants}
                    maxQuantity={product.fulfillment_mode === "stocked" ? (product.available_quantity ?? 0) : 20}
                  />
                )}
              </div>
            </article>
          );
        })}{(products ?? []).length === 0 && <div className="rounded-xl border border-white/10 p-8 text-slate-400">No products are currently available.</div>}</div></div></main>;
}
