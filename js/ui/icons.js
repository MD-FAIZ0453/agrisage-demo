// Authored line icons: 24×24 grid, 1.75 stroke, round caps and joins.
const P = {
  sprout: '<path d="M12 20v-8"/><path d="M12 12c0-3.9-2.9-6.5-7-6.5 0 3.9 2.9 6.5 7 6.5Z"/><path d="M12 14.5c0-3.4 2.6-5.8 6.5-5.8 0 3.4-2.6 5.8-6.5 5.8Z"/><path d="M8 20h8"/>',
  drop: '<path d="M12 3.5c3.2 3.8 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.3-6.2 5.5-10Z"/>',
  sun: '<circle cx="12" cy="12" r="3.75"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  battery: '<rect x="3" y="7.5" width="15.5" height="9" rx="2"/><path d="M21 10.5v3"/><path d="M6 10.5v3M9 10.5v3"/>',
  thermo: '<path d="M10 14.2V5.5a2 2 0 1 1 4 0v8.7a4 4 0 1 1-4 0Z"/><path d="M12 9.5v6"/>',
  rain: '<path d="M7 15.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.6 3.2 3.2 0 0 1-.7 6.4H7Z"/><path d="M8.5 18.5 8 20M12.5 18.5 12 20M16.5 18.5 16 20"/>',
  humidity: '<path d="M8.5 4c2.3 2.7 4 5 4 7.2a4 4 0 0 1-8 0C4.5 9 6.2 6.7 8.5 4Z"/><path d="M16.5 10.5c1.6 1.9 2.8 3.5 2.8 5a2.8 2.8 0 0 1-5.6 0c0-1.5 1.2-3.1 2.8-5Z"/>',
  mic: '<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V20.5"/>',
  send: '<path d="M4.5 12 20 4.5 15.5 20l-3.2-6.3L4.5 12Z"/><path d="m12.3 13.7 7.7-9.2"/>',
  speaker: '<path d="M4.5 9.5h3.2L12 5.5v13l-4.3-4H4.5v-5Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  speakerOff: '<path d="M4.5 9.5h3.2L12 5.5v13l-4.3-4H4.5v-5Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  play: '<path d="M7.5 5.5v13l11-6.5-11-6.5Z"/>',
  pause: '<path d="M8 5.5v13M16 5.5v13"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
  decision: '<path d="M12 3.5v4M12 16.5v4"/><circle cx="12" cy="12" r="4.5"/><path d="M3.5 12h4M16.5 12h4"/>',
  broadcast: '<circle cx="12" cy="12" r="1.75"/><path d="M8.3 15.7a5.2 5.2 0 0 1 0-7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  chip: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
  relay: '<path d="M3.5 15h4.5l7-6"/><path d="M16 15h4.5"/><circle cx="8" cy="15" r="1.25"/><circle cx="16" cy="15" r="1.25"/>',
  pump: '<circle cx="10" cy="13" r="5.5"/><path d="M10 13 13.5 9.5"/><path d="M15.5 13H21M18.5 13v-3.5h2.5"/><path d="M6 18.5 4.5 21M14 18.5l1.5 2.5"/>',
  flow: '<path d="M3.5 9c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2h2"/><path d="M3.5 15c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2h2"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.75"/>',
  alert: '<path d="M10.3 4.6 2.9 17.5a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4.5M12 17.2v.1"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.3 2.6 2.6 5-5.4"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
  power: '<path d="M12 3.5v8"/><path d="M7 6.6a7.5 7.5 0 1 0 10 0"/>',
  pylon: '<path d="M12 3 7 21M12 3l5 18M8.6 15h6.8M9.7 10h4.6M5 7h14M8 21h8"/>',
  link: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M17.5 13.5v4.5a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8A1.5 1.5 0 0 1 6 6.5h4.5"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  leaf: '<path d="M5 19c0-8 5.5-13.5 14-14-0.5 8.5-6 14-14 14Z"/><path d="M5 19 13 11"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
