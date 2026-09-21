import Image from "next/image";

export const DOMINIC_MASCOT_SRC = "/brand/dominic-reference.webp?v=20260921-blackhat";

export default function DominicMascotImage({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src={DOMINIC_MASCOT_SRC}
      alt="DOMINIC mapping software mascot"
      fill
      priority={priority}
      sizes="(max-width: 980px) 100vw, 320px"
      className={`object-contain ${className}`}
    />
  );
}
