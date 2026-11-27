/** Hand-drawn interface icons: colourful for navigation, single-colour for controls. */

type P = { size?: number; className?: string };

export const IconPlay = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 3.5a5 5 0 0 1 3.2 8.85c1.9 1.1 3 2.9 3 4.9 0 .9-.2 1.7-.6 2.4h-11.2c-.4-.7-.6-1.5-.6-2.4 0-2 1.1-3.8 3-4.9A5 5 0 0 1 16 3.5Z" fill="#f2e3cf" />
    <path d="M8.5 21.5h15c.8 0 1.5.7 1.5 1.5v1.2c0 .8-.7 1.5-1.5 1.5h-15c-.8 0-1.5-.7-1.5-1.5V23c0-.8.7-1.5 1.5-1.5Z" fill="#d9c2a3" />
    <path d="M6.5 26h19c.8 0 1.5.7 1.5 1.5v.5c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-.5c0-.8.7-1.5 1.5-1.5Z" fill="#b99b75" />
    <path d="M3 13.5c2.4-1.5 5-1.7 6.8-.6-.5 2.3-2.3 4.1-5.1 4.8" fill="none" stroke="#e2b85f" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** Two people at one board: the voice channel's game. */
export const IconPeople = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="11" cy="10" r="4.6" fill="#9fc7f0" />
    <path d="M2.8 25.5c.6-4.9 4-7.9 8.2-7.9s7.6 3 8.2 7.9c.1.8-.5 1.5-1.3 1.5H4.1c-.8 0-1.4-.7-1.3-1.5Z" fill="#6aa3dc" />
    <circle cx="22" cy="11.5" r="4" fill="#f2c27a" />
    <path d="M17.6 19.6c1.2-1.1 2.7-1.7 4.4-1.7 3.7 0 6.6 2.6 7.1 6.8.1.7-.5 1.3-1.1 1.3h-7.2c-.4-2.7-1.5-4.8-3.2-6.4Z" fill="#dc9d4a" />
  </svg>
);

/** The menu: a house. */
export const IconHome = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 4.5 3.5 15.2c-.6.5-.2 1.5.6 1.5H7V27c0 .6.4 1 1 1h16c.6 0 1-.4 1-1V16.7h2.9c.8 0 1.2-1 .6-1.5L16 4.5Z" fill="#81b64c" />
    <path d="M13 28v-7c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v7" fill="#4e7a2a" />
  </svg>
);

export const IconHandshake = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m11 17 2 2a1 1 0 0 0 1.4 0l4.6-4.6a2 2 0 0 0 0-2.8L15 7.6" />
    <path d="m14 14-2.5-2.5a1.4 1.4 0 0 0-2 0l-.6.6a1.4 1.4 0 0 1-2 0 1.4 1.4 0 0 1 0-2L10.7 6.3a2.8 2.8 0 0 1 3.4-.4l.9.6" />
    <path d="M2 12.5 5.5 9M22 12.5 18.5 9M5 16l2 2" />
  </svg>
);

export const IconFlag = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M5 2.5a1 1 0 0 1 1 1V4h11.2c.8 0 1.2.9.7 1.5L15 9l2.9 3.5c.5.6.1 1.5-.7 1.5H6v7.5a1 1 0 1 1-2 0v-18a1 1 0 0 1 1-1Z" />
  </svg>
);

export const IconUndo = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M9.6 4.3a1 1 0 0 1 0 1.4L7.3 8H14a7 7 0 0 1 0 14h-3a1 1 0 1 1 0-2h3a5 5 0 0 0 0-10H7.3l2.3 2.3a1 1 0 1 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 0Z" transform="translate(0 -1)" />
  </svg>
);

export const IconBulb = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 5a6 6 0 0 0-3.6 10.8c.6.5 1 1.1 1 1.8V18h5.2v-.4c0-.7.4-1.3 1-1.8A6 6 0 0 0 12 5Zm-2.6 14.5h5.2v.7c0 1-.8 1.8-1.8 1.8h-1.6c-1 0-1.8-.8-1.8-1.8Z" />
    <path d="M12 1v1.6M4.2 4.2l1.1 1.1M19.8 4.2l-1.1 1.1M1.5 11.5h1.6M20.9 11.5h1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const IconDownload = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v11m0 0 4-4m-4 4-4-4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);

export const IconGear = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.8c.1.6.1 1.3 0 1.9l2 1.8-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9L3.9 13l2-1.8a6 6 0 0 1 0-1.9l-2-1.8 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9ZM12 8.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4Z" transform="translate(0 1)" />
  </svg>
);

export const IconFlip = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 3v15m0 0-3.5-3.5M7 18l3.5-3.5M17 21V6m0 0-3.5 3.5M17 6l3.5 3.5" />
  </svg>
);

export const IconChevron = ({ size = 18, dir = "left" }: P & { dir?: "left" | "right" | "first" | "last" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    {dir === "left" && <path d="m15 5-7 7 7 7" />}
    {dir === "right" && <path d="m9 5 7 7-7 7" />}
    {dir === "first" && <path d="M6 5v14m12-14-7 7 7 7" />}
    {dir === "last" && <path d="M18 5v14M6 5l7 7-7 7" />}
  </svg>
);

export const IconExpand = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </svg>
);

/** Brand wordmark; collapses to "AC" in the narrow sidebar. */
export const Logo = () => (
  <span className="logo">
    <span className="logo__word">Arcade<b>Chess</b></span>
    <span className="logo__short" aria-hidden="true">A<b>C</b></span>
  </span>
);
