from pathlib import Path
p=Path('/mnt/data/work_fix/src/lib/transfers/UserNegotiation.ts')
s=p.read_text()

# Insert helpers after hasOpenDealFor
old='''export function hasOpenDealFor(playerId: string): boolean {\n  return listOpenUserDeals().some((d) => d.playerId === playerId);\n}\n'''
new='''export function hasOpenDealFor(playerId: string): boolean {\n  return listOpenUserDeals().some((d) => d.playerId === playerId);\n}\n\n/** Número de ofertas recibidas todavía abiertas para un jugador del usuario.\n * Se permite competencia real entre varios clubes por el mismo jugador, pero\n * limitamos el número de ofertas abiertas por jugador para que una partida no\n * se convierta en una lluvia irreal de propuestas.\n */\nfunction openIncomingOffersForPlayer(playerId: string): UserDeal[] {\n  return listOpenUserDeals("out").filter((deal) => deal.playerId === playerId);\n}\n\nfunction hasOpenIncomingOfferFromClub(playerId: string, clubId: string): boolean {\n  return openIncomingOffersForPlayer(playerId).some((deal) => deal.otherClubId === clubId);\n}\n'''
assert old in s
s=s.replace(old,new)

# Replace generateOffersForUserPlayers body
start=s.index('function generateOffersForUserPlayers(userClubId: string, date: string): UserDealEvent[] {')
end=s.index('\nfunction loanCandidateScore', start)
new_func=r'''function generateOffersForUserPlayers(userClubId: string, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  if (windowForDate(date) === "closed") return events;

  const state = getSimulationState();
  const intensity = state?.intensity ?? 0.5;
  const deadline = deadlineToday(date);
  const chance = (deadline ? 0.6 : 0.3) * (0.5 + intensity);
  if (seededUnit("user-offers", userClubId, date) > chance) return events;

  // No limit global artificial de 3 ofertas abiertas. Permitimos competencia
  // entre varios clubes y, como máximo, dos nuevas ofertas de este tipo por día.
  const dailySlots = 2;
  const cacheKey = cacheKeyFor(date);
  const candidates = getClubPlayers(userClubId)
    .filter((p) => !p.loanClubId)
    .filter((p) => openIncomingOffersForPlayer(p.id).length < 3)
    .filter((p) => !hasRejectedDealFor(p.id, userClubId, date))
    .map((p) => ({
      player: p,
      weight:
        (p.transferListed ? 1 : 0) +
        (wantsOut(p.id, cacheKey) ? 0.8 : 0) +
        clamp((p.ovr - 74) / 20, 0, 0.7) +
        seededUnit("target", p.id, date) * 0.4,
    }))
    .sort((a, b) => b.weight - a.weight);

  let created = 0;
  for (const entry of candidates) {
    if (created >= dailySlots) break;
    const target = entry.player;
    const openForPlayer = openIncomingOffersForPlayer(target.id);
    if (openForPlayer.length >= 3) continue;

    const suitors = suitorsFor(target.id, userClubId, date)
      .filter((clubId) => !hasOpenIncomingOfferFromClub(target.id, clubId));
    if (suitors.length === 0) continue;

    // Elegimos un club distinto de los que ya están negociando con este jugador
    // para crear una competencia creíble, no tres tarjetas del mismo club.
    const buyerIndex = Math.min(
      suitors.length - 1,
      Math.floor(seededUnit("suitor", target.id, date, created) * suitors.length),
    );
    const buyerId = suitors[buyerIndex];
    const profile = getClubProfile(buyerId);
    const valuation = valuePlayer(target.id, { cacheKey, deadlineDay: deadline });

    const t = clamp(profile.aggression * 0.5 + profile.financialPower * 0.5, 0, 1);
    const base = valuation.minimumPrice + (valuation.idealPrice - valuation.minimumPrice) * t;
    const amount = Math.min(maxSpend(buyerId), Math.round(base / 100_000) * 100_000);
    if (amount <= 0) continue;

    const openingClauses = {
      ...emptyClauses(),
      ...proposeClauses(
        buyerId,
        valuation,
        Math.max(0, valuation.idealPrice - amount),
        `${date}-${target.id}-${buyerId}-opening`,
      ),
    };

    const offer = createTransferOffer({
      playerId: target.id,
      playerName: target.name,
      buyerClubId: buyerId,
      sellerClubId: userClubId,
      amount,
      wageOffer: Math.min(maxWageOffer(buyerId), wageDemand(target.id, buyerId)),
      clauses: openingClauses,
      date,
    });

    registerInterest({
      clubId: buyerId,
      playerId: target.id,
      amount,
      wageOffer: offer.wageOffer,
      date,
    });

    const buyerName = teamById(buyerId).name;
    const deal: UserDeal = {
      id: nextDealId(),
      direction: "out",
      playerId: target.id,
      playerName: target.name,
      userClubId,
      otherClubId: buyerId,
      offer,
      valuation,
      stage: "incoming",
      respondsOn: addDays(date, 3),
      clubDemand: 0,
      clubMessage:
        `${buyerName} ofrece ${fmt(amount)} por ${target.name}`
        + (offer.clauses.sellOnPercent > 0
          ? ` y ${Math.round(offer.clauses.sellOnPercent * 100)}% de futura venta.`
          : "."),
      playerWageDemand: 0,
      playerMessage: "",
      competition: competitionFor(target.id, userClubId),
      rounds: 1,
      createdOn: date,
      updatedOn: date,
      log: [{
        date,
        text:
          `Oferta recibida de ${buyerName}: ${fmt(amount)}`
          + (offer.clauses.sellOnPercent > 0
            ? ` con ${Math.round(offer.clauses.sellOnPercent * 100)}% de futura venta.`
            : "."),
      }],
    };
    deals.set(deal.id, deal);
    pushEvent(events, deal, deal.clubMessage, "info");
    created += 1;
  }

  return events;
}
'''
s=s[:start]+new_func+s[end:]

# Replace loan generation function
start=s.index('function generateLoanOffersForUserPlayers(userClubId: string, date: string): UserDealEvent[] {')
end=s.index('\n// ============================================================================\n// RESPUESTA DEL USUARIO A UNA OFERTA RECIBIDA', start)
new_func=r'''function generateLoanOffersForUserPlayers(userClubId: string, date: string): UserDealEvent[] {
  const events: UserDealEvent[] = [];
  if (windowForDate(date) === "closed") return events;
  if (seededUnit("loan-offers", userClubId, date) > 0.38) return events;

  // Igual que en los traspasos, no hay límite global de tres ofertas recibidas.
  // Se permite competencia por un mismo jugador, con un máximo de tres ofertas
  // abiertas de clubes distintos y dos nuevas ofertas de cesión como máximo por día.
  const dailySlots = 2;
  const cacheKey = cacheKeyFor(date);
  const candidates = getClubPlayers(userClubId)
    .filter((p) => !p.loanClubId)
    .filter((p) => openIncomingOffersForPlayer(p.id).length < 3)
    .filter((p) => !hasRejectedDealFor(p.id, userClubId, date))
    .filter((p) => !isKeyPlayer(p.id, cacheKey) && p.ovr < 88)
    .map((player) => ({ player, score: loanCandidateScore(player, cacheKey) }))
    .filter(({ score }) => score >= 1.0)
    .sort((a, b) => b.score - a.score);

  let created = 0;
  for (const { player } of candidates) {
    if (created >= dailySlots) break;
    if (openIncomingOffersForPlayer(player.id).length >= 3) continue;

    const suitors = loanSuitorsFor(player.id, userClubId, date)
      .filter((clubId) => !hasOpenIncomingOfferFromClub(player.id, clubId));
    if (suitors.length === 0) continue;

    const borrowerId = suitors[Math.floor(seededUnit("loan-suitor", player.id, date, created) * suitors.length)];
    const typeRoll = seededUnit("loan-type", player.id, borrowerId, date);
    const type: Extract<TransferType, "loan" | "loan-option" | "loan-obligation"> =
      typeRoll < 0.72 ? "loan" : typeRoll < 0.93 ? "loan-option" : "loan-obligation";
    const clauses = {
      ...buildLoanTerms(player.id, type, `${player.id}-${borrowerId}-${date}`),
      squadRole: minimumSquadRole(player.id, borrowerId, cacheKey),
    };
    const fee = seededUnit("loan-fee", player.id, borrowerId, date) < 0.65
      ? 0
      : Math.max(0, Math.round(player.value * (0.005 + seededUnit("loan-fee-rate", player.id, borrowerId, date) * 0.02) / 100_000) * 100_000);

    const offer = createTransferOffer({
      playerId: player.id,
      playerName: player.name,
      buyerClubId: borrowerId,
      sellerClubId: userClubId,
      amount: fee,
      wageOffer: player.contract.wage,
      type,
      clauses: { ...clauses, loanDurationMonths: defaultLoanDuration(date) },
      date,
    });
    const valuation = valuePlayer(player.id, { cacheKey, deadlineDay: deadlineToday(date) });
    const borrowerName = teamById(borrowerId).name;
    const deal: UserDeal = {
      id: nextDealId(),
      direction: "out",
      playerId: player.id,
      playerName: player.name,
      userClubId,
      otherClubId: borrowerId,
      offer,
      valuation,
      stage: "incoming",
      respondsOn: addDays(date, 3),
      clubDemand: fee,
      clubMessage: `${borrowerName} ofrece hacerse cargo de parte de la ficha de ${player.name} y le reserva un rol de ${playerRoleLabel(clauses.squadRole ?? "rotation")}.`,
      playerWageDemand: 0,
      playerMessage: "",
      competition: 0,
      rounds: 1,
      outgoingCounterRounds: 0,
      clubResponseDeadline: addDays(date, 3),
      createdOn: date,
      updatedOn: date,
      log: [{
        date,
        text: `Oferta de cesión desde ${borrowerName}: ${fmt(fee)} de prima, mi club paga el ${myClubLoanWageSharePercent("out", clauses.wageShare)}% de la ficha y rol ${playerRoleLabel(clauses.squadRole ?? "rotation")}.`,
      }],
    };
    deals.set(deal.id, deal);
    pushEvent(events, deal, `Oferta de cesión recibida por ${player.name} desde ${borrowerName}.`, "info");
    created += 1;
  }
  return events;
}
'''
s=s[:start]+new_func+s[end:]

# Remove global cap in normal offer generation if any lingering
s=s.replace('  if (listOpenUserDeals("out").length >= 3) return events;\n', '')

# Fix share acceptance semantics in outgoing loan response.
s=s.replace('  const shareAcceptable = askedShare <= clubOfferShare;\n', '  const shareAcceptable = askedShare >= clubOfferShare;\n')

p.write_text(s)
