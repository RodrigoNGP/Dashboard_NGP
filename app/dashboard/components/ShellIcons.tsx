// ─── Dashboard Shell Icons ────────────────────────────────────────────────────
// Ícones SVG inline extraídos de page.tsx para reduzir o arquivo principal.

import React from 'react'

const ShellIcon = ({ children }: { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    width={16}
    height={16}
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const shellIcons = {
  overview: (
    <ShellIcon>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </ShellIcon>
  ),
  clients: (
    <ShellIcon>
      <path d="M17 21v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" />
      <circle cx="10" cy="8" r="3" />
      <path d="M20 21v-1a3 3 0 0 0-2-2.82" />
      <path d="M16 5.5a3 3 0 0 1 0 5" />
    </ShellIcon>
  ),
  compare: (
    <ShellIcon>
      <path d="M7 7h10" />
      <path d="m13 3 4 4-4 4" />
      <path d="M17 17H7" />
      <path d="m11 21-4-4 4-4" />
    </ShellIcon>
  ),
  ads: (
    <ShellIcon>
      <path d="M3 11.5V8.5a2 2 0 0 1 2-2h3.5L16 4v16l-7.5-2.5H5a2 2 0 0 1-2-2v-3" />
      <path d="M19 9a4.5 4.5 0 0 1 0 6" />
    </ShellIcon>
  ),
  social: (
    <ShellIcon>
      <path d="M20 11a8 8 0 1 1-3.1-6.3" />
      <path d="M20 4v6h-6" />
      <path d="M8 14c1.1-1.7 3-2.7 4-2.7s2.9 1 4 2.7" />
      <circle cx="12" cy="8" r="1.5" />
    </ShellIcon>
  ),
  seo: (
    <ShellIcon>
      <path d="M4 18 10 12l4 4 6-8" />
      <path d="M18 8h2v2" />
    </ShellIcon>
  ),
  commerce: (
    <ShellIcon>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h9.8a1 1 0 0 0 1-.8L21 7H7" />
    </ShellIcon>
  ),
  summary: (
    <ShellIcon>
      <path d="M4 19h16" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-3" />
      <circle cx="7" cy="9" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="17" cy="13" r="1.25" fill="currentColor" stroke="none" />
    </ShellIcon>
  ),
  platforms: (
    <ShellIcon>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 18v2" />
    </ShellIcon>
  ),
  campaigns: (
    <ShellIcon>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
    </ShellIcon>
  ),
  charts: (
    <ShellIcon>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m8 13 3-3 3 2 4-5" />
    </ShellIcon>
  ),
  reports: (
    <ShellIcon>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </ShellIcon>
  ),
  alerts: (
    <ShellIcon>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </ShellIcon>
  ),
  budget: (
    <ShellIcon>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M15 12h.01" />
      <path d="M3 10h18" />
    </ShellIcon>
  ),
  activity: (
    <ShellIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </ShellIcon>
  ),
  back: (
    <ShellIcon>
      <path d="M15 18 9 12l6-6" />
    </ShellIcon>
  ),
}
