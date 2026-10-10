import { useMemo } from "react";
import { Award, CalendarDays } from "lucide-react";
import type { SaveGame } from "@/lib/store";
import { getAllPlayedFixtures } from "@/lib/teamForm";
import { formationSlots, type ElevenSlot } from "@/lib/teamProfile";
import { TypicalElevenPitch } from "@/components/TypicalElevenPitch";
import { usePlayersStore, type FcPlayer } from "@/store/playersStore";
import { buildPositions, positionGroupFromCode, type PosCode } from "@/lib/positions";

const FORMATION = "Táctica 4-3-3 con mediocentro ofensivo";
type WeeklyCandidate = { player: FcPlayer; teamId: string; ratingTotal: number; appearances: number; lastRating: number };

function dateKey(date?: string, matchday = 0): string {
  if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  return `0000-00-${String(Math.max(0, matchday)).padStart(2, "0")}`;
}

function candidateGroup(candidate: WeeklyCandidate): "GK" | "DEF" | "MID" | "FWD" {
  const positions = buildPositions(candidate.player.Position, candidate.player["Alternative positions"]);
  const primary = positions[0] ?? "MC";
  return positionGroupFromCode(primary as PosCode);
}

/** XI semanal calculado con las notas guardadas en partidos recientes. */
export function TeamOfWeekPanel({ save }: { save: SaveGame }) {
  const latestDate = useMemo(() => {
    const dates = getAllPlayedFixtures(save)
      .filter((fixture) => (fixture.result?.ratings?.length ?? 0) > 0)
      .map((fixture) => dateKey(fixture.date, fixture.matchday))
      .filter((date) => !date.startsWith("0000-"))
      .sort();
    return dates.at(-1) ?? "";
  }, [save]);

  const rawPlayers: FcPlayer[] = useMemo(
    () => usePlayersStore.getState().getRawPlayers() as FcPlayer[],
    [save],
  );

  const eleven = useMemo(() => {
    if (!latestDate) return [] as ElevenSlot[];
    const cutoff = new Date(`${latestDate}T12:00:00Z`).getTime() - 6 * 86400000;
    const playerById = new Map<string, FcPlayer>(
      rawPlayers.map((player: FcPlayer) => [String(player.ID), player] as [string, FcPlayer]),
    );
    const candidates = new Map<string, WeeklyCandidate>();

    for (const fixture of getAllPlayedFixtures(save)) {
      if (!fixture.result?.ratings?.length) continue;
      const d = dateKey(fixture.date, fixture.matchday);
      if (d.startsWith("0000-") || new Date(`${d}T12:00:00Z`).getTime() < cutoff || d > latestDate) continue;
      for (const rating of fixture.result.ratings) {
        if (!rating.playerId || rating.minutes < 20 || !Number.isFinite(rating.rating)) continue;
        const id = String(rating.playerId);
        const player = playerById.get(id);
        if (!player) continue;
        const teamId = rating.team === "home" ? fixture.homeId : fixture.awayId;
        const current = candidates.get(id);
        if (current) {
          current.ratingTotal += rating.rating;
          current.appearances += 1;
          current.lastRating = Math.max(current.lastRating, rating.rating);
          current.teamId = teamId;
        } else {
          candidates.set(id, { player, teamId, ratingTotal: rating.rating, appearances: 1, lastRating: rating.rating });
        }
      }
    }

    const byGroup: Record<"GK" | "DEF" | "MID" | "FWD", WeeklyCandidate[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const candidate of candidates.values()) byGroup[candidateGroup(candidate)].push(candidate);
    const score = (candidate: WeeklyCandidate) => candidate.ratingTotal / candidate.appearances;
    for (const group of Object.keys(byGroup) as (keyof typeof byGroup)[]) {
      byGroup[group].sort((a, b) => score(b) - score(a) || b.player.OVR - a.player.OVR);
    }

    const formation = formationSlots(FORMATION);
    const need = { GK: 1, DEF: 4, MID: 3, FWD: 3 };
    const selected: WeeklyCandidate[] = [];
    const ids = new Set<string>();
    for (const group of ["GK", "DEF", "MID", "FWD"] as const) {
      for (const candidate of byGroup[group]) {
        if (selected.filter((p) => candidateGroup(p) === group).length >= need[group]) break;
        const id = String(candidate.player.ID);
        if (!ids.has(id)) { ids.add(id); selected.push(candidate); }
      }
    }
    // Si faltan posiciones en una semana con datos escasos, completa los huecos
    // con las mejores notas restantes sin duplicar futbolistas.
    const remaining = [...candidates.values()].filter((candidate) => !ids.has(String(candidate.player.ID))).sort((a, b) => score(b) - score(a));
    while (selected.length < 11 && remaining.length) selected.push(remaining.shift()!);

    const groupOrder = (label: string): "GK" | "DEF" | "MID" | "FWD" => positionGroupFromCode(label as PosCode);
    const groupPools: Record<string, WeeklyCandidate[]> = {
      GK: selected.filter((candidate) => candidateGroup(candidate) === "GK"),
      DEF: selected.filter((candidate) => candidateGroup(candidate) === "DEF"),
      MID: selected.filter((candidate) => candidateGroup(candidate) === "MID"),
      FWD: selected.filter((candidate) => candidateGroup(candidate) === "FWD"),
    };
    const used = new Set<string>();
    return formation.map((slot) => {
      const group = groupOrder(slot.label);
      let candidate = groupPools[group]?.find((entry) => !used.has(String(entry.player.ID)));
      if (!candidate) candidate = selected.find((entry) => !used.has(String(entry.player.ID)));
      if (!candidate) return { label: slot.label, player: null, natural: false } as ElevenSlot;
      used.add(String(candidate.player.ID));
      return { label: slot.label, player: candidate.player, natural: true, matchRating: Number((candidate.ratingTotal / candidate.appearances).toFixed(1)), teamId: candidate.teamId } as ElevenSlot;
    });
  }, [save, rawPlayers, latestDate]);

  if (eleven.filter((slot) => slot.player).length < 8) return null;

  return (
    <section className="panel overflow-hidden rounded-2xl border border-primary/20 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-amber-300"><Award className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black">Equipo de la jornada</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-[0.65rem] text-muted-foreground"><CalendarDays className="h-3 w-3" /> XI ideal según las notas de los últimos siete días de partidos</p>
        </div>
        <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[0.6rem] font-black text-amber-300">XI IDEAL</span>
      </div>
      <div className="mx-auto max-w-md">
        <TypicalElevenPitch eleven={eleven} formation={FORMATION} />
      </div>
    </section>
  );
}
