import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSave, SaveGame, saveSave, setLineup } from "@/lib/store";
import { teamById } from "@/data/teams";
import { Position } from "@/data/players";
import { PlayersLoading, usePlayersReady } from "@/components/PlayersLoading";
import { usePlayersStore } from "@/store/playersStore";

export const Route = createFileRoute("/lineup")({ component: LineupPage });

const POS_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];
const POS_LABEL: Record<Position, string> = { GK: "PT", DEF: "DF", MID: "MC", FWD: "DL" };
const POS_COLOR: Record<Position, string> = {
  GK: "border-yellow-500/40 bg-yellow-500/10",
  DEF: "border-blue-500/40 bg-blue-500/10",
  MID: "border-green-500/40 bg-green-500/10",
  FWD: "border-red-500/40 bg-red-500/10",
};

function LineupPage() {
  const navigate = useNavigate();
  const { ready, loading } = usePlayersReady();
  const getSimSquad = usePlayersStore((s) => s.getSimSquad);
  const [save, setSave] = useState<SaveGame | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const s = loadSave();
    if (!s) { navigate({ to: "/" }); return; }
    setSave(s);
    setSelected(s.lineups[s.myTeamId] ?? []);
  }, [navigate]);

  const squad = useMemo(
    () => (save && ready ? getSimSquad(save.myTeamId) : []),
    [save, ready, getSimSquad],
  );
  const leagueMd = save ? save.currentMatchday[save.myLeague] : 0;
  const selectedSet = new Set(selected);
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of selected) {
    const p = squad.find((x) => x.id === id);
    if (p) counts[p.position]++;
  }
  const total = selected.length;
  const valid = total === 11 && counts.GK === 1 && counts.DEF >= 3 && counts.MID >= 2 && counts.FWD >= 1;

  function toggle(id: string) {
    if (!save) return;
    const p = squad.find((x) => x.id === id);
    if (!p) return;
    const injured = p.injuredUntil > leagueMd;
    if (injured) return;
    if (selectedSet.has(id)) {
      setSelected(selected.filter((x) => x !== id));
    } else {
      if (total >= 11) return;
      if (p.position === "GK" && counts.GK >= 1) return;
      setSelected([...selected, id]);
    }
  }

  function save_() {
    if (!save || !valid) return;
    const next = setLineup(save, save.myTeamId, selected);
    saveSave(next);
    setSave(next);
  }

  function autoFill() {
    if (!save) return;
    const available = squad.filter((p) => p.injuredUntil <= leagueMd);
    const pick = (pos: Position, n: number) =>
      available.filter((p) => p.position === pos).slice(0, n).map((p) => p.id);
    setSelected([...pick("GK", 1), ...pick("DEF", 4), ...pick("MID", 3), ...pick("FWD", 3)]);
  }

  if (!save) return null;
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <PlayersLoading message="Cargando datos de jugadores…" />
      </div>
    );
  }

  const myTeam = teamById(save.myTeamId);

  if (squad.length === 0) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <p className="text-sm text-muted-foreground text-center py-12">
          No hay jugadores en la base de datos para <strong>{myTeam.name}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Alineación</h1>
          <p className="text-xs text-muted-foreground">{myTeam.name} · 4-3-3 recomendado</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={autoFill} className="px-4 py-2 rounded-lg bg-card border border-border text-sm hover:border-accent transition">
            Auto
          </button>
          <button onClick={save_} disabled={!valid}
            className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm glow-neon disabled:opacity-40 disabled:glow-cyan-0">
            Guardar
          </button>
        </div>
      </div>

      <div className="panel-glow p-4 mb-6">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className={`font-bold ${counts.GK === 1 ? "text-primary" : "text-muted-foreground"}`}>PT {counts.GK}/1</span>
            <span className={`font-bold ${counts.DEF >= 3 ? "text-primary" : "text-muted-foreground"}`}>DF {counts.DEF}</span>
            <span className={`font-bold ${counts.MID >= 2 ? "text-primary" : "text-muted-foreground"}`}>MC {counts.MID}</span>
            <span className={`font-bold ${counts.FWD >= 1 ? "text-primary" : "text-muted-foreground"}`}>DL {counts.FWD}</span>
          </div>
          <div className={`text-2xl font-black scoreline ${valid ? "text-primary" : "text-muted-foreground"}`}>
            {total}/11
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {POS_ORDER.map((pos) => {
          const players = squad.filter((p) => p.position === pos);
          return (
            <div key={pos}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                {POS_LABEL[pos]} ({players.length})
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {players.map((p) => {
                  const isSelected = selectedSet.has(p.id);
                  const injured = p.injuredUntil > leagueMd;
                  return (
                    <button key={p.id} onClick={() => toggle(p.id)} disabled={injured}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition ${
                        injured ? "opacity-40 cursor-not-allowed border-border" :
                        isSelected ? `${POS_COLOR[pos]} glow-cyan` :
                        "border-border bg-card hover:border-primary/60"
                      }`}>
                      <div className={`w-8 h-8 grid place-items-center rounded text-xs font-black ${
                        isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                      }`}>
                        {p.rating}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate text-sm flex items-center gap-1">
                          {p.name}
                          {injured && <span className="text-[0.6rem] text-destructive">🚑</span>}
                        </div>
                        <div className="text-[0.65rem] text-muted-foreground">
                          {p.age}a · {p.goals}G {p.assists}A
                        </div>
                      </div>
                      {isSelected && <span className="text-primary text-lg">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex justify-end">
        <Link to="/match" className={`px-6 py-3 rounded-lg font-black ${valid ? "bg-primary text-primary-foreground glow-neon" : "bg-secondary text-muted-foreground pointer-events-none opacity-40"}`}>
          Ir al partido →
        </Link>
      </div>
    </div>
  );
}
