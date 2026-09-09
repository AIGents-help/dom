import Image from "next/image";
import Link from "next/link";
import QuantityBuyButton from "@/components/shop/QuantityBuyButton";

export default function DroneOperationSafetyVestPage() {
  return (
    <div className="min-h-screen bg-[#0b1118] text-white">
      <div className="container-app py-6 text-sm text-slate-400">
        <Link href="/safety-equipment" className="hover:text-[#f26a1b]">Safety Equipment</Link>
        <span className="mx-2">/</span>Drone Operation Safety Vest
      </div>

      <section className="container-app grid gap-10 pb-16 pt-4 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
        <div className="grid grid-cols-2 gap-3">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
            <Image src="/shop/safety/drone-operation-vest-front.jpeg" alt="Front of orange Drone Operation safety vest with DOM mark" width={720} height={1280} className="aspect-[3/4] h-full w-full object-cover" priority />
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
            <Image src="/shop/safety/drone-operation-vest-back.jpeg" alt="Back of orange safety vest printed with Drone Operation" width={720} height={1280} className="aspect-[3/4] h-full w-full object-cover" priority />
          </div>
        </div>

        <div>
          <span className="inline-flex rounded-full bg-[#f26a1b] px-3 py-1 text-xs font-black tracking-wider text-white">CREW SAFETY</span>
          <p className="mt-5 text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">DOM Safety Equipment</p>
          <h1 className="mt-2 text-4xl font-extrabold leading-tight md:text-5xl">Drone Operation Safety Vest</h1>
          <div className="mt-4 text-5xl font-black text-[#f26a1b]">$15 <span className="text-xl text-slate-300">each</span></div>
          <p className="mt-6 text-lg leading-8 text-slate-300">Identify the pilot and visual observer while improving crew visibility around an active drone operation. The orange vest includes reflective striping, a DOM mark on the front, and clear DRONE OPERATION lettering on the back.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {["Sizes S, M, L, and XL", "High-visibility orange", "Reflective front and back striping", "Front pockets and zipper closure"].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-[#111923] p-4 text-sm font-semibold text-slate-200"><span className="mr-2 text-[#f26a1b]">✓</span>{item}</div>
            ))}
          </div>
          <QuantityBuyButton productKey="drone-operation-safety-vest" unitPrice={15} options={["S", "M", "L", "XL"]} />
          <p className="mt-3 text-xs leading-5 text-slate-500">Choose one size per checkout line. For mixed-size orders, place separate orders or contact DOM.</p>
        </div>
      </section>

      <section className="container-app pb-16">
        <div className="grid gap-8 overflow-hidden rounded-3xl border border-white/10 bg-[#111923] md:grid-cols-[.8fr_1.2fr] md:items-center">
          <Image src="/shop/safety/drone-operation-vest-size-chart.jpeg" alt="Safety vest size chart for sizes small through extra large" width={500} height={667} className="h-full w-full bg-white object-contain" />
          <div className="p-7 md:p-10">
            <p className="text-sm font-bold uppercase tracking-[.18em] text-[#f26a1b]">Sizing</p>
            <h2 className="mt-3 text-3xl font-extrabold">Select the right crew size.</h2>
            <p className="mt-4 leading-7 text-slate-400">Measurements shown are approximate and may vary by about 2 cm. Length: S 66 cm; M, L, and XL 67 cm. Width: S 57 cm, M 60 cm, L 62 cm, XL 63 cm.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
