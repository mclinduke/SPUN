// SPUN "Groove" mark — concentric record grooves with a bright lead-in arc.
// Transparent; uses currentColor so it picks up the brand accent wherever placed.
export default function Logo({ size = 28, className = '' }) {
  return (
    <svg className={`logo ${className}`} width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="4" opacity="0.3" />
      <circle cx="50" cy="50" r="35" stroke="currentColor" strokeWidth="4" opacity="0.5" />
      <circle cx="50" cy="50" r="24" stroke="currentColor" strokeWidth="4" opacity="0.75" />
      <path d="M50 4 A46 46 0 0 1 96 50" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <circle cx="50" cy="50" r="11" stroke="currentColor" strokeWidth="4" opacity="0.9" />
    </svg>
  )
}
