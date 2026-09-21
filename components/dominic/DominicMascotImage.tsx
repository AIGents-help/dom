import Image from "next/image";

export const DOMINIC_MASCOT_SRC = "/brand/dominic-reference.webp?v=20260921";

export default function DominicMascotImage({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src={DOMINIC_MASCOT_SRC}
      alt="DOMINIC mapping software mascot"
      fill
      priority={priority}
      sizes="(max-width: 1024px) 100vw, 360px"
      className={className}
    />
  );
}
