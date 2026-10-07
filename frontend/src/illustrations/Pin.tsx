// "Your spot": the hero of the home page story. The tip of the pin is at
// (0, 0), so placing it means moving that point to the spot.
export function PinMark({ scale = 1 }: { scale?: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <ellipse cx="0" cy="0" rx="7" ry="2.6" fill="rgb(20 32 58 / 22%)" />
      <path d="M0 0C-5-9-13-15-13-25a13 13 0 1 1 26 0C13-15 5-9 0 0Z" fill="var(--ink)" />
      <circle cx="0" cy="-25" r="5.5" fill="var(--accent)" />
      <circle cx="-2" cy="-27" r="1.6" fill="rgb(255 255 255 / 70%)" />
    </g>
  )
}

// The same pin as a standalone icon, for HTML (the search bar it lands in).
export function Pin({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="-15 -40 30 42" width={size} height={(size * 42) / 30} className={className} aria-hidden="true">
      <PinMark />
    </svg>
  )
}
