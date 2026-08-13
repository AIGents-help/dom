type Props = {
  count: 1 | 3 | 4 | 6 | 12 | 24;
  label?: string;
  className?: string;
};

export default function BarrierProductVisual({ count, label, className = "" }: Props) {
  const cols = count <= 4 ? count : count === 6 ? 3 : count === 12 ? 4 : 6;
  const rows = Math.ceil(count / cols);
  const width = 900;
  const height = 560;
  const left = 80;
  const right = 820;
  const top = 125;
  const xGap = cols === 1 ? 0 : (right - left) / (cols - 1);
  const rowGap = rows === 1 ? 0 : rows === 2 ? 185 : rows === 3 ? 125 : 96;
  const postHeight = rows === 1 ? 235 : rows === 2 ? 135 : rows === 3 ? 92 : 66;
  const baseOffset = postHeight + 42;
  const poleWidth = rows === 1 ? 22 : rows === 2 ? 18 : 14;
  const headWidth = rows === 1 ? 48 : rows === 2 ? 40 : 32;
  const headHeight = rows === 1 ? 52 : rows === 2 ? 44 : 36;
  const beltHeight = rows === 1 ? 34 : rows === 2 ? 28 : 22;

  const posts = Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const rowCount = Math.min(cols, count - row * cols);
    const rowLeft = rowCount === cols ? left : (width - xGap * (rowCount - 1)) / 2;
    return { x: rowLeft + col * xGap, y: top + row * rowGap, row };
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? `${count} Drone Operation barrier ${count === 1 ? "post" : "posts"}`} className={className}>
      <defs>
        <linearGradient id={`post-${count}`} x1="0" x2="1">
          <stop offset="0" stopColor="#a63a08" />
          <stop offset="0.24" stopColor="#ea5b12" />
          <stop offset="0.5" stopColor="#ff8a3d" />
          <stop offset="0.72" stopColor="#f26a1b" />
          <stop offset="1" stopColor="#8f2f05" />
        </linearGradient>
        <linearGradient id={`belt-${count}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ff8433" />
          <stop offset="1" stopColor="#ef5b10" />
        </linearGradient>
        <filter id={`shadow-${count}`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#000000" floodOpacity="0.2" />
        </filter>
      </defs>

      <rect width={width} height={height} rx="28" fill="#f7f8fa" />
      <ellipse cx="450" cy="500" rx="360" ry="24" fill="#d9dee5" opacity="0.38" />

      {posts.map((p, i) => {
        const next = posts[i + 1];
        if (!next || next.row !== p.row) return null;
        const beltY = p.y + 10;
        return (
          <g key={`belt-${i}`}>
            <rect x={p.x + headWidth / 2 - 2} y={beltY} width={next.x - p.x - headWidth + 4} height={beltHeight} rx="4" fill={`url(#belt-${count})`} />
            <text x={(p.x + next.x) / 2} y={beltY + beltHeight * 0.72} textAnchor="middle" fill="#111820" fontFamily="Arial, Helvetica, sans-serif" fontSize={rows === 1 ? 20 : rows === 2 ? 14 : 10} fontWeight="900" letterSpacing={rows === 1 ? 2.2 : 1}>DRONE OPERATION</text>
          </g>
        );
      })}

      {posts.map((p, i) => (
        <g key={i} filter={`url(#shadow-${count})`}>
          <ellipse cx={p.x} cy={p.y + baseOffset + 8} rx={rows === 1 ? 46 : rows === 2 ? 34 : 26} ry={rows === 1 ? 14 : 9} fill="#cdd3da" />
          <ellipse cx={p.x} cy={p.y + baseOffset} rx={rows === 1 ? 42 : rows === 2 ? 31 : 23} ry={rows === 1 ? 12 : 8} fill={`url(#post-${count})`} />
          <rect x={p.x - poleWidth / 2} y={p.y + 24} width={poleWidth} height={postHeight} rx={Math.max(5, poleWidth / 2)} fill={`url(#post-${count})`} />
          <rect x={p.x - headWidth / 2} y={p.y - 6} width={headWidth} height={headHeight} rx="8" fill="#20262d" />
          <rect x={p.x - headWidth * 0.31} y={p.y - 1} width={headWidth * 0.62} height={headHeight - 10} rx="6" fill={`url(#post-${count})`} />
          <rect x={p.x + headWidth * 0.29} y={p.y + 5} width={Math.max(6, headWidth * 0.16)} height={headHeight - 22} rx="3" fill="#0f1318" />
        </g>
      ))}

      <g fontFamily="Arial, Helvetica, sans-serif" textAnchor="middle">
        <text x="450" y="58" fill="#172033" fontSize="30" fontWeight="900">{count === 1 ? "SINGLE DRONE OPERATION BARRIER" : `${count}-POST DRONE OPERATION KIT`}</text>
        <text x="450" y="88" fill="#657181" fontSize="18">Exact quantity shown · 6 ft retractable webbing per post</text>
      </g>
    </svg>
  );
}
