import type {
  DiplomaticChannelId,
  DiplomaticChannelState,
} from "./types";

export type DiplomaticChannelMeta = {
  id: DiplomaticChannelId;
  name: string;
  shortName: string;
  contact: string;
  title: string;
  portrait: string;
  emblem: string;
  openingMessage: string;
  accent: string;
};

export const DIPLOMATIC_CHANNELS: readonly DiplomaticChannelMeta[] = [
  {
    id: "pirates",
    name: "Bractwo Czarnej Fali",
    shortName: "Czarna Fala",
    contact: "Kapitan Mira Czarna Sól",
    title: "Głos okrętów bez bandery",
    portrait: "assets/channels/pirates-portrait.webp",
    emblem: "assets/channels/pirates-emblem.webp",
    openingMessage:
      "Trzy nasze okręty stoją przy Cieśninie Popiołu. Mogą pilnować waszych kupców albo liczyć ich ładunek. Czekamy na pieczęć Korony.",
    accent: "pirates",
  },
  {
    id: "free_ports",
    name: "Liga Wolnych Portów",
    shortName: "Wolne Porty",
    contact: "Namiestnik Odo Veyr",
    title: "Pierwszy głos siedmiu nabrzeży",
    portrait: "assets/channels/free-ports-portrait.webp",
    emblem: "assets/channels/free-ports-emblem.webp",
    openingMessage:
      "Siedem portów uznaje waszą monetę, lecz nie wszystkie wasze cła. Możemy otworzyć magazyny jeszcze przed przypływem.",
    accent: "free-ports",
  },
  {
    id: "amber_guilds",
    name: "Gildie Bursztynowego Traktu",
    shortName: "Bursztynowy Trakt",
    contact: "Faktor Elian Rdzawy",
    title: "Powiernik ksiąg i karawan",
    portrait: "assets/channels/amber-guilds-portrait.webp",
    emblem: "assets/channels/amber-guilds-emblem.webp",
    openingMessage:
      "Karawany czekają za wschodnią bramą. Każda wiezie trzy rzeczy: towary, plotki i cudze długi. Korona może wybrać, które wpuścić.",
    accent: "amber-guilds",
  },
] as const;

export function createDiplomaticChannels(): DiplomaticChannelState[] {
  return [
    { id: "pirates", relation: 34, lastActionTurn: null },
    { id: "free_ports", relation: 56, lastActionTurn: null },
    { id: "amber_guilds", relation: 48, lastActionTurn: null },
  ];
}

export function diplomaticChannel(id: DiplomaticChannelId) {
  return DIPLOMATIC_CHANNELS.find((channel) => channel.id === id);
}
