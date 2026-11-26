/**
 * Hand-made 20×20 stroke icons. Each value is the inner SVG markup; `icon()`
 * wraps it so every icon shares stroke settings and inherits currentColor.
 */
const paths = {
  select: '<path d="M4.6 3.2 15.4 8.7l-4.7 1.6-2.2 4.7Z"/>',
  hand: '<path d="M7.2 10.2V5.4a1.25 1.25 0 0 1 2.5 0V9.6M9.7 9.2V4.2a1.25 1.25 0 0 1 2.5 0v5M12.2 9.4V5.6a1.25 1.25 0 0 1 2.5 0v5.8c0 3.3-2.3 5.6-5.4 5.6-2.1 0-3.5-1-4.7-3L2.9 11a1.25 1.25 0 0 1 2.1-1.4l2.2 2.6"/>',
  rectangle: '<rect x="3.2" y="5" width="13.6" height="10" rx="2.2"/>',
  diamond: '<path d="M10 2.9 17.1 10 10 17.1 2.9 10Z"/>',
  ellipse: '<ellipse cx="10" cy="10" rx="7.1" ry="5.9"/>',
  arrow: '<path d="M4 16 15.6 4.4M8.6 4.1h7.3v7.3"/>',
  line: '<path d="M4 16 16 4"/>',
  freedraw: '<path d="M3 14.6c1.8-3.4 3.4-6.6 5.2-5.6 1.7 1-.9 4.4.9 5 1.9.6 3.3-6.2 5.5-7.2 1-.4 1.9.3 2.4 1.1"/>',
  text: '<path d="M4.8 5.2h10.4M10 5.2V16M7.6 16h4.8"/>',
  image:
    '<rect x="3" y="4.4" width="14" height="11.2" rx="2"/><path d="m3.6 13.4 3.7-3.6 2.9 2.7 2.2-2.1 4 3.8"/><circle cx="13" cy="7.9" r="1.2"/>',
  eraser:
    '<path d="M8.6 16.2h7.6M4.2 11.9l7-7a1.6 1.6 0 0 1 2.3 0l2.4 2.4a1.6 1.6 0 0 1 0 2.3l-5.6 5.6a2 2 0 0 1-2.8 0Z"/><path d="m7.9 8.2 4.6 4.6"/>',
  laser:
    '<path d="m3.4 16.6 6.4-6.4"/><circle cx="12.2" cy="7.8" r="2.1"/><path d="M12.2 2.7v1.4M17.3 7.8h-1.4M15.8 4.2l-1 1M15.8 11.4l-1-1M8.6 4.2l1 1"/>',
  lock: '<rect x="4.8" y="8.8" width="10.4" height="7.8" rx="1.8"/><path d="M7 8.8V6.6a3 3 0 0 1 6 0v2.2"/>',
  unlock: '<rect x="4.8" y="8.8" width="10.4" height="7.8" rx="1.8"/><path d="M7 8.8V6.6a3 3 0 0 1 5.8-1.1"/>',
  menu: '<path d="M3.6 6h12.8M3.6 10h12.8M3.6 14h8.4"/>',
  undo: '<path d="M7.2 4.6 3.7 8.1l3.5 3.5"/><path d="M4.2 8.1h7.9a4.3 4.3 0 0 1 0 8.6H9.6"/>',
  redo: '<path d="m12.8 4.6 3.5 3.5-3.5 3.5"/><path d="M15.8 8.1H7.9a4.3 4.3 0 0 0 0 8.6h2.5"/>',
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  minus: '<path d="M4.5 10h11"/>',
  fit: '<path d="M3.8 7.4V4.6c0-.4.4-.8.8-.8h2.8M12.6 3.8h2.8c.4 0 .8.4.8.8v2.8M16.2 12.6v2.8c0 .4-.4.8-.8.8h-2.8M7.4 16.2H4.6c-.4 0-.8-.4-.8-.8v-2.8"/><rect x="7" y="7.4" width="6" height="5.2" rx="1"/>',
  trash:
    '<path d="M4 6h12M8 6V4.4h4V6M5.6 6l.8 9.6a1.5 1.5 0 0 0 1.5 1.4h4.2a1.5 1.5 0 0 0 1.5-1.4L14.4 6M8.6 9v5M11.4 9v5"/>',
  duplicate:
    '<rect x="7" y="7" width="9.6" height="9.6" rx="1.8"/><path d="M13 4.6v-.2c0-.5-.4-1-1-1H4.4c-.5 0-1 .5-1 1V12c0 .6.5 1 1 1h.2"/>',
  group:
    '<rect x="2.8" y="2.8" width="14.4" height="14.4" rx="2" stroke-dasharray="2.2 2.4"/><rect x="5.6" y="5.6" width="4.6" height="4.6" rx="1"/><rect x="9.8" y="9.8" width="4.6" height="4.6" rx="1"/>',
  ungroup:
    '<rect x="3.6" y="3.6" width="6" height="6" rx="1.2"/><rect x="10.4" y="10.4" width="6" height="6" rx="1.2"/><path d="M12.6 4.2h2.2c.6 0 1 .4 1 1v2.2M4.2 12.6v2.2c0 .6.4 1 1 1h2.2" stroke-dasharray="1.6 1.8"/>',
  front:
    '<rect x="7" y="7" width="9.4" height="9.4" rx="1.6" fill="currentColor" fill-opacity=".22"/><path d="M4.4 12.4h-.4c-.5 0-1-.4-1-1V4c0-.5.5-1 1-1h7.4c.6 0 1 .5 1 1v.4"/>',
  back: '<rect x="3.6" y="3.6" width="9.4" height="9.4" rx="1.6" fill="currentColor" fill-opacity=".22"/><path d="M15.6 7.6h.4c.5 0 1 .4 1 1V16c0 .5-.5 1-1 1H8.6c-.6 0-1-.5-1-1v-.4"/>',
  forward: '<path d="M10 15.6V5.4M6 9.2l4-4 4 4M5.2 16.6h9.6"/>',
  backward: '<path d="M10 4.4v10.2M6 10.8l4 4 4-4M5.2 3.4h9.6"/>',
  alignLeft: '<path d="M3.6 3v14M6.4 6.6h9.6M6.4 13.4h6"/>',
  alignHCenter: '<path d="M10 3v14M4.6 6.6h10.8M6.8 13.4h6.4"/>',
  alignRight: '<path d="M16.4 3v14M4 6.6h9.6M7.6 13.4h6"/>',
  alignTop: '<path d="M3 3.6h14M6.6 6.4v9.6M13.4 6.4v6"/>',
  alignVCenter: '<path d="M3 10h14M6.6 4.6v10.8M13.4 6.8v6.4"/>',
  alignBottom: '<path d="M3 16.4h14M6.6 4v9.6M13.4 7.6v6"/>',
  distributeX: '<path d="M3.4 3v14M16.6 3v14"/><rect x="7.6" y="6.4" width="4.8" height="7.2" rx="1"/>',
  distributeY: '<path d="M3 3.4h14M3 16.6h14"/><rect x="6.4" y="7.6" width="7.2" height="4.8" rx="1"/>',
  sun: '<circle cx="10" cy="10" r="3.2"/><path d="M10 2.6v1.6M10 15.8v1.6M17.4 10h-1.6M4.2 10H2.6M15.2 4.8l-1.1 1.1M5.9 14.1l-1.1 1.1M15.2 15.2l-1.1-1.1M5.9 5.9 4.8 4.8"/>',
  moon: '<path d="M15.9 12.4A6.6 6.6 0 0 1 7.6 4.1a6.6 6.6 0 1 0 8.3 8.3Z"/>',
  grid: '<path d="M3.4 7.2h13.2M3.4 12.8h13.2M7.2 3.4v13.2M12.8 3.4v13.2"/>',
  download: '<path d="M10 3.4v9.4M6.2 9.2l3.8 3.8 3.8-3.8M4 16.4h12"/>',
  upload: '<path d="M10 13V3.6M6.2 7.4 10 3.6l3.8 3.8M4 16.4h12"/>',
  save: '<path d="M4 3.4h9.6l2.4 2.4V15.6c0 .5-.4 1-1 1H4.9c-.5 0-.9-.5-.9-1V3.4Z"/><path d="M6.6 3.6v3.6h5.6V3.6M6.4 16.4v-4.6h7.2v4.6"/>',
  help: '<circle cx="10" cy="10" r="7.2"/><path d="M7.8 7.8a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 1.9-2.2 3.4"/><circle cx="10" cy="14.4" r=".5" fill="currentColor"/>',
  close: '<path d="m5 5 10 10M15 5 5 15"/>',
  check: '<path d="m4.4 10.4 3.6 3.6 7.6-8"/>',
  palette:
    '<path d="M10 3a7 7 0 1 0 0 14c1 0 1.6-.7 1.6-1.5 0-1.2-1-1.4-1-2.4 0-.9.7-1.5 1.6-1.5h1.8A3.1 3.1 0 0 0 17 8.5C17 5.4 13.9 3 10 3Z"/><circle cx="6.6" cy="9.4" r=".9" fill="currentColor"/><circle cx="8.8" cy="6.2" r=".9" fill="currentColor"/><circle cx="12.4" cy="6.4" r=".9" fill="currentColor"/>',
  board:
    '<rect x="3.4" y="3.4" width="13.2" height="13.2" rx="2.4"/><path d="M6.4 12.6c1.4-2.2 2.6-3.4 3.6-2.6s.2 2.4 1.4 2.4 1.8-3 2.8-3.6"/>',
  eye: '<path d="M2.8 10s2.6-5 7.2-5 7.2 5 7.2 5-2.6 5-7.2 5-7.2-5-7.2-5Z"/><circle cx="10" cy="10" r="2.2"/>',
  copy: '<rect x="6.6" y="6.6" width="9.8" height="9.8" rx="1.8"/><path d="M13.4 4.4v-.2c0-.4-.4-.8-.8-.8H4.2c-.4 0-.8.4-.8.8v8.4c0 .4.4.8.8.8h.2"/>',
  cut: '<circle cx="5.6" cy="14.2" r="2.2"/><circle cx="14.4" cy="14.2" r="2.2"/><path d="M7.2 12.6 14.6 3.4M12.8 12.6 5.4 3.4"/>',
  paste:
    '<rect x="4.4" y="4.2" width="11.2" height="13" rx="1.8"/><path d="M7.6 4.2V3.4c0-.4.4-.8.8-.8h3.2c.4 0 .8.4.8.8v.8M7.4 9.4h5.2M7.4 12.6h3.4"/>',
  selectAll:
    '<rect x="3.4" y="3.4" width="13.2" height="13.2" rx="2" stroke-dasharray="2.2 2.2"/><path d="m7 10.2 2.2 2.2 4-4.4"/>',
  chevronDown: '<path d="m5.6 8 4.4 4.4L14.4 8"/>',
  users:
    '<circle cx="7.6" cy="7.2" r="2.6"/><path d="M2.8 16c.5-2.6 2.4-4 4.8-4s4.3 1.4 4.8 4"/><path d="M12.6 4.8a2.6 2.6 0 0 1 0 4.8M14.4 12.4c1.5.5 2.5 1.8 2.8 3.6"/>',
};
export const icon = (name, size = 20) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
/** Small preview glyphs for the inspector's segmented controls. */
export const glyph = {
  width: (width) =>
    `<svg class="icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 10h13" stroke="currentColor" stroke-width="${width}" stroke-linecap="round"/></svg>`,
  strokeStyle: (style) => {
    const dash =
      style === "dashed" ? ' stroke-dasharray="4 3"' : style === "dotted" ? ' stroke-dasharray="0.1 3.2"' : "";
    return `<svg class="icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 10h13" stroke="currentColor" stroke-width="2" stroke-linecap="round"${dash}/></svg>`;
  },
  roughness: (level) => {
    const d =
      level === 0
        ? "M3.5 12.5C7 7 13 7 16.5 12.5"
        : level === 1
          ? "M3.5 12.6c2.2-3.6 4.2-5.6 6.6-5.2 2.6.4 4.4 3.4 6.4 5.4M4.4 13c2-3.8 4-5 6-4.6"
          : "M3.4 12.4c1.4-2.8 2.4-5.6 4.6-4.8 1.6.6.4 2.8 2.2 3 2.4.2 2.2-4.4 4.6-3.4 1.2.5 1.6 2.4 1.8 4M5 14c1.2-3.6 3.6-4.2 5-3";
    return `<svg class="icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="${d}"/></svg>`;
  },
  fill: (style) => {
    const inner =
      style === "solid"
        ? '<rect x="4" y="4" width="12" height="12" rx="2.4" fill="currentColor"/>'
        : `<clipPath id="g-${style}"><rect x="4" y="4" width="12" height="12" rx="2.4"/></clipPath><g clip-path="url(#g-${style})" stroke="currentColor" stroke-width="1.2"><path d="M2 10 10 2M2 14 14 2M2 18 18 2M6 18 18 6M10 18l8-8"/>${style === "cross" ? '<path d="M2 10l8 8M2 6l12 12M2 2l16 16M6 2l12 12M10 2l8 8"/>' : ""}</g>`;
    return `<svg class="icon" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">${inner}<rect x="4" y="4" width="12" height="12" rx="2.4" stroke="currentColor" stroke-width="1.6"/></svg>`;
  },
  corner: (rounded) =>
    `<svg class="icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="${rounded ? "M4.5 16V9.5a5 5 0 0 1 5-5H16" : "M4.5 16V4.5H16"}"/></svg>`,
  lineShape: (curved) =>
    `<svg class="icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${curved ? "M3.5 14.5C6 4 10 4 11 9.5s4.5 4 5.5-4" : "M3.5 14.5 8 5.5l4 9 4.5-9"}"/></svg>`,
  arrowhead: (kind, start) => {
    const flip = start ? ' transform="matrix(-1 0 0 1 20 0)"' : "";
    const head =
      kind === "arrow"
        ? '<path d="m12.4 6.2 3.9 3.8-3.9 3.8"/>'
        : kind === "triangle"
          ? '<path d="M12 6.4 16.6 10 12 13.6Z" fill="currentColor"/>'
          : kind === "dot"
            ? '<circle cx="15" cy="10" r="2.2" fill="currentColor"/>'
            : kind === "bar"
              ? '<path d="M16.2 5.8v8.4"/>'
              : "";
    return `<svg class="icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g${flip}><path d="M3.4 10h${kind === "none" ? "13.2" : "12.2"}"/>${head}</g></svg>`;
  },
  align: (align) => {
    const lines =
      align === "left"
        ? "M4 6h12M4 10h7.5M4 14h10"
        : align === "center"
          ? "M4 6h12M6.2 10h7.6M5 14h10"
          : "M4 6h12M8.5 10H16M6 14h10";
    return `<svg class="icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="${lines}"/></svg>`;
  },
};
