import DominicMascotImage from "@/components/dominic/DominicMascotImage";

export default function DominicHomePresentingMascot() {
  return (
    <div
      data-dominic-home-mascot="canonical"
      className="relative h-[420px] w-full lg:h-[455px]"
    >
      <DominicMascotImage
        priority
        sizes="(max-width: 980px) 100vw, 560px"
        className="object-contain object-bottom drop-shadow-[0_24px_55px_rgba(0,0,0,.68)]"
      />
    </div>
  );
}
