import Image from "next/image";

export const DOMINIC_MASCOT_SRC = "/brand/dominic-mascot.webp";

export default function DominicMascotImage({
  className = "",
  priority = false,
  sizes = "(max-width: 980px) 100vw, 520px",
}: {
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <Image
      src={DOMINIC_MASCOT_SRC}
      alt="DOMINIC — Drone Operation Management mascot"
      fill
      priority={priority}
      sizes={sizes}
      className={`object-contain ${className}`}
    />
  );
}
