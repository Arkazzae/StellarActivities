/** Shared vocabulary of the game: roles, pillars, events. Event files import from here. */

export type RoleId = "king" | "faith" | "people" | "army" | "treasury";
export type AdvisorRole = Exclude<RoleId, "king">;
export type StatId = AdvisorRole | "stability";
export type ChoiceSide = "left" | "right";

export const ROLES: readonly RoleId[] = ["king", "treasury", "army", "faith", "people"];
export const ADVISORS: readonly AdvisorRole[] = ["treasury", "army", "faith", "people"];
export const STATS: readonly StatId[] = ["faith", "people", "army", "treasury", "stability"];

export const EVENT_CATEGORIES = [
  "faith",
  "people",
  "army",
  "treasury",
  "court",
  "diplomacy",
  "nature",
  "arcane",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type EventIntensity = 1 | 2 | 3;
export type EventTag =
  | "faith"
  | "food"
  | "economy"
  | "war"
  | "security"
  | "law"
  | "occult"
  | "nature"
  | "diplomacy"
  | "court"
  | "labor"
  | "health"
  | "knowledge"
  | "succession"
  | "crime";

export type Stats = Record<StatId, number>;

export type Choice = {
  label: string;
  effects: Stats;
  consequence: string;
  /** Id of the event forced to appear next when this side is chosen. */
  triggers?: string;
};

export type GameEvent = {
  id: string;
  title: string;
  category: EventCategory;
  intensity: EventIntensity;
  tags: readonly EventTag[];
  artKey: string;
  petitioner: string;
  portraitRole: AdvisorRole;
  text: string;
  left: Choice;
  right: Choice;
  /** Alternate intro shown only when this event is forced in as a follow-up. */
  chainText?: string;
  /** Set on omen-only events. */
  omen?: string;
};

export const ROLE_META: Record<RoleId, { name: string; title: string; asset: string; stat?: StatId; caption: string; detail: string }> = {
  king: {
    name: "Król",
    title: "Niesprawdzony Władca",
    asset: "assets/king.webp",
    caption: "Utrzymaj tron przez trzy lata.",
    detail: "Każdy doradca widzi inną stronę sprawy. Wysłuchaj Rady, zanim przyłożysz pieczęć.",
  },
  treasury: {
    name: "Skarbnik",
    title: "Strażnik Miar",
    asset: "assets/treasurer.webp",
    stat: "treasury",
    caption: "Trzymasz klucze do skarbca.",
    detail: "Zanim Król przyłoży pieczęć, powiedz mu, ile będzie kosztować jego słowo.",
  },
  army: {
    name: "Generał",
    title: "Czerwony Sztandar",
    asset: "assets/general.webp",
    stat: "army",
    caption: "Dowodzisz królewską armią.",
    detail: "Doradź Królowi, mając w pamięci żołd, zapasy i ludzi na murach.",
  },
  faith: {
    name: "Biskup",
    title: "Strażnik Popiołu",
    asset: "assets/bishop.webp",
    stat: "faith",
    caption: "Przemawiasz w imieniu wiernych.",
    detail: "Doradź Królowi, zanim o jego dekrecie zaczną mówić z ambon.",
  },
  people: {
    name: "Trybun",
    title: "Głos z Dołu",
    asset: "assets/tribune.webp",
    stat: "people",
    caption: "Przynosisz na dwór głos ulicy.",
    detail: "Powiedz Królowi, który dekret lud przyjmie, a po którym wyjdzie na plac.",
  },
};

export const STAT_META: Record<StatId, { label: string; short: string; icon: string; color: string }> = {
  faith: { label: "Wiara", short: "Wiara", icon: "assets/court/icon-faith.webp", color: "#b383c9" },
  people: { label: "Lud", short: "Lud", icon: "assets/court/icon-people.webp", color: "#73b86c" },
  army: { label: "Armia", short: "Armia", icon: "assets/court/icon-army.webp", color: "#e0634f" },
  treasury: { label: "Skarbiec", short: "Złoto", icon: "assets/court/icon-treasury.webp", color: "#d4a446" },
  stability: { label: "Stabilność", short: "Ład", icon: "assets/court/icon-stability.webp", color: "#d8d1bb" },
};

export const CATEGORY_META: Record<EventCategory, { label: string; icon: string }> = {
  faith: { label: "Wiara", icon: "assets/icons/event-faith.webp" },
  people: { label: "Lud", icon: "assets/icons/event-people.webp" },
  army: { label: "Armia", icon: "assets/icons/event-army.webp" },
  treasury: { label: "Skarbiec", icon: "assets/icons/event-treasury.webp" },
  court: { label: "Dwór", icon: "assets/icons/event-court.webp" },
  diplomacy: { label: "Dyplomacja", icon: "assets/icons/event-diplomacy.webp" },
  nature: { label: "Natura", icon: "assets/icons/event-nature.webp" },
  arcane: { label: "Tajemnica", icon: "assets/icons/event-arcane.webp" },
};

// ── Poselstwa ──

export type DiplomaticChannelId = "pirates" | "free_ports" | "amber_guilds";
export const CHANNELS: readonly DiplomaticChannelId[] = ["pirates", "free_ports", "amber_guilds"];

export type DiplomaticEventChoice = {
  id: string;
  label: string;
  description: string;
  effects: Partial<Stats>;
  relationDelta: number;
};

export type PublicDiplomaticEvent = {
  id: string;
  channelId: DiplomaticChannelId;
  title: string;
  message: string;
  art: string;
  liaisonRole: AdvisorRole;
  intensity: EventIntensity;
  choices: DiplomaticEventChoice[];
};

export type DiplomaticChannelState = {
  id: DiplomaticChannelId;
  relation: number;
  lastActionTurn: number | null;
};
