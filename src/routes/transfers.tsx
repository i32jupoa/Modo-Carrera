import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadSave, SaveGame } from "@/lib/store";
import { getCurrentSaveId } from "@/lib/savedGames";
import { TEAMS, teamById, getAllTeams, LeagueId, LEAGUES, leagueIdFromName } from "@/data/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { LeagueLogo } from "@/components/LeagueLogo";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  usePlayersStore,
  formatEuro,
  FcPlayer,
  clubOfPlayer,
  fcPlayerById,
} from "@/store/playersStore";
import { getPlayerAnnualWage, getPlayer, isPlayerSettled, hasRejectedDealFor } from "@/lib/transfers";
import { Search, Wallet, UserPlus, Filter, X, Banknote, Coins, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Radar, Eye, Clock3, Trash2, LockKeyhole } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useTransferMarket } from "@/hooks/useTransferMarket";
import { MarketStatusBanner } from "@/components/MarketStatusBanner";
import { useUserMarket } from "@/hooks/useUserMarket";
import { NegotiationModal } from "@/components/market/NegotiationModal";
import { ALL_POS_CODES, buildPositions, POS_SHORT, formatShortPositions, type PosCode } from "@/lib/positions";
import { DealCard } from "@/components/market/DealCard";
import { MarketFeed } from "@/components/market/MarketFeed";
import { TransferHistoryCard } from "@/components/market/TransferHistoryCard";
import { NegotiationDetailsModal } from "@/components/market/NegotiationDetailsModal";
import { ScoutingDetailsModal } from "@/components/market/ScoutingDetailsModal";
import { useNotificationsStore } from "@/store/notificationsStore";
import { getClubScout } from "@/lib/transfers";
import type { ScoutingReport, UserDeal } from "@/lib/transfers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Helper to get league name from league ID
function getLeagueName(leagueId: string): string {
  return LEAGUES[leagueId as LeagueId]?.name || leagueId;
}


// Filter state: age/media are free numeric ranges and positions are multi-select.
type SortField = "ovr" | "age";
type SortOrder = "asc" | "desc";

type NumericFilterValue = number | "";

interface FilterState {
  positions: PosCode[];
  league: LeagueId | "all";
  team: string;
  ageMin: NumericFilterValue;
  ageMax: NumericFilterValue;
  ratingMin: NumericFilterValue;
  ratingMax: NumericFilterValue;
  sortField: SortField;
  sortOrder: SortOrder;
}

interface FilterOption<T> {
  value: T;
  label: string;
}

const POSITION_OPTIONS: PosCode[] = ALL_POS_CODES;


type MarketBadgeSection = "scouted" | "deals" | "offers";

const MARKET_BADGE_SEEN_PREFIX = "fcsim:market-badges:v1:";

function marketBadgeSeenKey(section: MarketBadgeSection): string | null {
  const saveId = getCurrentSaveId();
  return saveId ? `${MARKET_BADGE_SEEN_PREFIX}${saveId}:${section}` : null;
}

function readMarketBadgeSeen(section: MarketBadgeSection): Set<string> {
  if (typeof window === "undefined") return new Set();
  const key = marketBadgeSeenKey(section);
  if (!key) return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeMarketBadgeSeen(section: MarketBadgeSection, ids: string[]): void {
  if (typeof window === "undefined") return;
  const key = marketBadgeSeenKey(section);
  if (!key) return;
  try {
    const previous = readMarketBadgeSeen(section);
    for (const id of ids) previous.add(id);
    // Avoid unbounded growth while keeping enough history to distinguish
    // persistent operations from genuinely new ones.
    const compact = Array.from(previous).slice(-2000);
    window.localStorage.setItem(key, JSON.stringify(compact));
  } catch {
    // Las insignias son informativas; nunca deben bloquear el mercado.
  }
}

function unseenMarketBadgeCount(section: MarketBadgeSection, ids: string[]): number {
  const seen = readMarketBadgeSeen(section);
  return ids.reduce((count, id) => count + (seen.has(id) ? 0 : 1), 0);
}

const SORT_FIELD_OPTIONS: FilterOption<SortField>[] = [
  { value: "ovr", label: "Media" },
  { value: "age", label: "Edad" },
];

const SORT_ORDER_OPTIONS: FilterOption<SortOrder>[] = [
  { value: "desc", label: "Descendente" },
  { value: "asc", label: "Ascendente" },
];

// Helper to get all leagues with proper names and flags
function getLeaguesFromTeams(): FilterOption<LeagueId | "all">[] {
  const allLeagues = Object.values(LEAGUES);
  return [
    { value: "all", label: "Liga: Todas" },
    ...allLeagues.map((l) => ({
      value: l.id as LeagueId,
      label: `${l.flag} ${l.name}`,
    })),
  ];
}

// Helper to get teams for a specific league
function getTeamsForLeague(league: LeagueId | "all"): FilterOption<string>[] {
  if (league === "all") return [{ value: "all", label: "Equipo: Todos" }];
  const teams = getAllTeams().filter((t) => t.league === league);
  return [
    { value: "all", label: "Equipo: Todos" },
    ...teams.map((t) => ({ value: t.name, label: t.name })),
  ];
}

// Combined filter logic
function applyFilters(
  players: FcPlayer[],
  filters: FilterState,
  inRoster: Set<string>,
  searchQuery: string,
): FcPlayer[] {
  return players.filter((p) => {
    const id = String(p.ID);

    // Exclude players in user's roster
    if (inRoster.has(id)) return false;

    // Search query filter
    if (searchQuery && !p.Name.toLowerCase().includes(searchQuery)) return false;

    // Position filter: match any of the player's detailed positions or alternatives.
    if (filters.positions.length > 0) {
      const playerPositions = buildPositions(p.Position, p["Alternative positions"]);
      if (!playerPositions.some((position) => filters.positions.includes(position))) return false;
    }

    // League filter - use player's League field converted to ID
    if (filters.league !== "all") {
      const playerLeagueId = leagueIdFromName(p.League);
      if (playerLeagueId !== filters.league) return false;
    }

    // Team filter
    if (filters.team !== "all" && p.Team !== filters.team) return false;

    // Age range filter
    if (filters.ageMin !== "" && p.Age < filters.ageMin) return false;
    if (filters.ageMax !== "" && p.Age > filters.ageMax) return false;

    // Rating range filter
    if (filters.ratingMin !== "" && p.OVR < filters.ratingMin) return false;
    if (filters.ratingMax !== "" && p.OVR > filters.ratingMax) return false;

    return true;
  });
}

export const Route = createFileRoute("/transfers")({
  // Permite llegar desde Equipos con ?q=nombre&player=id
  // `q` NO lleva `?`: la implementación de abajo siempre devuelve string
  // (con "" de fallback), nunca undefined — marcarlo opcional aquí era
  // mentira de cara a TypeScript y hacía que `search.trim()` en
  // TransfersPage tuviera que tratarlo como `string | undefined` sin
  // motivo real. `player` sí se deja opcional a propósito: hay enlaces
  // (p. ej. en teams.tsx, el botón "Ver en el mercado") que navegan aquí
  // pasando sólo `q`, sin `player`.
  validateSearch: (search: Record<string, unknown>): { q: string; player?: string } => ({
    q: typeof search.q === "string" ? search.q : "",
    player: typeof search.player === "string" ? search.player : "",
  }),
  component: TransfersPage,
});

const TEAM_NAME_TO_ID: Record<string, string> = Object.fromEntries(
  TEAMS.map((t) => [t.name, t.id]),
);

function ovrBadgeClass(ovr: number): string {
  if (ovr >= 85) return "bg-green-500/20 text-green-300 border-green-500/40";
  if (ovr >= 75) return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
  return "bg-muted text-muted-foreground border-border/40";
}

type MarketTab = "market" | "scouted" | "deals" | "offers" | "entries" | "exits" | "feed";

const TABS: { value: MarketTab; label: string }[] = [
  { value: "market", label: "Buscar jugadores" },
  { value: "scouted", label: "Jugadores ojeados" },
  { value: "deals", label: "Mis negociaciones" },
  { value: "offers", label: "Ofertas recibidas" },
  { value: "entries", label: "Entradas" },
  { value: "exits", label: "Salidas" },
  { value: "feed", label: "Rumores y traspasos" },
];

const LOAN_OFFER_TYPES = new Set<UserDeal["offer"]["type"]>([
  "loan",
  "loan-option",
  "loan-obligation",
]);

function isLoanOffer(deal: UserDeal): boolean {
  return LOAN_OFFER_TYPES.has(deal.offer.type);
}

function groupIncomingOffersByPlayer(deals: UserDeal[]): Array<[string, UserDeal[]]> {
  const groups = new Map<string, UserDeal[]>();
  for (const deal of deals) {
    const key = deal.playerId || deal.playerName;
    const current = groups.get(key);
    if (current) current.push(deal);
    else groups.set(key, [deal]);
  }
  return Array.from(groups.entries());
}

function TransfersPage() {
  const navigate = useNavigate();
  const { q: initialQuery, player: initialPlayerId } = Route.useSearch();
  const { loading, ready } = usePlayersReady();
  const budget = usePlayersStore((s) => s.budget);
  const wageBudget = usePlayersStore((s) => s.wageBudget);
  const wageBill = usePlayersStore((s) => s.wageBill);
  const setWageBudget = usePlayersStore((s) => s.setWageBudget);
  const totalEconomicBudget = budget;
  const myTeamId = usePlayersStore((s) => s.myTeamId);
  const effectiveEconomicBudget = totalEconomicBudget;
  const transferBudget = Math.max(0, totalEconomicBudget - wageBudget);
  const rawPlayers = usePlayersStore((s) => s.getRawPlayers?.() || []);
  const setMyTeam = usePlayersStore((s) => s.setMyTeam);
  const rosterIds = usePlayersStore((s) => s.rosterIds);
  const { isMarketOpen } = useTransferMarket();
  const market = useUserMarket(ready);

  const incomingTransferGroups = useMemo(
    () => groupIncomingOffersByPlayer(market.incoming.filter((deal) => !isLoanOffer(deal))),
    [market.incoming],
  );
  const incomingLoanGroups = useMemo(
    () => groupIncomingOffersByPlayer(market.incoming.filter((deal) => isLoanOffer(deal))),
    [market.incoming],
  );

  const [save, setSave] = useState<SaveGame | null>(null);
  const [search, setSearch] = useState(initialQuery);
  const [showFilters, setShowFilters] = useState(false);
  const [positionPickerOpen, setPositionPickerOpen] = useState(false);
  const [tab, setTab] = useState<MarketTab>("market");
  const markSectionRead = useNotificationsStore((s) => s.markSectionRead);

  useEffect(() => {
    if (tab === "offers") markSectionRead("offers");
    if (tab === "deals") markSectionRead("deals");
  }, [tab, markSectionRead]);

  // Jugador seleccionado para negociar y su informe de ojeadores.
  const [target, setTarget] = useState<FcPlayer | null>(null);
  const [report, setReport] = useState<ScoutingReport | null>(null);
  const [scoutingDetailsPlayer, setScoutingDetailsPlayer] = useState<FcPlayer | null>(null);
  const [scoutingDetailsReport, setScoutingDetailsReport] = useState<ScoutingReport | null>(null);
  const [removeScoutingId, setRemoveScoutingId] = useState<string | null>(null);
  const [detailsRecord, setDetailsRecord] = useState<import("@/lib/transfers").TransferRecord | null>(null);
  const [detailsDirection, setDetailsDirection] = useState<"in" | "out">("in");

  const [filters, setFilters] = useState<FilterState>({
    positions: [],
    league: "all",
    team: "all",
    ageMin: "",
    ageMax: "",
    ratingMin: "",
    ratingMax: "",
    sortField: "ovr",
    sortOrder: "desc",
  });

  useEffect(() => {
    setFilters((prev) => ({ ...prev, team: "all" }));
  }, [filters.league]);

  useEffect(() => {
    const s = loadSave();
    if (!s) {
      navigate({ to: "/" });
      return;
    }
    setSave(s);
    if (!myTeamId) setMyTeam(s.myTeamId);
  }, [navigate, myTeamId, setMyTeam]);

  const inRoster = useMemo(() => new Set<string>(rosterIds as string[]), [rosterIds]);

  // Si llegamos desde Equipos con un jugador concreto, abrimos su negociación.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!ready || autoOpened.current || !initialPlayerId) return;
    const found = (rawPlayers as FcPlayer[]).find((p) => String(p.ID) === initialPlayerId);
    if (!found) return;
    autoOpened.current = true;
    setTab("market");
    setTarget(found);
    const scoutingEntry = scoutingMap.get(String(found.ID));
    setReport(scoutingEntry?.status === "completed" ? market.scout(String(found.ID)) : null);
  }, [ready, initialPlayerId, rawPlayers, market]);

  const players = useMemo(() => {
    if (!ready) return [];
    const filtered = applyFilters(rawPlayers, filters, inRoster, search.trim().toLowerCase());
    const sorted = [...filtered].sort((a, b) => {
      const comparison = filters.sortField === "age" ? a.Age - b.Age : a.OVR - b.OVR;
      return filters.sortOrder === "asc" ? comparison : -comparison;
    });
    return sorted.slice(0, 250);
  }, [ready, filters, inRoster, search, rawPlayers]);

  const scoutingMap = useMemo(() => {
    const map = new Map<string, import("@/lib/transfers").ScoutingEntry>();
    for (const entry of market.scouting) map.set(entry.playerId, entry);
    return map;
  }, [market.scouting]);

  const scoutedPlayers = useMemo(() => {
    const playersById = new Map((rawPlayers as FcPlayer[]).map((player) => [String(player.ID), player]));
    return market.scouting
      .map((entry) => ({ entry, player: playersById.get(entry.playerId) }))
      .filter((item): item is { entry: import("@/lib/transfers").ScoutingEntry; player: FcPlayer } => Boolean(item.player));
  }, [market.scouting, rawPlayers]);

  const hiredScout = market.ready ? getClubScout(market.currentDate) : null;


  const activeFiltersCount = useMemo(() => {
    return (
      (filters.positions.length > 0 ? 1 : 0) +
      (filters.league !== "all" ? 1 : 0) +
      (filters.team !== "all" ? 1 : 0) +
      (filters.ageMin !== "" || filters.ageMax !== "" ? 1 : 0) +
      (filters.ratingMin !== "" || filters.ratingMax !== "" ? 1 : 0)
    );
  }, [filters]);

  const leagueOptions = useMemo(() => getLeaguesFromTeams(), []);
  const teamOptions = useMemo(() => getTeamsForLeague(filters.league), [filters.league]);

  const userEntries = useMemo(
    () =>
      market.history.filter(
        (record) => record.toClubId === myTeamId && record.fromClubId !== myTeamId,
      ),
    [market.history, myTeamId],
  );
  const userExits = useMemo(
    () => market.history.filter((record) => record.fromClubId === myTeamId && record.toClubId !== myTeamId),
    [market.history, myTeamId],
  );

  const resetFilters = () => {
    setFilters({
      positions: [],
      league: "all",
      team: "all",
      ageMin: "",
      ageMax: "",
      ratingMin: "",
      ratingMax: "",
      sortField: "ovr",
      sortOrder: "desc",
    });
    setSearch("");
    setPositionPickerOpen(false);
  };

  /** Abre la negociación con el informe real del motor de mercado. */
  function openNegotiation(player: FcPlayer) {
    const id = String(player.ID);
    if (myTeamId && hasRejectedDealFor(id, myTeamId, market.currentDate)) return;
    setTarget(player);
    const scoutingEntry = scoutingMap.get(id);
    setReport(scoutingEntry?.status === "completed" ? market.scout(id) : null);
  }

  function openScoutingDetails(player: FcPlayer) {
    const id = String(player.ID);
    const entry = scoutingMap.get(id);
    if (!entry || entry.status !== "completed" || !myTeamId) return;
    try {
      setScoutingDetailsPlayer(player);
      setScoutingDetailsReport(market.scout(id));
    } catch {
      setScoutingDetailsReport(null);
      toast.error("No se ha podido generar el informe de ojeador.");
    }
  }

  function startOrOpenScouting(player: FcPlayer) {
    const id = String(player.ID);
    const entry = scoutingMap.get(id);
    if (entry?.status === "completed") {
      openScoutingDetails(player);
      return;
    }
    if (entry?.status === "pending") return;
    if (!hiredScout) {
      toast.error("Tu club no dispone de ningún ojeador.", { description: "Contrata un ojeador en Mi equipo → Ojeador." });
      return;
    }
    if (market.activeScouts >= market.maxActiveScouts) {
      toast.error("Has alcanzado el límite de ojeos simultáneos.");
      return;
    }
    market.startScouting(id);
  }

  const myTeam = myTeamId ? teamById(myTeamId) : null;
  const openDeals = market.outgoing.filter((d) => d.stage !== "completed" && d.stage !== "failed");
  const openOffers = market.incoming.filter((d) => d.stage !== "completed" && d.stage !== "failed");

  const marketBadgeIds: Record<MarketBadgeSection, string[]> = {
    scouted: scoutedPlayers.map(({ entry }) => `${entry.playerId}:${entry.startedAt}`),
    deals: openDeals.map((deal) => deal.id),
    offers: openOffers.map((offer) => offer.id),
  };

  useEffect(() => {
    if (tab !== "scouted" && tab !== "deals" && tab !== "offers") return;
    writeMarketBadgeSeen(tab, marketBadgeIds[tab]);
  }, [tab, marketBadgeIds.scouted.join("|"), marketBadgeIds.deals.join("|"), marketBadgeIds.offers.join("|")]);

  if (!save) return null;
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <PlayersLoading message="Cargando mercado de fichajes…" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <MarketStatusBanner className="mb-6" />

      <div className="mb-6 rounded-2xl border border-border bg-card/70 p-4 md:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-bold">Presupuesto del club</p>
            <h2 className="text-lg font-black mt-1">Fichajes y salarios</h2>
            <p className="text-xs text-muted-foreground mt-1">Reparte el presupuesto total según tu estrategia. La masa salarial actual es un mínimo obligatorio.</p>
          </div>
          <div className="text-right">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Presupuesto total</p>
            <p className="text-lg font-black">{formatEuro(totalEconomicBudget)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 mb-4 md:grid-cols-3">
          <div className="rounded-xl border border-border/50 bg-secondary/60 p-3 flex items-center gap-3">
            <Banknote className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[0.65rem] uppercase text-muted-foreground font-bold">Fichajes</p>
              <p className="font-black text-lg">{formatEuro(transferBudget)}</p>
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-secondary/60 p-3 flex items-center gap-3">
            <Coins className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[0.65rem] uppercase text-muted-foreground font-bold">Presupuesto salarial</p>
              <p className="font-black text-lg">{formatEuro(wageBudget)}</p>
            </div>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-[0.65rem] uppercase text-muted-foreground font-bold">Masa real</p>
            <p className="font-black text-lg">{formatEuro(wageBill)}<span className="text-xs font-normal text-muted-foreground">/año</span></p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs font-bold">
          <span>Distribución económica</span>
          <span className="text-primary">{effectiveEconomicBudget > 0 ? ((Math.min(wageBudget, effectiveEconomicBudget) / effectiveEconomicBudget) * 100).toFixed(1) : "0.0"}% salarios · del presupuesto total</span>
        </div>
        <Slider
          value={[Math.min(Math.max(Math.min(Math.ceil(totalEconomicBudget * 0.05), effectiveEconomicBudget), wageBudget), Math.min(Math.floor(totalEconomicBudget * 0.30), effectiveEconomicBudget))]}
          min={Math.min(Math.ceil(totalEconomicBudget * 0.05), effectiveEconomicBudget)}
          max={Math.min(Math.floor(totalEconomicBudget * 0.30), effectiveEconomicBudget)}
          step={250_000}
          onValueChange={(values) => setWageBudget(Math.min(values[0] ?? wageBudget, effectiveEconomicBudget))}
          aria-label="Distribución del presupuesto entre salarios y fichajes, entre 5% y 30% para salarios"
          className="mt-3"
        />
        <div className="flex justify-between mt-2 text-[0.7rem] text-muted-foreground">
          <span>Más dinero para fichajes</span>
          <span>30% máximo para salarios</span>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black">Mercado de fichajes</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Negociaciones reales con clubes y jugadores
            {myTeam ? ` · ${myTeam.name}` : ""}
            {market.deadlineDay ? " · último día de mercado" : ""}
          </p>
        </div>
        <div className="panel-glow px-4 py-3 flex items-center gap-3 min-w-[200px]">
          <Wallet className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              Presupuesto
            </p>
            <p className="text-xl font-black scoreline text-primary">{formatEuro(budget)}</p>
          </div>
        </div>
      </div>

      {/* Pestañas del mercado */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((option) => {
          const badgeIds: Record<MarketBadgeSection, string[]> = {
            scouted: scoutedPlayers.map(({ entry }) => `${entry.playerId}:${entry.startedAt}`),
            deals: openDeals.map((deal) => deal.id),
            offers: openOffers.map((offer) => offer.id),
          };
          const section = option.value === "deals" || option.value === "offers" || option.value === "scouted"
            ? option.value
            : null;
          const count = section && tab !== section
            ? unseenMarketBadgeCount(section, badgeIds[section])
            : 0;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTab(option.value)}
              className={`px-3 py-2 rounded-lg text-sm font-bold border transition ${
                tab === option.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:border-primary/50"
              }`}
            >
              {option.label}
              {count > 0 && (
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs font-black ${
                    option.value === "scouted" || option.value === "deals" || option.value === "offers"
                      ? "bg-yellow-400 text-black"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "market" && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre…"
                className="w-full bg-secondary border border-border rounded-lg pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition ${
                showFilters || activeFiltersCount > 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:border-primary/50"
              }`}
            >
              <Filter className="h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="ml-1 bg-primary-foreground text-primary rounded-full px-2 py-0.5 text-xs">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="panel p-4 mb-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Filtros avanzados</h3>
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    <X className="h-3 w-3" />
                    Limpiar filtros
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <MultiPositionField
                  positions={filters.positions}
                  open={positionPickerOpen}
                  onOpenChange={setPositionPickerOpen}
                  onChange={(positions) => setFilters((prev) => ({ ...prev, positions }))}
                />

                <div className="grid grid-cols-2 gap-2">
                  <NumberFilterField
                    label="Edad mínima"
                    value={filters.ageMin}
                    min={0}
                    max={100}
                    onChange={(value) => setFilters((prev) => ({ ...prev, ageMin: value }))}
                  />
                  <NumberFilterField
                    label="Edad máxima"
                    value={filters.ageMax}
                    min={0}
                    max={100}
                    onChange={(value) => setFilters((prev) => ({ ...prev, ageMax: value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <NumberFilterField
                    label="Media mínima"
                    value={filters.ratingMin}
                    min={0}
                    max={99}
                    onChange={(value) => setFilters((prev) => ({ ...prev, ratingMin: value }))}
                  />
                  <NumberFilterField
                    label="Media máxima"
                    value={filters.ratingMax}
                    min={0}
                    max={99}
                    onChange={(value) => setFilters((prev) => ({ ...prev, ratingMax: value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    Liga
                  </label>
                  <Select
                    value={filters.league}
                    onValueChange={(value) =>
                      setFilters((prev) => ({ ...prev, league: value as LeagueId | "all" }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Liga: Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      {leagueOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.value === "all" ? (
                            <span>{opt.label}</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <LeagueLogo
                                league={LEAGUES[opt.value as LeagueId]?.name || ""}
                                size="sm"
                              />
                              <span>{LEAGUES[opt.value as LeagueId]?.name || opt.label}</span>
                            </div>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    Equipo
                  </label>
                  <Select
                    value={filters.team}
                    onValueChange={(value) => setFilters((prev) => ({ ...prev, team: value }))}
                    disabled={filters.league === "all"}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Equipo: Todos" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {teamOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.value === "all" ? (
                            <span>{opt.label}</span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <TeamLogo
                                teamName={opt.label}
                                leagueName={LEAGUES[filters.league as LeagueId]?.name || ""}
                                size={18}
                              />
                              <span className="truncate">{opt.label}</span>
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <SelectField
                    label="Ordenar por"
                    value={filters.sortField}
                    options={SORT_FIELD_OPTIONS}
                    onChange={(value) =>
                      setFilters((prev) => ({ ...prev, sortField: value as SortField }))
                    }
                  />
                  <SelectField
                    label="Orden"
                    value={filters.sortOrder}
                    options={SORT_ORDER_OPTIONS}
                    onChange={(value) =>
                      setFilters((prev) => ({ ...prev, sortOrder: value as SortOrder }))
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {players.length === 0 ? (
            <div className="panel p-10 text-center text-sm text-muted-foreground">
              No hay jugadores que coincidan con los filtros.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {players.map((p) => {
                const id = String(p.ID);
                const positions = buildPositions(p.Position, p["Alternative positions"]);
                const primaryPosition = positions[0];
                const clubId = clubOfPlayer(id) ?? TEAM_NAME_TO_ID[p.Team];
                const club = clubId ? teamById(clubId) : null;
                const negotiating = market.deals.some(
                  (d) => d.playerId === id && d.stage !== "completed" && d.stage !== "failed",
                );
                // Recién fichado en firme esta ventana: solo se puede negociar
                // una cesión hasta la siguiente. Se avisa en la propia tarjeta
                // para no descubrirlo al enviar la oferta y que rebote.
                const justSettled = isPlayerSettled(id);
                const blockedThisWindow = !!myTeamId && hasRejectedDealFor(id, myTeamId, market.currentDate);

                return (
                  <article
                    key={id}
                    className="relative panel overflow-hidden flex flex-col transition hover:border-primary/40"
                  >
                    <div className="flex gap-3 p-3 border-b border-border/40">
                      <div className="w-14 h-[4.5rem] shrink-0 rounded overflow-hidden bg-secondary/60 grid place-items-center">
                        {p.card ? (
                          <img
                            src={p.card}
                            alt=""
                            className="w-full h-full object-cover object-top"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-white/5 opacity-80" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold truncate text-sm leading-tight">{p.Name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span>{formatShortPositions([primaryPosition].filter(Boolean) as any)} · {p.Age}a</span>
                          {positions.length > 1 && (
                            <span className="ml-1 text-[0.58rem] text-muted-foreground/70">
                              · {formatShortPositions(positions.slice(1))}
                            </span>
                          )}
                        </p>
                        {club && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <TeamLogo
                              teamName={club.name}
                              leagueName={getLeagueName(club.league)}
                              size={18}
                            />
                            <span className="text-[0.65rem] text-muted-foreground truncate">
                              {club.name}
                            </span>
                          </div>
                        )}
                        {justSettled && (
                          <p className="text-[0.6rem] text-amber-400 mt-1">
                            Recién fichado: solo cesión esta ventana
                          </p>
                        )}
                      </div>
                      <span
                        className={`scoreline text-sm font-black px-2 py-1 rounded border h-fit ${ovrBadgeClass(p.OVR)}`}
                      >
                        {p.OVR}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-2 p-3 mt-auto">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const scout = scoutingMap.get(id);
                          const pending = scout?.status === "pending";
                          const completed = scout?.status === "completed";
                          const noScout = !hiredScout && !scout;
                          const atCapacity = !!hiredScout && !scout && market.activeScouts >= market.maxActiveScouts;
                          const disabled = !market.ready || noScout || atCapacity || pending;
                          return (
                            <>
                              <button
                                type="button"
                                disabled={disabled}
                                title={noScout ? "Contrata primero un ojeador en Mi equipo → Ojeador" : atCapacity ? "Has alcanzado la capacidad de tu ojeador" : pending ? "El informe aún está en preparación" : "Abrir o solicitar informe de ojeador"}
                                onClick={() => startOrOpenScouting(p)}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition disabled:opacity-45 disabled:cursor-not-allowed ${completed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15" : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"}`}
                              >
                                {pending ? <Clock3 className="h-3.5 w-3.5 animate-pulse" /> : completed ? <Eye className="h-3.5 w-3.5" /> : noScout || atCapacity ? <LockKeyhole className="h-3.5 w-3.5" /> : <Radar className="h-3.5 w-3.5" />}
                                {pending ? "Ojeando..." : completed ? "Ver informe" : "Ojear"}
                              </button>
                              {scout && (
                                <button
                                  type="button"
                                  onClick={() => setRemoveScoutingId(id)}
                                  className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-2.5 py-2 text-muted-foreground hover:border-destructive/40 hover:text-destructive transition"
                                  aria-label={`Eliminar a ${p.Name} del ojeo`}
                                  title="Eliminar de la lista de ojeo"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          );
                        })()}
                        <button
                          type="button"
                          disabled={!isMarketOpen || negotiating || !market.ready || blockedThisWindow}
                          onClick={() => openNegotiation(p)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          {blockedThisWindow ? "Bloqueado" : negotiating ? "Negociando" : "Negociar"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "scouted" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card to-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
                <Radar className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black text-lg">Jugadores ojeados</h3>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
                    {scoutedPlayers.length}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Todos los jugadores que están siendo ojeados o cuyo informe ya está listo. Puedes negociar directamente desde aquí.</p>
              </div>
            </div>
          </div>

          {scoutedPlayers.length === 0 ? (
            <div className="panel p-12 text-center">
              <Radar className="mx-auto h-9 w-9 text-muted-foreground/40" />
              <p className="mt-3 font-bold">Todavía no tienes jugadores ojeados.</p>
              <p className="mt-1 text-sm text-muted-foreground">Añade jugadores desde Buscar jugadores para encontrarlos aquí.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scoutedPlayers.map(({ player: p, entry: scout }) => {
                const id = String(p.ID);
                const positions = buildPositions(p.Position, p["Alternative positions"]);
                const primaryPosition = positions[0];
                const clubId = clubOfPlayer(id) ?? TEAM_NAME_TO_ID[p.Team];
                const club = clubId ? teamById(clubId) : null;
                const negotiating = market.deals.some(
                  (d) => d.playerId === id && d.stage !== "completed" && d.stage !== "failed",
                );
                const justSettled = isPlayerSettled(id);
                const blockedThisWindow = !!myTeamId && hasRejectedDealFor(id, myTeamId, market.currentDate);
                const pending = scout.status === "pending";
                const completed = scout.status === "completed";

                return (
                  <article
                    key={id}
                    className="relative panel overflow-hidden flex flex-col transition hover:border-primary/40"
                  >
                    <div className="flex gap-3 p-3 border-b border-border/40">
                      <div className="w-14 h-[4.5rem] shrink-0 rounded overflow-hidden bg-secondary/60 grid place-items-center">
                        {p.card ? (
                          <img
                            src={p.card}
                            alt=""
                            className="w-full h-full object-cover object-top"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-white/5 opacity-80" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold truncate text-sm leading-tight">{p.Name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span>{formatShortPositions([primaryPosition].filter(Boolean) as any)} · {p.Age}a</span>
                          {positions.length > 1 && (
                            <span className="ml-1 text-[0.58rem] text-muted-foreground/70">
                              · {formatShortPositions(positions.slice(1))}
                            </span>
                          )}
                        </p>
                        {club && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <TeamLogo
                              teamName={club.name}
                              leagueName={getLeagueName(club.league)}
                              size={18}
                            />
                            <span className="text-[0.65rem] text-muted-foreground truncate">
                              {club.name}
                            </span>
                          </div>
                        )}
                        {justSettled && (
                          <p className="text-[0.6rem] text-amber-400 mt-1">
                            Recién fichado: solo cesión esta ventana
                          </p>
                        )}
                      </div>
                      <span
                        className={`scoreline text-sm font-black px-2 py-1 rounded border h-fit ${ovrBadgeClass(p.OVR)}`}
                      >
                        {p.OVR}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-2 p-3 mt-auto">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          title={pending ? "El informe aún está en preparación" : "Abrir informe de ojeador"}
                          onClick={() => startOrOpenScouting(p)}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition disabled:opacity-45 disabled:cursor-not-allowed ${completed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15" : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"}`}
                        >
                          {pending ? <Clock3 className="h-3.5 w-3.5 animate-pulse" /> : <Eye className="h-3.5 w-3.5" />}
                          {pending ? "Ojeando..." : "Ver informe"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemoveScoutingId(id)}
                          className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-2.5 py-2 text-muted-foreground hover:border-destructive/40 hover:text-destructive transition"
                          aria-label={`Eliminar a ${p.Name} del ojeo`}
                          title="Eliminar de la lista de ojeo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={!isMarketOpen || negotiating || !market.ready || blockedThisWindow}
                          onClick={() => openNegotiation(p)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          {blockedThisWindow ? "Bloqueado" : negotiating ? "Negociando" : "Negociar"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "deals" && (
        <div className="space-y-3">
          {market.outgoing.length === 0 ? (
            <div className="panel p-10 text-center text-sm text-muted-foreground">
              No tienes negociaciones abiertas. Busca un jugador y envía una oferta.
            </div>
          ) : (
            market.outgoing.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                onImprove={market.improveOffer}
                onAcceptDemand={market.acceptDemand}
                onImproveWage={market.improveWage}
                onConfirm={market.confirmDeal}
                onAbandon={market.abandonDeal}
                onAcceptIncoming={market.acceptIncoming}
                onCounterIncoming={market.counterIncoming}
                onCounterOutgoing={market.counterOutgoing}
                onRejectIncoming={market.rejectIncoming}
              />
            ))
          )}
        </div>
      )}

      {tab === "offers" && (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card to-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Banknote className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-lg">Traspasos recibidos</h3>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
                      {market.incoming.filter((deal) => !isLoanOffer(deal)).length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Todas las ofertas de compra agrupadas por jugador para comparar rápidamente a los clubes interesados.
                  </p>
                </div>
              </div>
            </div>

            {incomingTransferGroups.length === 0 ? (
              <div className="panel p-10 text-center text-sm text-muted-foreground">
                Ningún club ha presentado una oferta de traspaso todavía.
              </div>
            ) : (
              incomingTransferGroups.map(([playerId, deals]) => {
                const player = fcPlayerById(playerId);
                const playerName = deals[0]?.playerName ?? playerId;

                return (
                  <section
                    key={`transfer-group-${playerId}`}
                    className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
                  >
                    <div className="flex items-center gap-3 border-b border-border/60 bg-gradient-to-r from-secondary/70 via-card to-primary/5 px-4 py-3.5">
                      <PlayerFace
                        name={playerName}
                        image={player?.card}
                        role={roleFromPosition(player?.Position ?? "MID")}
                        size={56}
                        showRing={false}
                        className="bg-secondary/70 shadow-sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h4 className="truncate text-base font-black uppercase tracking-tight">{playerName}</h4>
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-wider text-muted-foreground">
                            {deals.length} {deals.length === 1 ? "oferta" : "ofertas"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {deals.length > 1
                            ? "Todos los clubes interesados en este jugador, juntos."
                            : "Oferta recibida por tu jugador."}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 p-3 sm:p-4">
                      {deals.map((deal) => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          compactHeader
                          onImprove={market.improveOffer}
                          onAcceptDemand={market.acceptDemand}
                          onImproveWage={market.improveWage}
                          onConfirm={market.confirmDeal}
                          onAbandon={market.abandonDeal}
                          onAcceptIncoming={market.acceptIncoming}
                          onCounterIncoming={market.counterIncoming}
                          onCounterOutgoing={market.counterOutgoing}
                          onRejectIncoming={market.rejectIncoming}
                        />
                      ))}
                    </div>
                  </section>
                );
              })
            )}
          </section>

          <section className="space-y-3">
            <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-r from-sky-500/10 via-card to-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500/15 text-sky-300">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-lg">Cesiones recibidas</h3>
                    <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-black text-sky-300">
                      {market.incoming.filter((deal) => isLoanOffer(deal)).length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ofertas de cesión separadas automáticamente de los traspasos y agrupadas por jugador.
                  </p>
                </div>
              </div>
            </div>

            {incomingLoanGroups.length === 0 ? (
              <div className="panel p-10 text-center text-sm text-muted-foreground">
                Ningún club ha enviado una oferta de cesión todavía.
              </div>
            ) : (
              incomingLoanGroups.map(([playerId, deals]) => {
                const player = fcPlayerById(playerId);
                const playerName = deals[0]?.playerName ?? playerId;

                return (
                  <section
                    key={`loan-group-${playerId}`}
                    className="overflow-hidden rounded-2xl border border-sky-500/20 bg-card shadow-sm"
                  >
                    <div className="flex items-center gap-3 border-b border-sky-500/15 bg-gradient-to-r from-sky-500/10 via-card to-card px-4 py-3.5">
                      <PlayerFace
                        name={playerName}
                        image={player?.card}
                        role={roleFromPosition(player?.Position ?? "MID")}
                        size={56}
                        showRing={false}
                        className="bg-secondary/70 shadow-sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h4 className="truncate text-base font-black uppercase tracking-tight">{playerName}</h4>
                          <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-wider text-sky-300">
                            {deals.length} {deals.length === 1 ? "oferta" : "ofertas"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {deals.length > 1
                            ? "Todas las propuestas de cesión para este jugador, juntas."
                            : "Oferta de cesión recibida por tu jugador."}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 p-3 sm:p-4">
                      {deals.map((deal) => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          compactHeader
                          onImprove={market.improveOffer}
                          onAcceptDemand={market.acceptDemand}
                          onImproveWage={market.improveWage}
                          onConfirm={market.confirmDeal}
                          onAbandon={market.abandonDeal}
                          onAcceptIncoming={market.acceptIncoming}
                          onCounterIncoming={market.counterIncoming}
                          onCounterOutgoing={market.counterOutgoing}
                          onRejectIncoming={market.rejectIncoming}
                        />
                      ))}
                    </div>
                  </section>
                );
              })
            )}
          </section>
        </div>
      )}

      {tab === "entries" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-card to-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <ArrowDownToLine className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-lg">Entradas</h3>
                <p className="text-xs text-muted-foreground">Todos los jugadores que han llegado a tu club mediante un fichaje o una cesión.</p>
              </div>
              <span className="ml-auto rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-400">{userEntries.length}</span>
            </div>
          </div>
          {userEntries.length === 0 ? (
            <div className="panel p-12 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-muted-foreground/40" />
              <p className="mt-3 font-bold">Todavía no hay entradas.</p>
              <p className="mt-1 text-sm text-muted-foreground">Las operaciones cerradas aparecerán aquí automáticamente.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {userEntries.map((record) => (
                <TransferHistoryCard key={record.id} record={record} direction="in" onDetails={(r) => { setDetailsRecord(r); setDetailsDirection("in"); }} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "exits" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 via-card to-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-orange-500/15 text-orange-400">
                <ArrowUpFromLine className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-lg">Salidas</h3>
                <p className="text-xs text-muted-foreground">Todos los jugadores que han abandonado tu club mediante un fichaje o una cesión.</p>
              </div>
              <span className="ml-auto rounded-full bg-orange-500/10 px-3 py-1 text-xs font-black text-orange-400">{userExits.length}</span>
            </div>
          </div>
          {userExits.length === 0 ? (
            <div className="panel p-12 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-muted-foreground/40" />
              <p className="mt-3 font-bold">Todavía no hay salidas.</p>
              <p className="mt-1 text-sm text-muted-foreground">Las operaciones cerradas aparecerán aquí automáticamente.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {userExits.map((record) => (
                <TransferHistoryCard key={record.id} record={record} direction="out" onDetails={(r) => { setDetailsRecord(r); setDetailsDirection("out"); }} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "feed" && (
        <MarketFeed
          rumors={market.rumors}
          windowRumors={market.windowRumors}
          history={market.history}
          summary={market.summary}
          userDeals={market.deals}
          myTeamId={myTeamId}
        />
      )}

      <AlertDialog open={!!removeScoutingId} onOpenChange={(open) => !open && setRemoveScoutingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar jugador del ojeador?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const player = removeScoutingId ? (rawPlayers as FcPlayer[]).find((candidate) => String(candidate.ID) === removeScoutingId) : null;
                return player ? `Se eliminará ${player.Name} de la lista de ojeados.` : "Se eliminará este jugador de la lista de ojeados.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeScoutingId) market.removeScouting(removeScoutingId);
                setRemoveScoutingId(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {scoutingDetailsPlayer && (
        <ScoutingDetailsModal
          player={scoutingDetailsPlayer}
          report={scoutingDetailsReport}
          scoutingEntry={scoutingMap.get(String(scoutingDetailsPlayer.ID)) ?? null}
          open={!!scoutingDetailsPlayer}
          onClose={() => {
            setScoutingDetailsPlayer(null);
            setScoutingDetailsReport(null);
          }}
        />
      )}

      {detailsRecord && (
        <NegotiationDetailsModal
          record={detailsRecord}
          direction={detailsDirection}
          onClose={() => setDetailsRecord(null)}
        />
      )}

      {target && (
        <NegotiationModal
          playerName={target.Name}
          playerCard={target.card}
          ovr={target.OVR}
          age={target.Age}
          clubName={target ? (teamById(clubOfPlayer(String(target.ID)) ?? TEAM_NAME_TO_ID[target.Team])?.name ?? target.Team) : ""}
          report={report}
          scoutingEntry={target ? scoutingMap.get(String(target.ID)) ?? null : null}
          budget={budget}
          wageBudget={wageBudget}
          wageBill={wageBill}
          currentWage={target ? getPlayerAnnualWage(String(target.ID)) : 0}
          transferLocked={target ? isPlayerSettled(String(target.ID)) : false}
          currentDate={market.currentDate}
          onClose={() => setTarget(null)}
          onSubmit={({ amount, wageOffer, type, clauses }) => {
            market.makeOffer({ playerId: String(target.ID), amount, wageOffer, type, clauses });
            setTarget(null);
          }}
        />
      )}

    </div>
  );
}

function NumberFilterField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: NumericFilterValue;
  min: number;
  max: number;
  onChange: (value: NumericFilterValue) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        placeholder="—"
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange("");
            return;
          }
          const next = Number(raw);
          if (!Number.isFinite(next)) return;
          onChange(Math.min(max, Math.max(min, next)));
        }}
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}

function MultiPositionField({
  positions,
  open,
  onOpenChange,
  onChange,
}: {
  positions: PosCode[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (positions: PosCode[]) => void;
}) {
  const togglePosition = (position: PosCode) => {
    onChange(
      positions.includes(position)
        ? positions.filter((item) => item !== position)
        : [...positions, position],
    );
  };

  const summary = positions.length === 0
    ? "Todas"
    : positions.length === 1
      ? POS_SHORT[positions[0]]
      : `${positions.length} posiciones`;

  return (
    <div className="space-y-1.5">
      <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        Posición
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-left"
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="truncate">Posición: {summary}</span>
          <span className="text-muted-foreground">⌄</span>
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-xl">
            <button
              type="button"
              onClick={() => onChange([])}
              className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-bold transition ${positions.length === 0 ? "bg-primary/10 text-primary" : "hover:bg-secondary"}`}
            >
              <span className={`grid h-4 w-4 place-items-center rounded border text-[10px] ${positions.length === 0 ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                {positions.length === 0 ? "✓" : ""}
              </span>
              Todas
            </button>

            <div className="grid grid-cols-3 gap-1.5" role="listbox" aria-label="Posiciones específicas">
              {POSITION_OPTIONS.map((position) => {
                const checked = positions.includes(position);
                return (
                  <button
                    key={position}
                    type="button"
                    onClick={() => togglePosition(position)}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold transition ${checked ? "bg-primary/10 text-primary" : "hover:bg-secondary"}`}
                    role="option"
                    aria-selected={checked}
                  >
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                      {checked ? "✓" : ""}
                    </span>
                    <span>{position}</span>
                  </button>
                );
              })}
            </div>

            {positions.length > 0 && (
              <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
                <span className="text-[0.65rem] text-muted-foreground">
                  {positions.length} seleccionadas
                </span>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[0.65rem] font-bold text-primary hover:underline"
                >
                  Quitar selección
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Desplegable simple reutilizado por los filtros. */
function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
