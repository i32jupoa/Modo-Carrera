import { TEAMS, teamById } from "@/data/teams";
import { Player } from "@/data/players";

export type Offer = {
  id: string;
  playerId: string;
  fromTeamId: string;  // team making the offer
  toTeamId: string;    // team receiving
  amount: number;      // millions €
  direction: "incoming" | "outgoing"; // incoming = AI offering for our player
  status: "pending" | "accepted" | "rejected" | "countered";
  counterAmount?: number;
  createdMatchday: number;
};

const STARTING_BUDGET_BY_OVR = (ovr: number): number => {
  // Top clubs ~250M, mid ~80M, small ~15M
  return Math.round(Math.pow(Math.max(60, ovr) / 60, 3.5) * 15);
};

export function initialBudgets(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TEAMS) {
    const ovr = Math.round((t.att + t.mid + t.def) / 3);
    out[t.id] = STARTING_BUDGET_BY_OVR(ovr);
  }
  return out;
}

/** Generate incoming offers for our transferable + occasionally unsolicited for stars. */
export function generateIncomingOffers(args: {
  myTeamId: string;
  myPlayers: Player[];
  transferList: Set<string>;
  budgets: Record<string, number>;
  matchday: number;
}): Offer[] {
  const { myTeamId, myPlayers, transferList, budgets, matchday } = args;
  const offers: Offer[] = [];
  const otherTeams = TEAMS.filter((t) => t.id !== myTeamId);

  // Offers for transfer-listed players (high probability)
  for (const playerId of transferList) {
    const p = myPlayers.find((x) => x.id === playerId);
    if (!p) continue;
    // 0-2 offers per listed player
    const numOffers = Math.random() < 0.7 ? 1 : Math.random() < 0.5 ? 2 : 0;
    for (let i = 0; i < numOffers; i++) {
      const bidder = pickBidder(p, otherTeams, budgets);
      if (!bidder) continue;
      const offerMult = 0.6 + Math.random() * 0.6; // 60%-120% of market value
      const amount = Math.round(p.marketValue * offerMult * 10) / 10;
      if (budgets[bidder.id] < amount) continue;
      offers.push({
        id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        playerId: p.id, fromTeamId: bidder.id, toTeamId: myTeamId,
        amount, direction: "incoming", status: "pending", createdMatchday: matchday,
      });
    }
  }

  // Occasional unsolicited offer for stars (rating ≥ 84, not listed)
  for (const p of myPlayers) {
    if (transferList.has(p.id)) continue;
    if (p.rating < 84) continue;
    if (Math.random() > 0.04) continue;
    const bidder = pickBidder(p, otherTeams.filter((t) => {
      const tov = (t.att + t.mid + t.def) / 3;
      return tov >= 80; // only big clubs lowball stars
    }), budgets);
    if (!bidder) continue;
    const offerMult = 0.7 + Math.random() * 0.5; // lower since unsolicited
    const amount = Math.round(p.marketValue * offerMult * 10) / 10;
    if (budgets[bidder.id] < amount) continue;
    offers.push({
      id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      playerId: p.id, fromTeamId: bidder.id, toTeamId: myTeamId,
      amount, direction: "incoming", status: "pending", createdMatchday: matchday,
    });
  }
  return offers;
}

function pickBidder(p: Player, candidates: typeof TEAMS, budgets: Record<string, number>) {
  const ovr = p.rating;
  // bidder strength loosely matches player rating
  const eligible = candidates.filter((t) => {
    const tov = (t.att + t.mid + t.def) / 3;
    return budgets[t.id] >= p.marketValue * 0.5 && Math.abs(tov - ovr) < 12;
  });
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

/**
 * Evaluate an outgoing offer (player decides to accept or reject).
 * Returns { accepted, reason }.
 */
export function evaluateOutgoingOffer(args: {
  player: Player;
  amount: number;
  buyerOvr: number;
  sellerOvr: number;
}): { accepted: boolean; reason: string } {
  const { player, amount, buyerOvr, sellerOvr } = args;
  const ratio = amount / Math.max(player.marketValue, 0.5);
  // Buyer must be similar or stronger
  const prestigeGap = buyerOvr - sellerOvr;
  let score = (ratio - 1) * 100 + prestigeGap * 2;
  // Star players harder to prise away
  if (player.rating >= 85) score -= 25;
  if (player.rating >= 88) score -= 20;
  const accept = score > 0;
  return {
    accepted: accept,
    reason: accept
      ? ratio >= 1.2 ? "Oferta muy por encima del valor de mercado"
        : prestigeGap >= 3 ? "Salto de categoría para el jugador"
        : "Oferta razonable"
      : ratio < 0.8 ? "Oferta muy por debajo del valor"
        : player.rating >= 85 ? "Pieza intransferible del proyecto"
        : "El club rechaza la oferta",
  };
}

/** Generate a counter-offer from AI club when seller rejects but is open. */
export function generateCounter(amount: number, player: Player): number | null {
  if (Math.random() > 0.5) return null;
  const target = player.marketValue * (1 + Math.random() * 0.25);
  if (target <= amount) return null;
  return Math.round(target * 10) / 10;
}
