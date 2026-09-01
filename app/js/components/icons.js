const wrap = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const icons = {
  home: wrap('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
  chart: wrap('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'),
  book: wrap('<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 17.5h16"/>'),
  gear: wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.5H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.7 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 16.5 5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.5z"/>'),
  close: wrap('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  back: wrap('<path d="m15 18-6-6 6-6"/>'),
  chev: wrap('<path d="m9 18 6-6-6-6"/>'),
  flame: wrap('<path d="M12 2s5 4.5 5 9a5 5 0 0 1-10 0c0-1.5.5-2.5.5-2.5S6 10 6 13a6 6 0 0 0 12 0c0-5-6-11-6-11z"/>'),
  check: wrap('<path d="M20 6 9 17l-5-5"/>'),
  x: wrap('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  bolt: wrap('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  target: wrap('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>'),
  clock: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  refresh: wrap('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>'),
};
