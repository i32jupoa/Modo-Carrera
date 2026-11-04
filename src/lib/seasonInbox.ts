/** Tipos y reglas puras para los comunicados persistentes del buzón de temporada. */
export type SeasonNotificationType =
  | "contract_expired"
  | "contract_one_year"
  | "contract_expiring_soon"
  | "player_retired"
  | "promoted"
  | "relegated"
  | "season_started"
  | "player_injured"
  | "player_recovered"
  | "player_of_round"
  | "player_of_month"
  | "player_of_european_round"
  | "release_clause_paid"
  | "financial_income";

export interface SeasonInboxNotification {
  id: string;
  type: SeasonNotificationType;
  season: string;
  date: string;
  playerId?: string;
  playerName?: string;
  teamId?: string;
  message: string;
  /** Importe ingresado por conceptos ajenos a fichajes. */
  amount?: number;
  /** Origen legible del ingreso (premio UEFA, liquidación anual, etc.). */
  category?: string;
  read?: boolean;
}


export function addFinancialIncomeNotification(
  existing: SeasonInboxNotification[],
  input: {
    id: string;
    season: string;
    date: string;
    teamId: string;
    amount: number;
    category: string;
    message: string;
  },
): SeasonInboxNotification[] {
  const amount = Math.max(0, Math.round(Number(input.amount) || 0));
  if (!input.id || amount <= 0 || existing.some((item) => item.id === input.id)) return existing;
  return [...existing, {
    id: input.id,
    type: "financial_income",
    season: input.season,
    date: input.date,
    teamId: input.teamId,
    amount,
    category: input.category,
    message: input.message,
    read: false,
  }].slice(-250);
}

export interface RecoveryCandidate {
  id: string;
  name: string;
  injuryStartDate?: string;
  injuredUntilDate?: string;
}

export interface ExpiringContractCandidate {
  playerId: string;
  playerName: string;
  expiresAt: string;
}

function utcDay(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Number.NaN;
  const value = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(value) ? Math.floor(value / 86_400_000) : Number.NaN;
}

/**
 * Genera avisos de recuperación y contratos próximos a vencer.
 * Los IDs son deterministas para que saltos de calendario/reintentos no dupliquen mensajes.
 */
export function addSquadMilestoneNotifications(args: {
  existing: SeasonInboxNotification[];
  season: string;
  date: string;
  teamId: string;
  recoveries: RecoveryCandidate[];
  expiringContracts: ExpiringContractCandidate[];
}): SeasonInboxNotification[] {
  const output = [...args.existing];
  const known = new Set(output.map((item) => item.id));
  const today = utcDay(args.date);
  if (!Number.isFinite(today)) return output;

  for (const player of args.recoveries) {
    const start = player.injuryStartDate;
    const until = player.injuredUntilDate;
    if (!start || !until || !/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    const recoveryDay = utcDay(until);
    // Publica el aviso en la fecha de vuelta o, si se ha saltado un día, dentro
    // de la semana siguiente. No rescata lesiones ya recuperadas hace meses.
    const daysSinceRecovery = today - recoveryDay;
    if (!Number.isFinite(recoveryDay) || daysSinceRecovery < 0 || daysSinceRecovery > 7) continue;
    const id = `${args.season}:player_recovered:${player.id}:${start}:${until}`;
    if (known.has(id)) continue;
    output.push({
      id,
      type: "player_recovered",
      season: args.season,
      date: until,
      playerId: player.id,
      playerName: player.name,
      teamId: args.teamId,
      message: `${player.name} se ha recuperado de su lesión y vuelve a estar disponible para el equipo.`,
      read: false,
    });
    known.add(id);
  }

  for (const contract of args.expiringContracts) {
    const expiryDay = utcDay(contract.expiresAt);
    const daysRemaining = expiryDay - today;
    if (!Number.isFinite(expiryDay) || daysRemaining < 0) continue;

    // Primer aviso al entrar en el último año (con una ventana de 45 días para
    // absorber pequeños saltos de calendario). Si ya quedan menos de 320 días,
    // se reserva el aviso para los últimos tres meses y no se genera uno atrasado.
    if (daysRemaining <= 365 && daysRemaining >= 320) {
      const id = `${args.season}:contract_one_year:${contract.playerId}:${contract.expiresAt}`;
      if (!known.has(id)) {
        output.push({
          id,
          type: "contract_one_year",
          season: args.season,
          date: args.date,
          playerId: contract.playerId,
          playerName: contract.playerName,
          teamId: args.teamId,
          message: `A ${contract.playerName} le queda aproximadamente un año de contrato. Su vinculación termina el ${contract.expiresAt}. Es buen momento para empezar a valorar su renovación.`,
          read: false,
        });
        known.add(id);
      }
    }

    // Segundo aviso al entrar en los últimos tres meses de contrato.
    if (daysRemaining <= 90) {
      const id = `${args.season}:contract_expiring_soon:${contract.playerId}:${contract.expiresAt}`;
      if (known.has(id)) continue;
      const monthsRemaining = Math.max(1, Math.ceil(daysRemaining / 30));
      const duration = monthsRemaining === 1 ? "aproximadamente un mes" : `aproximadamente ${monthsRemaining} meses`;
      output.push({
        id,
        type: "contract_expiring_soon",
        season: args.season,
        date: args.date,
        playerId: contract.playerId,
        playerName: contract.playerName,
        teamId: args.teamId,
        message: `A ${contract.playerName} le quedan ${duration} de contrato. Su vinculación termina el ${contract.expiresAt}. Es buen momento para decidir si quieres ofrecerle una renovación.`,
        read: false,
      });
      known.add(id);
    }
  }

  return output.slice(-250);
}

/** Elimina avisos de hat-trick antiguos de partidas creadas con versiones previas. */
export function removeHatTrickInboxNotifications<T extends { type: string }>(items: T[]): T[] {
  return items.filter((item) => item.type !== "player_hat_trick");
}
