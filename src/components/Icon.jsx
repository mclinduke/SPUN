// Inline SVG icons — no icon dependency, all themeable via currentColor.
const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  coverflow: <><rect x="9" y="6" width="6" height="12" rx="1" /><path d="M5 8v8M19 8v8" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  sort: <><path d="M3 6h12M3 12h9M3 18h6M17 5v14M17 19l3-3M17 19l-3-3" /></>,
  filter: <><path d="M3 5h18l-7 8v6l-4 2v-8z" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></>,
  camera: <><path d="M4 7h3l2-2h6l2 2h3v12H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></>,
  upload: <><path d="M12 20V9M7 14l5-5 5 5M5 4h14" /></>,
  stats: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  chevronLeft: <><path d="M15 6l-6 6 6 6" /></>,
  chevronRight: <><path d="M9 6l6 6-6 6" /></>,
  disc: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></>,
  check: <><path d="M4 12l5 5L20 6" /></>,
  dice: <><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" /></>,
  play: <><path d="M7 5v14l11-7z" fill="currentColor" stroke="none" /></>,
  headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="13.5" width="4.5" height="6.5" rx="1.6" /><rect x="16.5" y="13.5" width="4.5" height="6.5" rx="1.6" /></>,
  heart: <><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></>,
  tag: <><path d="M4 4h7l9 9-7 7-9-9z" /><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" /></>,
  sparkle: <><path d="M12 3l2.2 6.3 6.3 2.2-6.3 2.2L12 20l-2.2-6.3L3.5 11.5l6.3-2.2z" /></>,
  flame: <><path d="M12 3c1.2 3.6 5 5 5 9a5 5 0 0 1-10 0c0-2 .8-3.2 2-4.2.2 1.2 1 2.2 2 2.2.2-3 0-5 1-7z" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M15.8 5.2a3.2 3.2 0 0 1 0 6M17 15.1a5.5 5.5 0 0 1 3.5 4.9" /></>,
}

export default function Icon({ name, size = 22, className = '' }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
