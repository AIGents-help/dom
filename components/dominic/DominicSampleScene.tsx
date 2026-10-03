import Image from "next/image";

export default function DominicSampleScene({ position, showFindings = false, selectedAsset = 0 }: {
  position?: { x: number; y: number };
  showFindings?: boolean;
  selectedAsset?: number;
}) {
  const assets = [{ name: "Tank 17", x: 150, y: 140 }, { name: "Transfer line", x: 280, y: 90 }, { name: "B-07", x: 400, y: 180 }];
  return <figure style={{ margin: 0 }}>
    <div style={{ position: "relative", aspectRatio: "3/2", overflow: "hidden", borderRadius: 8 }}>
      <Image src="/images/dominic-demo/refinery-aerial-v1.webp" alt="Photorealistic generated sample aerial image of a refinery tank, transfer pipes and industrial building"
        width={1536} height={1024} sizes="(max-width: 980px) 100vw, 800px" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
      <svg viewBox="0 0 500 333" aria-label="Sample inspection overlays" role="img" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {position ? <>
          <path d="M90 220L150 140L280 110L400 180L90 220" fill="none" stroke="#FF7A36" strokeWidth="2" strokeDasharray="6 5" />
          <circle cx={position.x} cy={position.y} r="7" fill="#F45A1E" stroke="white" strokeWidth="2" />
        </> : null}
        {showFindings ? assets.map((asset, index) => <g key={asset.name}>
          <circle cx={asset.x} cy={asset.y} r="7" fill={index === selectedAsset ? "#F45A1E" : "#E7B45A"} stroke="white" strokeWidth="2" />
          <rect x={asset.x - 48} y={asset.y - 33} width="96" height="20" rx="4" fill="rgba(8,13,18,.9)" />
          <text x={asset.x} y={asset.y - 19} textAnchor="middle" fill="white" fontSize="10">{asset.name}</text>
        </g>) : null}
      </svg>
    </div>
    <figcaption style={{ color: "#9BAAB8", fontSize: 11, marginTop: 7 }}>AI-generated sample imagery · fictional site · not live inspection evidence</figcaption>
  </figure>;
}
