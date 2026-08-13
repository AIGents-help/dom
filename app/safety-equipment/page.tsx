import Link from "next/link";
import BarrierProductVisual from "@/components/shop/BarrierProductVisual";

const products = [
  { count: 1 as const, name: "Single Barrier", price: "$69", href: "/safety-equipment/single-barrier", badge: "START HERE" },
  { count: 3 as const, name: "3-Post Field Kit", price: "$179", href: "/safety-equipment/3-post-field-kit", badge: "FIELD KIT" },
  { count: 4 as const, name: "4-Post Perimeter Kit", price: "$229", href: "/safety-equipment/4-post-perimeter-kit", badge: "BEST VALUE" },
  { count: 6 as const, name: "6-Post Jobsite Kit", price: "$319", href: "/safety-equipment/6-post-jobsite-kit", badge: "JOBSITE" },
  { count: 12 as const, name: "12-Post Fleet Kit", price: "$599", href: "/safety-equipment/12-post-fleet-kit", badge: "FLEET" },
  { count: 24 as const, name: "24-Post Corporate Kit", price: "$1,099", href: "/safety-equipment/24-post-corporate-kit", badge: "CORPORATE" },
];

export default function SafetyEquipmentPage() {
  return (
    <div className="bg-[#0b1118] text-white">
      <section className="border-b border-white/10">
        <div className="container-app grid gap-10 py-16 md:grid-cols-[1.05fr_.95fr] md:items-center md:py-20">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.2em] text-[#f26a1b]">DOM Safety Equipment</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight md:text-6xl">Professional ground safety. Professional operations.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">Purpose-built field equipment for commercial drone crews. The first DOM product is a high-visibility retractable barrier with simple <strong className="text-white">DRONE OPERATION</strong> webbing so it works across many operating environments.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#barriers" className="rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Shop Barrier Systems</Link>
              <Link href="/shop" className="rounded-lg border border-white/20 px-6 py-3.5 font-bold text-white transition hover:border-[#f26a1b]">DOM Merchandise →</Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
            <BarrierProductVisual count={4} className="h-full w-full" label="Four Drone Operation retractable barriers" />
          </div>
        </div>
      </section>

      <section id="barriers" className="container-app py-16 md:py-20">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">Barriers & Perimeters</p>
            <h2 className="mt-2 text-3xl font-extrabold md:text-4xl">Choose the exact kit for your operation.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">Every listing below shows the exact number of posts included. Each post has 6 ft retractable DRONE OPERATION webbing.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <Link key={product.count} href={product.href} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#111923] transition hover:-translate-y-1 hover:border-[#f26a1b] hover:shadow-2xl">
              <div className="relative bg-white p-3">
                <BarrierProductVisual count={product.count} className="aspect-[9/6] w-full" label={`Exactly ${product.count} Drone Operation barrier ${product.count === 1 ? "post" : "posts"}`} />
                <span className="absolute left-5 top-5 rounded-full bg-[#172033] px-3 py-1 text-xs font-bold tracking-wider text-white">{product.badge}</span>
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-xl font-extrabold">{product.name}</h3>
                  <span className="text-2xl font-extrabold text-[#f26a1b]">{product.price}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-400">Exactly {product.count} retractable {product.count === 1 ? "post" : "posts"}. High-visibility orange finish and 6 ft webbing per unit.</p>
                <div className="mt-5 font-bold text-[#f26a1b]">View product →</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0e151e]">
        <div className="container-app grid gap-8 py-12 md:grid-cols-4">
          {[
            ["Professional Quality", "Built for repeat field use."],
            ["High Visibility", "A clear visual boundary around operations."],
            ["Secure Checkout", "Stripe payment and shipping details."],
            ["Volume Options", "From one post to 24-post corporate kits."],
          ].map(([title, copy]) => <div key={title}><p className="font-extrabold text-white">{title}</p><p className="mt-2 text-sm text-slate-400">{copy}</p></div>)}
        </div>
      </section>

      <section className="container-app py-14 text-center">
        <p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">Larger Orders</p>
        <h2 className="mt-3 text-3xl font-extrabold">Need more than 24 posts or custom corporate webbing?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-400">Contact DOM directly for larger fleet quantities, freight coordination, and future custom-webbing requests.</p>
        <a href="mailto:ops@droneopsman.com?subject=Corporate%20Drone%20Barrier%20Order" className="mt-7 inline-flex rounded-lg bg-[#f26a1b] px-6 py-3.5 font-bold text-white transition hover:bg-[#d9570c]">Contact Corporate Sales</a>
      </section>
    </div>
  );
}
