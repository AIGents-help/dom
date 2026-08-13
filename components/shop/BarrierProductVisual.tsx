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
  const top = 120;
  const bottom = 430;
  const xGap = cols === 1 ? 0 : (right - left) / (cols - 1);
  const yGap = rows === 1 ? 0 : (bottom - top) / (rows - 1);

  const posts = Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const rowCount = Math.min(cols, count - row * cols);
    const rowLeft = rowCount === cols ? left : (width - xGap * (rowCount - 1)) / 2;
    return {
      x: rowLeft + col * xGap,
      y: top + row * yGap,
      row,
      col,
      rowCount,
    };
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
          <feDropShadow dx="0" dy="7" stdDeviation="8" floodColor="#000000" floodOpacity="0.22" />
        </filter>
      </defs>

      <rect width={width} height={height} rx="28" fill="#f7f8fa" />
      <ellipse cx="450" cy="474" rx="360" ry="30" fill="#d9dee5" opacity="0.48" />

      {posts.map((p, i) => {
        const next = posts[i + 1];
        const sameRow = next && next.row === p.row;
        if (!sameRow) return null;
        const beltY = p.y + 12;
        return (
          <g key={`belt-${i}`}>
            <rect x={p.x + 18} y={beltY} width={next.x - p.x - 36} height="34" rx="4" fill={`url(#belt-${count})`} />
            <text x={(p.x + next.x) / 2} y={beltY + 23} textAnchor="middle" fill="#111820" fontFamily="Arial, Helvetica, sans-serif" fontSize={count >= 12 ? 12 : count >= 6 ? 16 : 20} fontWeight="900" letterSpacing={count >= 12 ? 1.2 : 2.2}>DRONE OPERATION</text>
          </g>
        );
      })}

      {posts.map((p, i) => (
        <g key={i} filter={`url(#shadow-${count})`}>
          <ellipse cx={p.x} cy={p.y + 278} rx={count >= 12 ? 34 : 46} ry={count >= 12 ? 10 : 14} fill="#cdd3da" />
          <ellipse cx={p.x} cy={p.y + 266} rx={count >= 12 ? 31 : 42} ry={count >= 12 ? 9 : 12} fill={`url(#post-${count})`} />
          <rect x={p.x - (count >= 12 ? 8 : 11)} y={p.y + 28} width={count >= 12 ? 16 : 22} height="242" rx="8" fill={`url(#post-${count})`} />
          <rect x={p.x - (count >= 12 ? 18 : 24)} y={p.y - 8} width={count >= 12 ? 36 : 48} height="52" rx="8" fill="#20262d" />
          <rect x={p.x - (count >= 12 ? 11 : 15)} y={p.y - 3} width={count >= 12 ? 22 : 30} height="42" rx="6" fill={`url(#post-${count})`} />
          <rect x={p.x + (count >= 12 ? 11 : 15)} y={p.y + 4} width={count >= 12 ? 8 : 10} height="28" rx="3" fill="#0f1318" />
        </g>
      ))}

      <g fontFamily="Arial, Helvetica, sans-serif" textAnchor="middle">
        <text x="450" y="62" fill="#172033" fontSize="30" fontWeight="900">{count === 1 ? "SINGLE DRONE OPERATION BARRIER" : `${count}-POST DRONE OPERATION KIT`}</text>
        <text x="450" y="93" fill="#657181" fontSize="18">Exact quantity shown · 6 ft retractable webbing per post</text>
      </g>
    </svg>
  );
}
