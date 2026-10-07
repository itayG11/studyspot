// A number that rolls in when it changes. The key makes React build a new
// element for each value, which replays the CSS animation.
export function Count({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span key={value} className={`num tick ${className}`}>
      {value}
    </span>
  )
}
