import Link from "next/link";

const cards = [
  { href: "/admin/store/products", title: "Products", copy: "Add products and edit pricing, descriptions, variants, availability, inventory, and shipping." },
  { href: "/admin/orders", title: "Orders & Fulfillment", copy: "Process paid orders, add tracking, mark delivery, and issue eligible refunds." },
  { href: "/shop/products", title: "View Live Catalog", copy: "Review the active customer-facing catalog and test the path into checkout." },
];

export default function AdminStorePage() {
  return <main className="section"><div className="container-app"><p className="eyebrow mb-2">Ecommerce</p><h1 className="heading-lg">Store</h1><p className="body-muted mt-2">Manage the complete product-to-fulfillment workflow from one place.</p><div className="mt-7 grid gap-4 md:grid-cols-3">{cards.map((card) => <Link key={card.href} href={card.href} className="card block p-6 text-inherit no-underline transition hover:border-[#f26a1b] hover:shadow-md"><h2 className="text-xl font-extrabold">{card.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{card.copy}</p><span className="mt-5 inline-block font-bold text-[#f26a1b]">Open →</span></Link>)}</div></div></main>;
}
