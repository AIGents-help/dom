import Image from "next/image";

export default function DominicBrandLockup({
  size = "md",
  showTagline = true,
  compact = false,
}: {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  compact?: boolean;
}) {
  const icon = size === "lg" ? 86 : size === "sm" ? 42 : 58;
  const word = size === "lg" ? 48 : size === "sm" ? 24 : 32;
  const sub = size === "lg" ? 11 : size === "sm" ? 8 : 9;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 12 }}>
      <Image
        src="/brand/dom-propeller-3fin.png"
        alt="DOMINIC brand icon"
        width={icon}
        height={icon}
        priority={size === "lg"}
        style={{ flexShrink: 0 }}
      />
      <div>
        <div
          aria-label="DOMINIC"
          style={{
            display: "flex",
            alignItems: "baseline",
            fontFamily: "Saira, Inter, sans-serif",
            fontSize: word,
            fontWeight: 900,
            letterSpacing: ".025em",
            lineHeight: .9,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "#FFFFFF" }}>DOM</span>
          <span style={{ color: "#F45A1E" }}>INIC</span>
        </div>
        {showTagline ? (
          <div
            style={{
              marginTop: size === "lg" ? 8 : 5,
              color: "#AEB7C4",
              fontSize: sub,
              fontWeight: 800,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Intelligent Mapping by DOM
          </div>
        ) : null}
      </div>
    </div>
  );
}
