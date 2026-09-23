export default function DominicMark({ size = 58 }: { size?: number }) {
  const orange = "#FF8600";

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      style={{ display: "block", flexShrink: 0 }}
    >
      <g fill="none" stroke={orange} strokeWidth="15" strokeLinecap="butt">
        <path d="M128 15 A113 113 0 0 1 241 128" />
        <path d="M241 128 A113 113 0 0 1 128 241" />
        <path d="M128 241 A113 113 0 0 1 15 128" />
        <path d="M15 128 A113 113 0 0 1 128 15" />
      </g>
      <circle cx="128" cy="128" r="88" fill="none" stroke={orange} strokeWidth="16" />
      <g fill={orange}>
        <path d="M111 105C93 105 70 94 63 73c-4-12-1-24 4-33 28 4 54 20 66 43 6 11 5 20 2 26-8-3-16-4-24-4Z" />
        <path d="M148 113c10-15 31-29 53-24 13 3 22 11 28 20-17 23-43 39-69 40-13 0-21-4-26-8 6-7 11-17 14-28Z" />
        <path d="M136 151c8 17 9 42-7 58-9 10-21 14-32 14-11-26-10-57 3-80 7-12 15-17 22-19 2 10 7 19 14 27Z" />
        <circle cx="128" cy="128" r="29" />
      </g>
      <circle cx="128" cy="128" r="27" fill="#10161D" />
    </svg>
  );
}
