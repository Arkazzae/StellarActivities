import { Chess } from "chess.js";
import type { ClockState } from "./clock";
import type { Move, PieceColor, PieceType, Square } from "./types";
import { FILES, RANKS } from "./types";

export const CHAOS_DRAFT_INTERVAL = 8;

export type ChaosEffectId =
  | "royal_guard"
  | "blink"
  | "second_wind"
  | "pawn_surge"
  | "knight_forge"
  | "bishops_oath"
  | "rook_foundry"
  | "queens_gambit"
  | "kings_grace"
  | "echo_move"
  | "time_thief"
  | "hourglass"
  | "sanctuary"
  | "iron_pawns"
  | "thorn_mail"
  | "phoenix_piece"
  | "necromancy"
  | "blood_price"
  | "bounty_hunter"
  | "momentum"
  | "mirror_shield"
  | "gravity_well"
  | "frozen_file"
  | "cursed_square"
  | "safe_passage"
  | "last_stand"
  | "underdog"
  | "chain_reaction"
  | "tactical_reset"
  | "chaos_swap"
  | "piece_storm"
  | "promotion_rush"
  | "royal_decree"
  | "scavenger"
  | "arcane_reserve"
  | "forked_fate"
  | "gamblers_coin"
  | "void_tax"
  | "marching_orders"
  | "crown_of_chance"
  | "pawn_bloom"
  | "bishop_forge"
  | "rook_forge"
  | "royal_ascension"
  | "soul_harvest"
  | "queens_echo"
  | "battle_hardened"
  | "wild_growth"
  | "pawn_legacy"
  | "prismatic_army";

type ChaosCategory = "arcane" | "battle" | "time" | "fate";
type ChaosRarity = "common" | "rare" | "legendary";

export interface LocalizedChaosCopy {
  en: string;
  pl: string;
}

export interface ChaosEffectDefinition {
  id: ChaosEffectId;
  name: LocalizedChaosCopy;
  description: LocalizedChaosCopy;
  category: ChaosCategory;
  rarity: ChaosRarity;
  duration: "instant" | "timed" | "permanent";
  turns?: number;
  art: string;
}

const effect = (
  id: ChaosEffectId,
  enName: string,
  plName: string,
  enDescription: string,
  plDescription: string,
  category: ChaosCategory,
  rarity: ChaosRarity,
  duration: ChaosEffectDefinition["duration"],
  turns?: number,
  artId: ChaosEffectId = id,
): ChaosEffectDefinition => ({
  id,
  name: { en: enName, pl: plName },
  description: { en: enDescription, pl: plDescription },
  category,
  rarity,
  duration,
  turns,
  art: `chaos/${artId}.webp`,
});

export const CHAOS_EFFECTS: readonly ChaosEffectDefinition[] = [
  effect("royal_guard", "Royal Guard", "Królewska straż", "King moves summon a loyal pawn, favoring the square left behind.", "Ruch króla przyzywa lojalnego pionka, najlepiej na opuszczone pole.", "battle", "rare", "permanent"),
  effect("blink", "Blink", "Mignięcie", "Choose one of your strongest non-royal pieces and teleport it to an open square.", "Wybierz jedną z najsilniejszych figur poza królem i przenieś ją na wolne pole.", "arcane", "common", "instant"),
  effect("second_wind", "Second Wind", "Drugi oddech", "Restore your strongest missing starting piece; if none is missing, gain 20 seconds.", "Przywróć najsilniejszą brakującą figurę startową; jeśli nic nie brakuje, zyskaj 20 sekund.", "fate", "rare", "instant"),
  effect("pawn_surge", "Pawn Surge", "Pionowy zryw", "Pawn moves grant 4 seconds for your next 4 turns.", "Ruchy pionkami dają 4 sekundy przez następne 4 tury.", "time", "common", "timed", 4),
  effect("knight_forge", "Knight Forge", "Kuźnia skoczka", "Choose one of your pawns and transform it into a knight.", "Wybierz jednego ze swoich pionków i przemień go w skoczka.", "arcane", "common", "instant"),
  effect("bishops_oath", "Bishop's Oath", "Przysięga gońca", "Bishop captures restore one pawn to your ranks.", "Bicie gońcem przywraca jednego pionka.", "fate", "rare", "permanent"),
  effect("rook_foundry", "Rook Foundry", "Wieżowa odlewnia", "Rook captures forge a new pawn on your home line.", "Bicie wieżą tworzy nowego pionka na twojej linii startowej.", "battle", "rare", "permanent"),
  effect("queens_gambit", "Queen's Gambit", "Gambit hetmana", "Sacrifice a pawn to restore your queen, or gain 25 seconds.", "Poświęć pionka, aby przywrócić hetmana, albo zyskaj 25 sekund.", "fate", "legendary", "instant"),
  effect("kings_grace", "King's Grace", "Łaska króla", "King moves grant 10 seconds for your next 3 turns.", "Ruchy królem dają 10 sekund przez następne 3 tury.", "time", "common", "timed", 3),
  effect("echo_move", "Echo Move", "Echo ruchu", "Within 4 turns, your first quiet move summons a pawn, favoring its origin square.", "W ciągu 4 tur pierwszy ruch bez bicia przyzywa pionka, najlepiej na polu startowym ruchu.", "arcane", "rare", "timed", 4),
  effect("time_thief", "Time Thief", "Złodziej czasu", "Every capture steals 6 seconds from your opponent.", "Każde bicie kradnie przeciwnikowi 6 sekund.", "time", "rare", "permanent"),
  effect("hourglass", "Shattered Hourglass", "Rozbita klepsydra", "Gain 30 seconds immediately.", "Natychmiast zyskaj 30 sekund.", "time", "common", "instant"),
  effect("sanctuary", "Sanctuary", "Sanktuarium", "When you lose a piece, gain 12 seconds for the next 4 turns.", "Gdy tracisz figurę, zyskujesz 12 sekund przez następne 4 tury.", "fate", "common", "timed", 4),
  effect("iron_pawns", "Iron Pawns", "Żelazne pionki", "Captured pawns return to an open home square for 4 turns.", "Zbite pionki wracają na wolne pole startowe przez 4 tury.", "battle", "rare", "timed", 4),
  effect("thorn_mail", "Thorn Mail", "Kolczasta zbroja", "For 3 turns, a non-royal capturer of your piece becomes a pawn.", "Przez 3 tury figura bijąca twoją figurę zmienia się w pionka.", "battle", "legendary", "timed", 3),
  effect("phoenix_piece", "Phoenix Piece", "Feniksowa figura", "Your next captured knight, bishop, or rook returns once.", "Następny zbity skoczek, goniec lub wieża wraca jeden raz.", "fate", "legendary", "permanent"),
  effect("necromancy", "Necromancy", "Nekromancja", "Every third capture raises a pawn for your side.", "Co trzecie bicie wskrzesza pionka po twojej stronie.", "arcane", "rare", "permanent"),
  effect("blood_price", "Blood Price", "Cena krwi", "Sacrifice one pawn and gain 45 seconds.", "Poświęć jednego pionka i zyskaj 45 sekund.", "time", "rare", "instant"),
  effect("bounty_hunter", "Bounty Hunter", "Łowca nagród", "Capturing a rook or queen grants 20 seconds.", "Bicie wieży lub hetmana daje 20 sekund.", "time", "common", "permanent"),
  effect("momentum", "Momentum", "Rozpęd", "Quiet moves grant increasingly more time for 4 turns.", "Ruchy bez bicia dają coraz więcej czasu przez 4 tury.", "time", "common", "timed", 4),
  effect("mirror_shield", "Mirror Shield", "Lustrzana tarcza", "The next piece you lose is restored once.", "Następna utracona figura zostaje raz przywrócona.", "arcane", "legendary", "timed", 4),
  effect("gravity_well", "Gravity Well", "Studnia grawitacji", "Choose one of your strongest non-royal pieces and move it onto an open central square.", "Wybierz jedną z najsilniejszych figur poza królem i przenieś ją na wolne pole centralne.", "arcane", "common", "instant"),
  effect("frozen_file", "Frozen File", "Zamrożona linia", "Enemy pieces ending a move on a marked file lose 8 seconds for 4 turns.", "Figury przeciwnika kończące ruch na oznaczonej linii tracą 8 sekund przez 4 tury.", "time", "rare", "timed", 4),
  effect("cursed_square", "Cursed Square", "Przeklęte pole", "A marked central square turns enemy non-royal visitors into pawns for 4 turns.", "Oznaczone pole centralne zmienia wrogie figury poza królem w pionki przez 4 tury.", "arcane", "legendary", "timed", 4),
  effect("safe_passage", "Safe Passage", "Bezpieczne przejście", "Pawn captures grant 8 seconds for your next 4 turns.", "Bicia pionkami dają 8 sekund przez następne 4 tury.", "time", "common", "timed", 4),
  effect("last_stand", "Last Stand", "Ostatni bastion", "Once, restore a rook when two or fewer friendly pieces remain beside your king.", "Raz przywróć wieżę, gdy poza królem zostaną najwyżej dwie figury.", "battle", "legendary", "permanent"),
  effect("underdog", "Underdog", "Niepokorny", "Moves made while far behind in material grant 12 seconds.", "Ruchy wykonywane przy dużej stracie materialnej dają 12 sekund.", "time", "rare", "permanent"),
  effect("chain_reaction", "Chain Reaction", "Reakcja łańcuchowa", "For 3 turns, your non-royal capturer copies the captured piece's type.", "Przez 3 tury figura bijąca poza królem przejmuje typ zbitej figury.", "arcane", "legendary", "timed", 3),
  effect("tactical_reset", "Tactical Reset", "Taktyczny reset", "Swap the positions of two friendly non-royal pieces.", "Zamień miejscami dwie własne figury poza królem.", "battle", "common", "instant"),
  effect("chaos_swap", "Chaos Swap", "Chaotyczna zamiana", "Swap one of your pieces with an enemy non-royal piece.", "Zamień jedną własną figurę z figurą przeciwnika poza królami.", "arcane", "legendary", "instant"),
  effect("piece_storm", "Piece Storm", "Burza figur", "Rotate every knight, bishop, rook, and queen through occupied officer squares.", "Przesuń skoczki, gońce, wieże i hetmany między polami zajmowanymi przez figury oficerskie.", "arcane", "legendary", "instant"),
  effect("promotion_rush", "Promotion Rush", "Wyścig promocji", "Pawns reaching the sixth rank become knights immediately.", "Pionki docierające do szóstej linii natychmiast stają się skoczkami.", "battle", "rare", "permanent"),
  effect("royal_decree", "Royal Decree", "Królewski dekret", "Non-royal pieces finishing beside your king grant 6 seconds for 4 turns.", "Figury poza królem kończące ruch obok monarchy dają 6 sekund przez 4 tury.", "time", "common", "timed", 4),
  effect("scavenger", "Scavenger", "Padlinożerca", "Every second pawn capture restores a missing minor piece.", "Co drugie zbicie pionka przywraca brakującą lekką figurę.", "fate", "rare", "permanent"),
  effect("arcane_reserve", "Arcane Reserve", "Magiczna rezerwa", "Restore a missing knight or bishop, or gain 15 seconds.", "Przywróć skoczka lub gońca, albo zyskaj 15 sekund.", "arcane", "common", "instant"),
  effect("forked_fate", "Forked Fate", "Rozwidlenie losu", "Knight captures summon a pawn, favoring the knight's origin square.", "Bicie skoczkiem przyzywa pionka, najlepiej na polu, z którego ruszył.", "fate", "rare", "permanent"),
  effect("gamblers_coin", "Gambler's Coin", "Moneta hazardzisty", "Each of your next 4 moves wins or loses 8 seconds.", "Każdy z następnych 4 ruchów daje albo odbiera 8 sekund.", "fate", "common", "timed", 4),
  effect("void_tax", "Void Tax", "Podatek pustki", "Enemy quiet moves cost them 5 seconds for 4 turns.", "Ruchy przeciwnika bez bicia kosztują go 5 sekund przez 4 tury.", "time", "rare", "timed", 4),
  effect("marching_orders", "Marching Orders", "Rozkaz wymarszu", "For 3 turns, pawn moves leave a new pawn on their origin square.", "Przez 3 tury ruch pionkiem pozostawia nowego pionka na polu startowym.", "battle", "legendary", "timed", 3),
  effect("crown_of_chance", "Crown of Chance", "Korona przypadku", "Receive one hidden boon: time, a pawn, or a forged knight.", "Otrzymaj ukryty dar: czas, pionka albo wykutego skoczka.", "fate", "rare", "instant"),
  effect("pawn_bloom", "Pawn Bloom", "Rozkwit pionów", "Summon up to two pawns on open squares in your half of the board.", "Przyzwij do dwóch pionków na wolnych polach swojej połowy planszy.", "arcane", "common", "instant", undefined, "pawn_surge"),
  effect("bishop_forge", "Bishop Forge", "Kuźnia gońca", "Choose one of your pawns and transform it into a bishop.", "Wybierz jednego ze swoich pionków i przemień go w gońca.", "arcane", "common", "instant", undefined, "bishops_oath"),
  effect("rook_forge", "Rook Forge", "Kuźnia wieży", "Choose one of your pawns and transform it into a rook.", "Wybierz jednego ze swoich pionków i przemień go w wieżę.", "battle", "rare", "instant", undefined, "rook_foundry"),
  effect("royal_ascension", "Royal Ascension", "Królewskie wyniesienie", "For 4 turns, a pawn or minor piece ending beside your king is upgraded.", "Przez 4 tury pionek lub lekka figura kończąca ruch obok króla zostaje ulepszona.", "fate", "rare", "timed", 4, "royal_decree"),
  effect("soul_harvest", "Soul Harvest", "Żniwa dusz", "Every second capture restores your strongest missing starting piece.", "Co drugie bicie przywraca twoją najsilniejszą brakującą figurę startową.", "fate", "legendary", "permanent", undefined, "necromancy"),
  effect("queens_echo", "Queen's Echo", "Echo hetmana", "Queen captures summon a pawn, favoring the queen's origin square.", "Bicie hetmanem przyzywa pionka, najlepiej na polu, z którego ruszył.", "arcane", "rare", "permanent", undefined, "echo_move"),
  effect("battle_hardened", "Battle Hardened", "Zahartowani w boju", "For 4 turns, a knight or bishop that captures is forged into a rook.", "Przez 4 tury skoczek lub goniec po biciu zostaje przekuty w wieżę.", "battle", "rare", "timed", 4, "bounty_hunter"),
  effect("wild_growth", "Wild Growth", "Dziki rozrost", "For 4 turns, each quiet move has a 50% chance to sprout a pawn behind it.", "Przez 4 tury każdy ruch bez bicia ma 50% szansy wyhodować pionka na opuszczonym polu.", "arcane", "common", "timed", 4, "gamblers_coin"),
  effect("pawn_legacy", "Pawn Legacy", "Dziedzictwo pionów", "Pawn captures leave a new pawn on their origin square.", "Bicie pionkiem pozostawia nowego pionka na polu, z którego pionek ruszył.", "battle", "rare", "permanent", undefined, "marching_orders"),
  effect("prismatic_army", "Prismatic Army", "Pryzmatyczna armia", "Cycle your knights into bishops, bishops into rooks, and rooks into knights.", "Przemień swoje skoczki w gońce, gońce w wieże, a wieże w skoczki.", "arcane", "legendary", "instant", undefined, "piece_storm"),
] as const;

export const CHAOS_EFFECT_BY_ID = Object.fromEntries(
  CHAOS_EFFECTS.map((definition) => [definition.id, definition]),
) as Record<ChaosEffectId, ChaosEffectDefinition>;

export interface ActiveChaosEffect {
  instanceId: string;
  effectId: ChaosEffectId;
  owner: PieceColor;
  acquiredAtMove: number;
  remainingTurns: number | null;
  charges: number | null;
  progress: number;
  markedSquare?: Square;
  markedFile?: string;
}

export interface ChaosDraft {
  round: number;
  chooser: PieceColor;
  options: ChaosEffectId[];
  remainingChoosers: PieceColor[];
}

export interface ChaosHistoryEntry {
  id: string;
  move: number;
  owner: PieceColor;
  effectId: ChaosEffectId;
  kind: "picked" | "triggered" | "expired";
}

export interface PendingChaosChoice {
  effectId: ChaosEffectId;
  owner: PieceColor;
  selectedSquares: Square[];
}

export interface ChaosSnapshot {
  enabled: boolean;
  round: number;
  draft: ChaosDraft | null;
  pendingChoice: PendingChaosChoice | null;
  activeEffects: Record<PieceColor, ActiveChaosEffect[]>;
  pickedEffectIds: Record<PieceColor, ChaosEffectId[]>;
  history: ChaosHistoryEntry[];
}

export interface ChaosMoveResolution {
  clock: ClockState;
  activeEffects: Record<PieceColor, ActiveChaosEffect[]>;
  history: ChaosHistoryEntry[];
  boardChanged: boolean;
}

const PIECE_VALUE: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

const STARTING_COUNTS: Record<PieceType, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
  k: 1,
};

const CENTRAL_SQUARES: Square[] = ["d4", "e4", "d5", "e5", "c4", "f4", "c5", "f5"];
const BOARD_TARGET_EFFECTS = new Set<ChaosEffectId>([
  "blink",
  "gravity_well",
  "knight_forge",
  "bishop_forge",
  "rook_forge",
  "queens_gambit",
  "blood_price",
  "tactical_reset",
  "chaos_swap",
]);
const CLOCK_ONLY_EFFECTS = new Set<ChaosEffectId>([
  "pawn_surge",
  "kings_grace",
  "time_thief",
  "hourglass",
  "sanctuary",
  "blood_price",
  "bounty_hunter",
  "momentum",
  "frozen_file",
  "safe_passage",
  "underdog",
  "royal_decree",
  "gamblers_coin",
  "void_tax",
]);
const ENEMY_TURN_TIMED_EFFECTS = new Set<ChaosEffectId>([
  "sanctuary",
  "iron_pawns",
  "thorn_mail",
  "mirror_shield",
  "frozen_file",
  "cursed_square",
  "void_tax",
]);
const RARITY_WEIGHT: Record<ChaosRarity, number> = {
  common: 60,
  rare: 30,
  legendary: 10,
};

export function createEmptyChaosSnapshot(enabled = false): ChaosSnapshot {
  return {
    enabled,
    round: 0,
    draft: null,
    pendingChoice: null,
    activeEffects: { w: [], b: [] },
    pickedEffectIds: { w: [], b: [] },
    history: [],
  };
}

export function chaosEffectNeedsBoardTarget(effectId: ChaosEffectId): boolean {
  return BOARD_TARGET_EFFECTS.has(effectId);
}

export function isClockOnlyChaosEffect(effectId: ChaosEffectId): boolean {
  return CLOCK_ONLY_EFFECTS.has(effectId);
}

/** Start an on-board selection only for effects whose wording promises a choice. */
export function createPendingChaosChoice(
  chess: Chess,
  effectId: ChaosEffectId,
  owner: PieceColor,
): PendingChaosChoice | null {
  const pending: PendingChaosChoice = { effectId, owner, selectedSquares: [] };
  return getChaosTargetSquares(chess, pending).length > 0 ? pending : null;
}

export function getChaosTargetCount(effectId: ChaosEffectId): 1 | 2 {
  return ["blink", "gravity_well", "tactical_reset", "chaos_swap"].includes(effectId)
    ? 2
    : 1;
}

/** Legal targets for the current step of an interactive Chaos effect. */
export function getChaosTargetSquares(
  chess: Chess,
  pending: PendingChaosChoice,
): Square[] {
  const { effectId, owner, selectedSquares } = pending;

  if (effectId === "blink") {
    const pairs = getSelectedMovePairs(chess, owner, effectId);
    if (selectedSquares.length === 0) {
      return [...new Set(pairs.map(([source]) => source))];
    }
    return pairs
      .filter(([source]) => source === selectedSquares[0])
      .map(([, target]) => target);
  }

  if (effectId === "gravity_well") {
    const pairs = getSelectedMovePairs(chess, owner, effectId);
    if (selectedSquares.length === 0) {
      return [...new Set(pairs.map(([source]) => source))];
    }
    return pairs
      .filter(([source]) => source === selectedSquares[0])
      .map(([, target]) => target);
  }

  if (["knight_forge", "bishop_forge", "rook_forge"].includes(effectId)) {
    return piecesFor(chess, owner, false)
      .filter((piece) => piece.type === "p")
      .filter((piece) => isSelectedEffectSafe(chess, owner, effectId, [piece.square]))
      .map((piece) => piece.square);
  }

  if (effectId === "queens_gambit") {
    if (countPieces(chess, owner, "q") >= STARTING_COUNTS.q) return [];
    return piecesFor(chess, owner, false)
      .filter((piece) => piece.type === "p")
      .filter((piece) => isSelectedEffectSafe(chess, owner, effectId, [piece.square]))
      .map((piece) => piece.square);
  }

  if (effectId === "blood_price") {
    return piecesFor(chess, owner, false)
      .filter((piece) => piece.type === "p")
      .filter((piece) => isSelectedEffectSafe(chess, owner, effectId, [piece.square]))
      .map((piece) => piece.square);
  }

  if (effectId === "tactical_reset") {
    const pairs = getFriendlySwapPairs(piecesFor(chess, owner, false))
      .filter(([first, second]) =>
        isSelectedEffectSafe(chess, owner, effectId, [first.square, second.square]),
      );
    if (selectedSquares.length === 0) {
      return [...new Set(pairs.flatMap(([first, second]) => [first.square, second.square]))];
    }
    const firstSquare = selectedSquares[0];
    return [...new Set(pairs.flatMap(([first, second]) => {
      if (first.square === firstSquare) return [second.square];
      if (second.square === firstSquare) return [first.square];
      return [];
    }))];
  }

  if (effectId === "chaos_swap") {
    const pairs = getOpposingSwapPairs(chess, owner)
      .filter(([own, opponent]) =>
        isSelectedEffectSafe(chess, owner, effectId, [own.square, opponent.square]),
      );
    if (selectedSquares.length === 0) {
      return [...new Set(pairs.map(([own]) => own.square))];
    }
    const ownSquare = selectedSquares[0];
    return pairs
      .filter(([own]) => own.square === ownSquare)
      .map(([, opponent]) => opponent.square);
  }

  return [];
}

/** Pick and evaluate every legal target sequence for an effect controlled by a bot. */
export function chooseChaosTargetsForBot(
  chess: Chess,
  effectId: ChaosEffectId,
  owner: PieceColor,
  seed: string,
): Square[] {
  const pending = createPendingChaosChoice(chess, effectId, owner);
  if (!pending) return [];

  const selections: Square[][] = [];
  for (const first of getChaosTargetSquares(chess, pending)) {
    if (getChaosTargetCount(effectId) === 1) {
      selections.push([first]);
      continue;
    }
    const nextPending = { ...pending, selectedSquares: [first] };
    for (const second of getChaosTargetSquares(chess, nextPending)) {
      selections.push([first, second]);
    }
  }

  let best: { squares: Square[]; score: number } | null = null;
  for (const squares of selections) {
    const preview = new Chess(chess.fen());
    const result = applyImmediateChaosEffect(
      preview,
      { w: 0, b: 0, running: null, lastTick: 0 },
      effectId,
      owner,
      `${seed}:${squares.join(":")}`,
      true,
      squares,
    );
    if (!result.boardChanged) continue;
    const score = scoreChaosPositionForBot(preview, owner)
      + (hashString(`${seed}:${squares.join(":")}`) % 10_000) / 1_000_000;
    if (!best || score > best.score) best = { squares, score };
  }

  return best?.squares ?? [];
}

export function getChaosCopy(copy: LocalizedChaosCopy, locale: string): string {
  return locale === "pl" ? copy.pl : copy.en;
}

export function createChaosDraft(
  round: number,
  chooser: PieceColor,
  picked: readonly ChaosEffectId[],
  seed: string,
  remainingChoosers: PieceColor[],
  allowClockEffects = true,
  availableEffectIds?: readonly ChaosEffectId[],
): ChaosDraft {
  return {
    round,
    chooser,
    options: drawChaosOptions(
      picked,
      `${seed}:${round}:${chooser}`,
      allowClockEffects,
      availableEffectIds,
    ),
    remainingChoosers,
  };
}

export function drawChaosOptions(
  picked: readonly ChaosEffectId[],
  seed: string,
  allowClockEffects = true,
  availableEffectIds?: readonly ChaosEffectId[],
): ChaosEffectId[] {
  const eligible = CHAOS_EFFECTS
    .map((item) => item.id)
    .filter((id) => allowClockEffects || !CLOCK_ONLY_EFFECTS.has(id))
    .filter((id) => !availableEffectIds || availableEffectIds.includes(id));
  const unpicked = eligible.filter((id) => !picked.includes(id));
  const pool = unpicked.length >= 3 ? unpicked : eligible;
  const candidates = [...pool];
  const selected: ChaosEffectId[] = [];
  let value = hashString(seed);
  while (selected.length < 3 && candidates.length > 0) {
    value = nextRandom(value);
    const totalWeight = candidates.reduce(
      (sum, id) => sum + RARITY_WEIGHT[CHAOS_EFFECT_BY_ID[id].rarity],
      0,
    );
    let roll = value % totalWeight;
    let selectedIndex = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      roll -= RARITY_WEIGHT[CHAOS_EFFECT_BY_ID[candidates[index]].rarity];
      if (roll < 0) {
        selectedIndex = index;
        break;
      }
    }
    selected.push(candidates[selectedIndex]);
    candidates.splice(selectedIndex, 1);
  }
  return selected;
}

export function createActiveChaosEffect(
  definition: ChaosEffectDefinition,
  owner: PieceColor,
  moveCount: number,
  seed: string,
): ActiveChaosEffect {
  const active: ActiveChaosEffect = {
    instanceId: `${definition.id}:${owner}:${moveCount}`,
    effectId: definition.id,
    owner,
    acquiredAtMove: moveCount,
    remainingTurns: definition.duration === "timed" ? definition.turns ?? 1 : null,
    charges: ["echo_move", "phoenix_piece", "mirror_shield", "last_stand"].includes(definition.id) ? 1 : null,
    progress: 0,
  };
  if (definition.id === "frozen_file") {
    active.markedFile = FILES[hashString(`${seed}:file`) % FILES.length];
  }
  if (definition.id === "cursed_square") {
    active.markedSquare = CENTRAL_SQUARES[hashString(`${seed}:square`) % CENTRAL_SQUARES.length];
  }
  return active;
}

export function applyImmediateChaosEffect(
  chess: Chess,
  clock: ClockState,
  effectId: ChaosEffectId,
  owner: PieceColor,
  seed: string,
  allowClockEffects = true,
  selectedSquares: readonly Square[] = [],
): { clock: ClockState; boardChanged: boolean } {
  const originalFen = chess.fen();
  const ownerKingWasAttacked = isKingAttacked(chess, owner);
  let nextClock = { ...clock };
  let boardChanged = false;

  switch (effectId) {
    case "blink":
      boardChanged = selectedSquares.length === 2
        ? moveSelectedPiece(chess, owner, selectedSquares[0], selectedSquares[1], "anywhere")
        : blinkStrongestPiece(chess, owner, seed);
      if (!boardChanged) nextClock = addTime(nextClock, owner, 15);
      break;
    case "gravity_well":
      boardChanged = selectedSquares.length === 2
        ? moveSelectedPiece(chess, owner, selectedSquares[0], selectedSquares[1], "center")
        : moveStrongestToCenter(chess, owner, seed);
      if (!boardChanged) nextClock = addTime(nextClock, owner, 15);
      break;
    case "second_wind":
      boardChanged = restoreStrongestMissing(chess, owner);
      if (!boardChanged) nextClock = addTime(nextClock, owner, 20);
      break;
    case "knight_forge":
      boardChanged = selectedSquares[0]
        ? transformPawnAt(chess, owner, selectedSquares[0], "n")
        : transformPawn(chess, owner, "n");
      if (!boardChanged) nextClock = addTime(nextClock, owner, 15);
      break;
    case "bishop_forge":
      boardChanged = selectedSquares[0]
        ? transformPawnAt(chess, owner, selectedSquares[0], "b")
        : transformPawn(chess, owner, "b");
      if (!boardChanged) nextClock = addTime(nextClock, owner, 15);
      break;
    case "rook_forge":
      boardChanged = selectedSquares[0]
        ? transformPawnAt(chess, owner, selectedSquares[0], "r")
        : transformPawn(chess, owner, "r");
      if (!boardChanged) nextClock = addTime(nextClock, owner, 15);
      break;
    case "queens_gambit": {
      const queenIsMissing = countPieces(chess, owner, "q") < STARTING_COUNTS.q;
      const sacrificed = queenIsMissing && (
        selectedSquares[0]
          ? removePawnAt(chess, owner, selectedSquares[0])
          : removePawn(chess, owner)
      );
      if (sacrificed && restorePiece(chess, owner, "q")) {
        boardChanged = true;
      } else {
        nextClock = addTime(nextClock, owner, 25);
      }
      break;
    }
    case "hourglass":
      nextClock = addTime(nextClock, owner, 30);
      break;
    case "blood_price":
      if (
        selectedSquares[0]
          ? removePawnAt(chess, owner, selectedSquares[0])
          : removePawn(chess, owner)
      ) {
        boardChanged = true;
        nextClock = addTime(nextClock, owner, 45);
      } else {
        nextClock = addTime(nextClock, owner, 20);
      }
      break;
    case "tactical_reset":
      boardChanged = selectedSquares.length === 2
        ? swapSelectedFriendlyPieces(chess, owner, selectedSquares[0], selectedSquares[1])
        : swapFriendlyPieces(chess, owner, seed);
      if (!boardChanged) nextClock = addTime(nextClock, owner, 12);
      break;
    case "chaos_swap":
      boardChanged = selectedSquares.length === 2
        ? swapSelectedOpposingPieces(chess, owner, selectedSquares[0], selectedSquares[1])
        : swapOpposingPieces(chess, owner, seed);
      if (!boardChanged) nextClock = addTime(nextClock, owner, 12);
      break;
    case "piece_storm":
      boardChanged = rotateArmies(chess);
      if (!boardChanged) nextClock = addTime(nextClock, owner, 15);
      break;
    case "arcane_reserve":
      boardChanged = restoreMissingMinor(chess, owner);
      if (!boardChanged) nextClock = addTime(nextClock, owner, 15);
      break;
    case "crown_of_chance": {
      const boon = allowClockEffects ? hashString(seed) % 3 : 1 + (hashString(seed) % 2);
      if (boon === 0) nextClock = addTime(nextClock, owner, 25);
      if (boon === 1) boardChanged = spawnPawn(chess, owner);
      if (boon === 2) boardChanged = transformPawn(chess, owner, "n");
      if (boon !== 0 && !boardChanged && !allowClockEffects) {
        boardChanged = boon === 1
          ? transformPawn(chess, owner, "n")
          : spawnPawn(chess, owner);
      }
      if (boon !== 0 && !boardChanged && allowClockEffects) {
        nextClock = addTime(nextClock, owner, 15);
      }
      break;
    }
    case "pawn_bloom":
      boardChanged = spawnPawns(chess, owner, 2) > 0;
      if (!boardChanged) nextClock = addTime(nextClock, owner, 15);
      break;
    case "prismatic_army":
      boardChanged = cycleArmy(chess, owner);
      if (!boardChanged) nextClock = addTime(nextClock, owner, 15);
      break;
    default:
      break;
  }

  if (
    boardChanged
    && (
      !isChaosPositionSafe(chess)
      || (!ownerKingWasAttacked && isKingAttacked(chess, owner))
    )
  ) {
    chess.load(originalFen);
    nextClock = { ...clock };
    boardChanged = false;
    if (!allowClockEffects) {
      boardChanged = spawnPawn(chess, owner);
      if (
        boardChanged
        && (
          !isChaosPositionSafe(chess)
          || (!ownerKingWasAttacked && isKingAttacked(chess, owner))
        )
      ) {
        chess.load(originalFen);
        boardChanged = false;
      }
    }
    if (!boardChanged) nextClock = addTime(nextClock, owner, 12);
  }

  return { clock: nextClock, boardChanged };
}

export function resolveChaosMove(
  chess: Chess,
  clock: ClockState,
  activeEffects: Record<PieceColor, ActiveChaosEffect[]>,
  history: ChaosHistoryEntry[],
  move: Move,
  moveCount: number,
): ChaosMoveResolution {
  let nextClock = { ...clock };
  let boardChanged = false;
  const nextEffects: Record<PieceColor, ActiveChaosEffect[]> = {
    w: activeEffects.w.map((item) => ({ ...item })),
    b: activeEffects.b.map((item) => ({ ...item })),
  };
  const triggered: ChaosHistoryEntry[] = [];
  const restoredLosses = new Set<PieceColor>();
  const mover = move.color;
  const victim: PieceColor = mover === "w" ? "b" : "w";
  const beforeMove = new Chess(move.before);

  for (const owner of ["w", "b"] as const) {
    const survivors: ActiveChaosEffect[] = [];
    for (const active of nextEffects[owner]) {
      const fenBeforeEffect = chess.fen();
      const activeBeforeEffect = { ...active };
      const clockBeforeEffect: ClockState = nextClock;
      const boardChangedBeforeEffect: boolean = boardChanged;
      let didTrigger = false;
      let consumeCharge = false;
      let restoredLoss = false;

      switch (active.effectId) {
        case "royal_guard":
          if (mover === owner && move.piece === "k") {
            didTrigger = putPawnAt(chess, owner, move.from) || spawnPawn(chess, owner);
            boardChanged ||= didTrigger;
          }
          break;
        case "pawn_surge":
          if (mover === owner && move.piece === "p") {
            nextClock = addTime(nextClock, owner, 4);
            didTrigger = true;
          }
          break;
        case "bishops_oath":
          if (mover === owner && move.piece === "b" && move.captured) {
            didTrigger = countPieces(chess, owner, "p") < STARTING_COUNTS.p
              && restorePiece(chess, owner, "p");
            boardChanged ||= didTrigger;
          }
          break;
        case "rook_foundry":
          if (mover === owner && move.piece === "r" && move.captured) {
            didTrigger = spawnPawn(chess, owner);
            boardChanged ||= didTrigger;
          }
          break;
        case "kings_grace":
          if (mover === owner && move.piece === "k") {
            nextClock = addTime(nextClock, owner, 10);
            didTrigger = true;
          }
          break;
        case "echo_move":
          if (mover === owner && !move.captured) {
            didTrigger = putPawnAt(chess, owner, move.from) || spawnPawn(chess, owner);
            boardChanged ||= didTrigger;
            consumeCharge = didTrigger;
          }
          break;
        case "time_thief":
          if (mover === owner && move.captured) {
            nextClock = addTime(subtractTime(nextClock, victim, 6), owner, 6);
            didTrigger = true;
          }
          break;
        case "sanctuary":
          if (owner === victim && move.captured) {
            nextClock = addTime(nextClock, owner, 12);
            didTrigger = true;
          }
          break;
        case "iron_pawns":
          if (owner === victim && move.captured === "p" && !restoredLosses.has(owner)) {
            didTrigger = spawnPawn(chess, owner);
            boardChanged ||= didTrigger;
            restoredLoss = didTrigger;
          }
          break;
        case "thorn_mail":
          if (owner === victim && move.captured && move.piece !== "k") {
            const replacement: PieceType = move.to[1] === "1" || move.to[1] === "8" ? "n" : "p";
            didTrigger = replacePiece(chess, move.to, mover, replacement);
            boardChanged ||= didTrigger;
          }
          break;
        case "phoenix_piece":
          if (
            owner === victim
            && move.captured
            && ["n", "b", "r"].includes(move.captured)
            && !restoredLosses.has(owner)
          ) {
            didTrigger = restorePiece(chess, owner, move.captured);
            boardChanged ||= didTrigger;
            consumeCharge = didTrigger;
            restoredLoss = didTrigger;
          }
          break;
        case "necromancy":
          if (mover === owner && move.captured) {
            active.progress += 1;
          }
          if (active.progress >= 3) {
            didTrigger = spawnPawn(chess, owner);
            if (didTrigger) active.progress -= 3;
            boardChanged ||= didTrigger;
          }
          break;
        case "bounty_hunter":
          if (mover === owner && (move.captured === "r" || move.captured === "q")) {
            nextClock = addTime(nextClock, owner, 20);
            didTrigger = true;
          }
          break;
        case "momentum":
          if (mover === owner) {
            active.progress = move.captured ? 0 : Math.min(active.progress + 1, 3);
            if (!move.captured) {
              nextClock = addTime(nextClock, owner, active.progress * 3);
              didTrigger = true;
            }
          }
          break;
        case "mirror_shield":
          if (owner === victim && move.captured && !restoredLosses.has(owner)) {
            didTrigger = restorePiece(chess, owner, move.captured);
            boardChanged ||= didTrigger;
            consumeCharge = didTrigger;
            restoredLoss = didTrigger;
          }
          break;
        case "frozen_file":
          if (mover !== owner && move.to[0] === active.markedFile) {
            nextClock = subtractTime(nextClock, mover, 8);
            didTrigger = true;
          }
          break;
        case "cursed_square":
          if (mover !== owner && move.to === active.markedSquare && move.piece !== "k") {
            const replacement: PieceType = move.to[1] === "1" || move.to[1] === "8" ? "n" : "p";
            didTrigger = replacePiece(chess, move.to, mover, replacement);
            boardChanged ||= didTrigger;
          }
          break;
        case "safe_passage":
          if (mover === owner && move.piece === "p" && move.captured) {
            nextClock = addTime(nextClock, owner, 8);
            didTrigger = true;
          }
          break;
        case "last_stand":
          if (
            countNonRoyalPieces(chess, owner) <= 2
            && countPieces(chess, owner, "r") < STARTING_COUNTS.r
          ) {
            didTrigger = restorePiece(chess, owner, "r");
            boardChanged ||= didTrigger;
            consumeCharge = didTrigger;
          }
          break;
        case "underdog":
          if (
            mover === owner
            && materialScore(beforeMove, owner) + 5 <= materialScore(beforeMove, victim)
          ) {
            nextClock = addTime(nextClock, owner, 12);
            didTrigger = true;
          }
          break;
        case "chain_reaction":
          if (mover === owner && move.captured && move.piece !== "k" && move.captured !== "k") {
            const replacement: PieceType = move.captured === "p"
              && (move.to[1] === "1" || move.to[1] === "8")
              ? "n"
              : move.captured;
            didTrigger = replacePiece(chess, move.to, owner, replacement);
            boardChanged ||= didTrigger;
          }
          break;
        case "promotion_rush":
          if (mover === owner && move.piece === "p") {
            const promotionRank = owner === "w" ? "6" : "3";
            if (move.to[1] === promotionRank) {
              didTrigger = replacePiece(chess, move.to, owner, "n");
              boardChanged ||= didTrigger;
            }
          }
          break;
        case "royal_decree":
          if (mover === owner && isBesideKing(chess, move.to, owner)) {
            nextClock = addTime(nextClock, owner, 6);
            didTrigger = true;
          }
          break;
        case "scavenger":
          if (mover === owner && move.captured === "p") {
            active.progress += 1;
          }
          if (active.progress >= 2) {
            didTrigger = restoreMissingMinor(chess, owner);
            if (didTrigger) active.progress -= 2;
            boardChanged ||= didTrigger;
          }
          break;
        case "forked_fate":
          if (mover === owner && move.piece === "n" && move.captured) {
            didTrigger = putPawnAt(chess, owner, move.from) || spawnPawn(chess, owner);
            boardChanged ||= didTrigger;
          }
          break;
        case "gamblers_coin":
          if (mover === owner) {
            const won = hashString(`${moveCount}:${move.from}:${move.to}:${owner}`) % 2 === 0;
            nextClock = won ? addTime(nextClock, owner, 8) : subtractTime(nextClock, owner, 8);
            didTrigger = true;
          }
          break;
        case "void_tax":
          if (mover !== owner && !move.captured) {
            nextClock = subtractTime(nextClock, mover, 5);
            didTrigger = true;
          }
          break;
        case "marching_orders":
          if (mover === owner && move.piece === "p") {
            didTrigger = putPawnAt(chess, owner, move.from);
            boardChanged ||= didTrigger;
          }
          break;
        case "royal_ascension":
          if (
            mover === owner
            && move.piece !== "k"
            && !move.promotion
            && isBesideKing(chess, move.to, owner)
          ) {
            const upgradedType: PieceType | null = move.piece === "p"
              ? "n"
              : move.piece === "n" || move.piece === "b"
                ? "r"
                : null;
            if (upgradedType) {
              didTrigger = replacePiece(chess, move.to, owner, upgradedType);
              boardChanged ||= didTrigger;
            }
          }
          break;
        case "soul_harvest":
          if (mover === owner && move.captured) {
            active.progress += 1;
          }
          if (active.progress >= 2 && !restoredLosses.has(owner)) {
            didTrigger = restoreStrongestMissing(chess, owner);
            if (didTrigger) active.progress -= 2;
            boardChanged ||= didTrigger;
            restoredLoss = didTrigger && owner === victim;
          }
          break;
        case "queens_echo":
          if (mover === owner && move.piece === "q" && move.captured) {
            didTrigger = putPawnAt(chess, owner, move.from) || spawnPawn(chess, owner);
            boardChanged ||= didTrigger;
          }
          break;
        case "battle_hardened":
          if (
            mover === owner
            && (move.piece === "n" || move.piece === "b")
            && move.captured
          ) {
            didTrigger = replacePiece(chess, move.to, owner, "r");
            boardChanged ||= didTrigger;
          }
          break;
        case "wild_growth":
          if (
            mover === owner
            && !move.captured
            && hashString(`${active.instanceId}:${moveCount}:${move.from}:${move.to}`) % 2 === 0
          ) {
            didTrigger = putPawnAt(chess, owner, move.from) || spawnPawn(chess, owner);
            boardChanged ||= didTrigger;
          }
          break;
        case "pawn_legacy":
          if (mover === owner && move.piece === "p" && move.captured) {
            didTrigger = putPawnAt(chess, owner, move.from) || spawnPawn(chess, owner);
            boardChanged ||= didTrigger;
          }
          break;
        default:
          break;
      }

      if (chess.fen() !== fenBeforeEffect && !isChaosPositionSafe(chess)) {
        chess.load(fenBeforeEffect);
        Object.assign(active, activeBeforeEffect);
        nextClock = clockBeforeEffect;
        boardChanged = boardChangedBeforeEffect;
        didTrigger = false;
        consumeCharge = false;
        restoredLoss = false;
      }

      if (didTrigger && restoredLoss) restoredLosses.add(owner);
      if (didTrigger) {
        triggered.push(historyEntry(moveCount, owner, active.effectId, "triggered", triggered.length));
      }

      if (consumeCharge && active.charges !== null) {
        active.charges -= 1;
      }
      const ticksThisTurn = ENEMY_TURN_TIMED_EFFECTS.has(active.effectId)
        ? mover !== owner
        : mover === owner;
      if (ticksThisTurn && active.remainingTurns !== null) {
        active.remainingTurns -= 1;
      }

      const expired = active.remainingTurns === 0 || active.charges === 0;
      if (expired) {
        triggered.push(historyEntry(moveCount, owner, active.effectId, "expired", triggered.length));
      } else {
        survivors.push(active);
      }
    }
    nextEffects[owner] = survivors;
  }

  return {
    clock: nextClock,
    activeEffects: nextEffects,
    history: [...history, ...triggered].slice(-120),
    boardChanged,
  };
}

export function chooseChaosEffectForBot(
  options: readonly ChaosEffectId[],
  chess: Chess,
  botColor: PieceColor,
  clock: ClockState,
  allowClockEffects = true,
): ChaosEffectId {
  const boardScoreBefore = scoreChaosPositionForBot(chess, botColor);
  const scores = options.map((id, index) => {
    const definition = CHAOS_EFFECT_BY_ID[id];
    let score = definition.rarity === "legendary" ? 30 : definition.rarity === "rare" ? 18 : 10;
    const missingMaterial = 39 - materialScore(chess, botColor);
    if (["second_wind", "phoenix_piece", "last_stand", "arcane_reserve", "soul_harvest"].includes(id)) score += missingMaterial;
    if (["hourglass", "blood_price", "time_thief", "bounty_hunter"].includes(id)) {
      score += clock[botColor] < 60_000 ? 28 : 4;
    }
    if (["chain_reaction", "chaos_swap", "piece_storm", "thorn_mail", "rook_forge", "prismatic_army"].includes(id)) score += 8;

    if (definition.duration === "instant") {
      const preview = new Chess(chess.fen());
      const seed = `bot-evaluate:${chess.fen()}:${botColor}:${id}`;
      const targets = chooseChaosTargetsForBot(preview, id, botColor, seed);
      const resolution = applyImmediateChaosEffect(
        preview,
        clock,
        id,
        botColor,
        seed,
        allowClockEffects,
        targets,
      );
      score += (scoreChaosPositionForBot(preview, botColor) - boardScoreBefore) / 10;
      score += (resolution.clock[botColor] - clock[botColor]) / 2_000;
    }

    return { id, score: score - index * 0.01 };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores[0].id;
}

/** Filters clock-only, impossible and already-active permanent cards. */
export function getAvailableChaosEffects(
  chess: Chess,
  owner: PieceColor,
  allowClockEffects = true,
  activeEffectIds: readonly ChaosEffectId[] = [],
): ChaosEffectId[] {
  return CHAOS_EFFECTS
    .map((definition) => definition.id)
    .filter((id) => allowClockEffects || !CLOCK_ONLY_EFFECTS.has(id))
    .filter((id) => {
      const definition = CHAOS_EFFECT_BY_ID[id];
      if (definition.duration === "permanent" && activeEffectIds.includes(id)) return false;
      switch (id) {
        case "blink":
          return canBlinkStrongestPiece(chess, owner);
        case "gravity_well":
          return canMoveStrongestToCenter(chess, owner);
        case "second_wind":
          return allowClockEffects || hasMissingPiece(chess, owner);
        case "knight_forge":
        case "bishop_forge":
        case "rook_forge":
          return countPieces(chess, owner, "p") > 0;
        case "queens_gambit":
          return allowClockEffects || (
            countPieces(chess, owner, "q") < STARTING_COUNTS.q
            && countPieces(chess, owner, "p") > 0
          );
        case "blood_price":
          return countPieces(chess, owner, "p") > 0;
        case "tactical_reset":
          return canSwapFriendlyPieces(chess, owner);
        case "chaos_swap":
          return canSwapOpposingPieces(chess, owner);
        case "piece_storm":
          return canRotateArmies(chess);
        case "arcane_reserve":
          return allowClockEffects || hasMissingMinor(chess, owner);
        case "crown_of_chance":
          return allowClockEffects || canSpawnPawn(chess, owner)
            || countPieces(chess, owner, "p") > 0;
        case "pawn_bloom":
          return canSpawnPawn(chess, owner);
        case "prismatic_army":
          return canCycleArmy(chess, owner);
        default:
          return true;
      }
    });
}

export function historyEntry(
  move: number,
  owner: PieceColor,
  effectId: ChaosEffectId,
  kind: ChaosHistoryEntry["kind"],
  sequence = 0,
): ChaosHistoryEntry {
  return {
    id: `${move}:${owner}:${effectId}:${kind}:${sequence}`,
    move,
    owner,
    effectId,
    kind,
  };
}

export function normalizeChaosSan(chess: Chess, originalSan: string): string {
  const baseSan = originalSan.replace(/[+#]+$/, "");
  if (chess.isCheckmate()) return `${baseSan}#`;
  if (chess.isCheck()) return `${baseSan}+`;
  return baseSan;
}

function allSquares(): Square[] {
  return FILES.flatMap((file) => RANKS.map((rank) => `${file}${rank}` as Square));
}

function piecesFor(chess: Chess, color: PieceColor, includeKing = true): { square: Square; type: PieceType }[] {
  const pieces: { square: Square; type: PieceType }[] = [];
  for (const square of allSquares()) {
    const piece = chess.get(square);
    if (piece?.color === color && (includeKing || piece.type !== "k")) {
      pieces.push({ square, type: piece.type as PieceType });
    }
  }
  return pieces;
}

function emptySquares(chess: Chess): Square[] {
  return allSquares().filter((square) => !chess.get(square));
}

function addTime(clock: ClockState, color: PieceColor, seconds: number): ClockState {
  return { ...clock, [color]: clock[color] + seconds * 1000 };
}

function subtractTime(clock: ClockState, color: PieceColor, seconds: number): ClockState {
  return { ...clock, [color]: Math.max(0, clock[color] - seconds * 1000) };
}

function putPawnAt(chess: Chess, color: PieceColor, square: Square): boolean {
  if (chess.get(square) || square[1] === "1" || square[1] === "8") return false;
  return chess.put({ type: "p", color }, square);
}

function spawnPawn(chess: Chess, color: PieceColor): boolean {
  const preferredRanks = color === "w" ? ["2", "3", "4"] : ["7", "6", "5"];
  for (const rank of preferredRanks) {
    for (const file of FILES) {
      const square = `${file}${rank}` as Square;
      if (putPawnAt(chess, color, square)) return true;
    }
  }
  return false;
}

function spawnPawns(chess: Chess, color: PieceColor, count: number): number {
  let spawned = 0;
  while (spawned < count && spawnPawn(chess, color)) spawned += 1;
  return spawned;
}

function canSpawnPawn(chess: Chess, color: PieceColor): boolean {
  const preferredRanks = color === "w" ? ["2", "3", "4"] : ["7", "6", "5"];
  return preferredRanks.some((rank) =>
    FILES.some((file) => !chess.get(`${file}${rank}` as Square)),
  );
}

function cycleArmy(chess: Chess, color: PieceColor): boolean {
  const nextType: Partial<Record<PieceType, PieceType>> = {
    n: "b",
    b: "r",
    r: "n",
  };
  let changed = false;
  for (const piece of piecesFor(chess, color, false)) {
    const replacement = nextType[piece.type];
    if (replacement) changed = replacePiece(chess, piece.square, color, replacement) || changed;
  }
  return changed;
}

function canCycleArmy(chess: Chess, color: PieceColor): boolean {
  return piecesFor(chess, color, false)
    .some((piece) => piece.type === "n" || piece.type === "b" || piece.type === "r");
}

function removePawn(chess: Chess, color: PieceColor): boolean {
  const pawns = piecesFor(chess, color, false)
    .filter((piece) => piece.type === "p")
    .sort((a, b) => color === "w" ? a.square[1].localeCompare(b.square[1]) : b.square[1].localeCompare(a.square[1]));
  if (!pawns[0]) return false;
  chess.remove(pawns[0].square);
  return true;
}

function removePawnAt(chess: Chess, color: PieceColor, square: Square): boolean {
  const piece = chess.get(square);
  if (!piece || piece.color !== color || piece.type !== "p") return false;
  chess.remove(square);
  return true;
}

function transformPawn(chess: Chess, color: PieceColor, type: PieceType): boolean {
  const pawn = piecesFor(chess, color, false)
    .filter((piece) => piece.type === "p")
    .sort((a, b) => color === "w" ? a.square[1].localeCompare(b.square[1]) : b.square[1].localeCompare(a.square[1]))[0];
  if (!pawn) return false;
  return replacePiece(chess, pawn.square, color, type);
}

function transformPawnAt(
  chess: Chess,
  color: PieceColor,
  square: Square,
  type: PieceType,
): boolean {
  const pawn = chess.get(square);
  if (!pawn || pawn.color !== color || pawn.type !== "p") return false;
  return replacePiece(chess, square, color, type);
}

function replacePiece(chess: Chess, square: Square, color: PieceColor, type: PieceType): boolean {
  const current = chess.get(square);
  if (!current || current.color !== color || current.type === "k") return false;
  if (type === "p" && (square[1] === "1" || square[1] === "8")) return false;
  chess.remove(square);
  return chess.put({ type, color }, square);
}

function countPieces(chess: Chess, color: PieceColor, type: PieceType): number {
  return piecesFor(chess, color).filter((piece) => piece.type === type).length;
}

function countNonRoyalPieces(chess: Chess, color: PieceColor): number {
  return piecesFor(chess, color, false).length;
}

function restoreStrongestMissing(chess: Chess, color: PieceColor): boolean {
  for (const type of ["q", "r", "b", "n", "p"] as const) {
    if (countPieces(chess, color, type) < STARTING_COUNTS[type] && restorePiece(chess, color, type)) return true;
  }
  return false;
}

function hasMissingPiece(chess: Chess, color: PieceColor): boolean {
  return (["q", "r", "b", "n", "p"] as const)
    .some((type) => countPieces(chess, color, type) < STARTING_COUNTS[type]);
}

function hasMissingMinor(chess: Chess, color: PieceColor): boolean {
  return countPieces(chess, color, "n") < STARTING_COUNTS.n
    || countPieces(chess, color, "b") < STARTING_COUNTS.b;
}

function restoreMissingMinor(chess: Chess, color: PieceColor): boolean {
  if (countPieces(chess, color, "n") < STARTING_COUNTS.n) return restorePiece(chess, color, "n");
  if (countPieces(chess, color, "b") < STARTING_COUNTS.b) return restorePiece(chess, color, "b");
  return false;
}

function restorePiece(chess: Chess, color: PieceColor, type: PieceType): boolean {
  if (type === "k") return false;
  const rank = color === "w" ? "1" : "8";
  const home: Record<Exclude<PieceType, "k">, string[]> = {
    p: FILES.map((file) => `${file}${color === "w" ? "2" : "7"}`),
    n: [`b${rank}`, `g${rank}`],
    b: [`c${rank}`, `f${rank}`],
    r: [`a${rank}`, `h${rank}`],
    q: [`d${rank}`],
  };
  const fallback = emptySquares(chess).filter((square) => type !== "p" || (square[1] !== "1" && square[1] !== "8"));
  const target = [...home[type as Exclude<PieceType, "k">], ...fallback].find((value) => !chess.get(value as Square));
  return target ? chess.put({ type, color }, target as Square) : false;
}

function getSelectedMovePairs(
  chess: Chess,
  color: PieceColor,
  effectId: "blink" | "gravity_well",
): [Square, Square][] {
  const sources = piecesFor(chess, color, false)
    .filter((piece) => piece.type !== "p")
    .filter((piece) => effectId !== "gravity_well" || !CENTRAL_SQUARES.includes(piece.square))
    .sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type])
    .slice(0, 3);
  const targets = effectId === "gravity_well"
    ? CENTRAL_SQUARES.filter((square) => !chess.get(square))
    : emptySquares(chess);
  const pairs: [Square, Square][] = [];

  for (const source of sources) {
    for (const target of targets) {
      if (isSelectedEffectSafe(chess, color, effectId, [source.square, target])) {
        pairs.push([source.square, target]);
      }
    }
  }
  return pairs;
}

function moveSelectedPiece(
  chess: Chess,
  color: PieceColor,
  source: Square,
  target: Square,
  destination: "anywhere" | "center",
): boolean {
  const piece = chess.get(source);
  if (
    !piece
    || piece.color !== color
    || piece.type === "k"
    || piece.type === "p"
    || chess.get(target)
    || (destination === "center" && !CENTRAL_SQUARES.includes(target))
  ) return false;

  chess.remove(source);
  if (chess.put(piece, target)) return true;
  chess.put(piece, source);
  return false;
}

function moveStrongestToCenter(chess: Chess, color: PieceColor, seed: string): boolean {
  const targets = CENTRAL_SQUARES.filter((square) => !chess.get(square));
  const pieces = piecesFor(chess, color, false)
    .filter((piece) => piece.type !== "p" && !CENTRAL_SQUARES.includes(piece.square))
    .sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type]);
  if (!targets.length || !pieces.length) return false;
  const source = pieces[hashString(`${seed}:source`) % Math.min(pieces.length, 2)];
  const target = targets[hashString(`${seed}:target`) % targets.length];
  chess.remove(source.square);
  return chess.put({ type: source.type, color }, target);
}

function blinkStrongestPiece(chess: Chess, color: PieceColor, seed: string): boolean {
  const targets = emptySquares(chess).filter((square) =>
    square[1] !== "1" && square[1] !== "8" && !CENTRAL_SQUARES.includes(square),
  );
  const pieces = piecesFor(chess, color, false)
    .filter((piece) => piece.type !== "p")
    .sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type]);
  if (!targets.length || !pieces.length) return false;
  const source = pieces[hashString(`${seed}:source`) % Math.min(pieces.length, 2)];
  const target = targets[hashString(`${seed}:blink`) % targets.length];
  chess.remove(source.square);
  return chess.put({ type: source.type, color }, target);
}

function canBlinkStrongestPiece(chess: Chess, color: PieceColor): boolean {
  return emptySquares(chess).length > 0
    && piecesFor(chess, color, false).some((piece) => piece.type !== "p");
}

function canMoveStrongestToCenter(chess: Chess, color: PieceColor): boolean {
  return CENTRAL_SQUARES.some((square) => !chess.get(square))
    && piecesFor(chess, color, false)
      .some((piece) => piece.type !== "p" && !CENTRAL_SQUARES.includes(piece.square));
}

function swapFriendlyPieces(chess: Chess, color: PieceColor, seed: string): boolean {
  const pieces = piecesFor(chess, color, false);
  const validPairs = getFriendlySwapPairs(pieces);
  if (!validPairs.length) return false;
  const [first, second] = validPairs[hashString(seed) % validPairs.length];
  return swapPieces(chess, first.square, second.square);
}

function getFriendlySwapPairs(
  pieces: { square: Square; type: PieceType }[],
): [{ square: Square; type: PieceType }, { square: Square; type: PieceType }][] {
  const pairs: [{ square: Square; type: PieceType }, { square: Square; type: PieceType }][] = [];
  for (let first = 0; first < pieces.length; first += 1) {
    for (let second = first + 1; second < pieces.length; second += 1) {
      const a = pieces[first];
      const b = pieces[second];
      if (a.type === b.type) continue;
      if (a.type === "p" && (b.square[1] === "1" || b.square[1] === "8")) continue;
      if (b.type === "p" && (a.square[1] === "1" || a.square[1] === "8")) continue;
      pairs.push([a, b]);
    }
  }
  return pairs;
}

function canSwapFriendlyPieces(chess: Chess, color: PieceColor): boolean {
  return getFriendlySwapPairs(piecesFor(chess, color, false)).length > 0;
}

function canSwapOpposingPieces(chess: Chess, color: PieceColor): boolean {
  return getOpposingSwapPairs(chess, color).length > 0;
}

function getOpposingSwapPairs(
  chess: Chess,
  color: PieceColor,
): [{ square: Square; type: PieceType }, { square: Square; type: PieceType }][] {
  const enemy: PieceColor = color === "w" ? "b" : "w";
  const pairs: [{ square: Square; type: PieceType }, { square: Square; type: PieceType }][] = [];
  for (const own of piecesFor(chess, color, false)) {
    for (const opponent of piecesFor(chess, enemy, false)) {
      if (own.type === "p" && (opponent.square[1] === "1" || opponent.square[1] === "8")) continue;
      if (opponent.type === "p" && (own.square[1] === "1" || own.square[1] === "8")) continue;
      pairs.push([own, opponent]);
    }
  }
  return pairs;
}

function swapOpposingPieces(chess: Chess, color: PieceColor, seed: string): boolean {
  const validPairs = getOpposingSwapPairs(chess, color);
  if (!validPairs.length) return false;
  const [own, opponent] = validPairs[hashString(seed) % validPairs.length];
  return swapPieces(chess, own.square, opponent.square);
}

function swapSelectedFriendlyPieces(
  chess: Chess,
  color: PieceColor,
  first: Square,
  second: Square,
): boolean {
  const valid = getFriendlySwapPairs(piecesFor(chess, color, false))
    .some(([a, b]) =>
      (a.square === first && b.square === second)
      || (a.square === second && b.square === first),
    );
  return valid && swapPieces(chess, first, second);
}

function swapSelectedOpposingPieces(
  chess: Chess,
  color: PieceColor,
  ownSquare: Square,
  opponentSquare: Square,
): boolean {
  const valid = getOpposingSwapPairs(chess, color)
    .some(([own, opponent]) =>
      own.square === ownSquare && opponent.square === opponentSquare,
    );
  return valid && swapPieces(chess, ownSquare, opponentSquare);
}

function isSelectedEffectSafe(
  chess: Chess,
  owner: PieceColor,
  effectId: ChaosEffectId,
  selectedSquares: readonly Square[],
): boolean {
  const preview = new Chess(chess.fen());
  return applyImmediateChaosEffect(
    preview,
    { w: 0, b: 0, running: null, lastTick: 0 },
    effectId,
    owner,
    `preview:${effectId}:${selectedSquares.join(":")}`,
    true,
    selectedSquares,
  ).boardChanged;
}

function swapPieces(chess: Chess, first: Square, second: Square): boolean {
  const firstPiece = chess.get(first);
  const secondPiece = chess.get(second);
  if (!firstPiece || !secondPiece || firstPiece.type === "k" || secondPiece.type === "k") return false;
  if (firstPiece.type === "p" && (second[1] === "1" || second[1] === "8")) return false;
  if (secondPiece.type === "p" && (first[1] === "1" || first[1] === "8")) return false;
  chess.remove(first);
  chess.remove(second);
  const firstPlaced = chess.put(secondPiece, first);
  const secondPlaced = chess.put(firstPiece, second);
  return firstPlaced && secondPlaced;
}

function rotateArmies(chess: Chess): boolean {
  let changed = false;
  for (const color of ["w", "b"] as const) {
    const pieces = piecesFor(chess, color, false).filter((piece) => piece.type !== "p");
    if (pieces.length < 2 || new Set(pieces.map((piece) => piece.type)).size < 2) continue;
    const types = pieces.map((piece) => piece.type);
    for (const piece of pieces) chess.remove(piece.square);
    for (let index = 0; index < pieces.length; index += 1) {
      const type = types[(index + types.length - 1) % types.length];
      chess.put({ type, color }, pieces[index].square);
    }
    changed = true;
  }
  return changed;
}

function canRotateArmies(chess: Chess): boolean {
  return (["w", "b"] as const).some((color) => {
    const types = piecesFor(chess, color, false)
      .filter((piece) => piece.type !== "p")
      .map((piece) => piece.type);
    return types.length >= 2 && new Set(types).size >= 2;
  });
}

function isChaosPositionSafe(chess: Chess): boolean {
  const turn = chess.turn() as PieceColor;
  const previousMover: PieceColor = turn === "w" ? "b" : "w";
  const whiteKings = piecesFor(chess, "w").filter((piece) => piece.type === "k");
  const blackKings = piecesFor(chess, "b").filter((piece) => piece.type === "k");
  if (whiteKings.length !== 1 || blackKings.length !== 1) return false;
  if (piecesFor(chess, "w").some((piece) => piece.type === "p" && /[18]/.test(piece.square[1]))) return false;
  if (piecesFor(chess, "b").some((piece) => piece.type === "p" && /[18]/.test(piece.square[1]))) return false;
  const previousKing = previousMover === "w" ? whiteKings[0] : blackKings[0];
  return !chess.isAttacked(previousKing.square, turn);
}

function isKingAttacked(chess: Chess, color: PieceColor): boolean {
  const king = piecesFor(chess, color).find((piece) => piece.type === "k");
  if (!king) return true;
  const opponent: PieceColor = color === "w" ? "b" : "w";
  return chess.isAttacked(king.square, opponent);
}

function materialScore(chess: Chess, color: PieceColor): number {
  return piecesFor(chess, color, false).reduce((sum, piece) => sum + PIECE_VALUE[piece.type], 0);
}

function scoreChaosPositionForBot(chess: Chess, owner: PieceColor): number {
  const opponent: PieceColor = owner === "w" ? "b" : "w";
  let score = (materialScore(chess, owner) - materialScore(chess, opponent)) * 100;

  for (const piece of piecesFor(chess, owner, false)) {
    const file = piece.square.charCodeAt(0) - 97;
    const rank = Number(piece.square[1]) - 1;
    const centrality = 7 - Math.abs(file - 3.5) - Math.abs(rank - 3.5);
    score += centrality * PIECE_VALUE[piece.type];
    if (chess.isAttacked(piece.square, opponent)) score -= PIECE_VALUE[piece.type] * 14;
    if (chess.isAttacked(piece.square, owner)) score += PIECE_VALUE[piece.type] * 3;
  }

  for (const piece of piecesFor(chess, opponent, false)) {
    if (chess.isAttacked(piece.square, owner)) score += PIECE_VALUE[piece.type] * 8;
  }

  return score;
}

function isBesideKing(chess: Chess, square: Square, color: PieceColor): boolean {
  const king = piecesFor(chess, color).find((piece) => piece.type === "k");
  if (!king || king.square === square) return false;
  const fileDistance = Math.abs(king.square.charCodeAt(0) - square.charCodeAt(0));
  const rankDistance = Math.abs(Number(king.square[1]) - Number(square[1]));
  return fileDistance <= 1 && rankDistance <= 1;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandom(value: number): number {
  let next = value + 0x6d2b79f5;
  next = Math.imul(next ^ (next >>> 15), next | 1);
  next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
  return (next ^ (next >>> 14)) >>> 0;
}
