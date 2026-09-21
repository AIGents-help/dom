export const DOMINIC_MASCOT_SRC = "/brand/dominic-reference.webp?v=20260921-blackhat";

export default function DominicMascotImage({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <img
      src={DOMINIC_MASCOT_SRC}
      alt="DOMINIC mapping software mascot"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      className={`absolute inset-0 h-full w-full ${className}`}
    />
  );
}
