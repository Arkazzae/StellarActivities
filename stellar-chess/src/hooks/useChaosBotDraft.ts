import { useEffect } from "react";
import { CHAOS_EFFECT_BY_ID, chooseChaosEffectForBot, type ChaosEffectId } from "@/engine/chaos";
import { CHAOS_TASTE, getOpponent, type ChaosCharacterId } from "@/ai/bots";
import { triggerChat } from "@/ai/bot-chat";
import { isUnlimited } from "@/engine/clock";
import { useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import { effectName } from "@/components/chaos/meta";
import { t } from "@/i18n";

/** Chaos Chess: a bot picks its card from the draft after a short look, like a person would. */
export function useChaosBotDraft() {
  const draft = useGameStore((state) => state.chaos.draft);
  const seats = useGameStore((state) => state.seats);
  const phase = useGameStore((state) => state.phase);

  useEffect(() => {
    if (!draft || phase !== "playing" || !seats[draft.chooser]) return;
    const timer = window.setTimeout(() => {
      const { chess, clock, timeControl, chooseChaosEffect, chaos } = useGameStore.getState();
      if (chaos.draft !== draft) return;
      const seat = useGameStore.getState().seats[draft.chooser];
      const best = chooseChaosEffectForBot(draft.options, chess, draft.chooser, clock, !isUnlimited(timeControl));
      const card = withTaste(seat?.id, draft.options, best);
      if (!chooseChaosEffect(card)) return;
      if (seat) triggerChat("card", getOpponent(seat.id));
      const name = useGameStore.getState().players[draft.chooser]?.username ?? t(`side.${draft.chooser}`);
      useUiStore.getState().showToast(t("chaos.botPicked", { name, card: effectName(card) }));
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [draft, phase, seats]);
}

/** A Chaos character reaches for its favourite kind of card, most of the time; anyone else takes the engine's pick. */
export function withTaste(id: string | undefined, options: readonly ChaosEffectId[], best: ChaosEffectId, roll = Math.random()): ChaosEffectId {
  const taste = id && id in CHAOS_TASTE ? CHAOS_TASTE[id as ChaosCharacterId] : null;
  if (!taste?.favorite || roll >= taste.loyalty) return best;
  const favourites = options.filter((option) => CHAOS_EFFECT_BY_ID[option].category === taste.favorite);
  if (!favourites.length || favourites.includes(best)) return best;
  // Of its favourites, the rarest card.
  const rank = { legendary: 0, rare: 1, common: 2 } as const;
  return [...favourites].sort((a, b) => rank[CHAOS_EFFECT_BY_ID[a].rarity] - rank[CHAOS_EFFECT_BY_ID[b].rarity])[0];
}
