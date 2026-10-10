import type { TeamFormResult } from "@/lib/teamForm";

const LABEL: Record<TeamFormResult, string> = { W: "V", D: "E", L: "D" };
const TONE: Record<TeamFormResult, string> = {
  W: "bg-emerald-500/80 text-white",
  D: "bg-muted-foreground/50 text-white",
  L: "bg-destructive/80 text-white",
};

export function TeamForm({ results, className = "" }: { results: TeamFormResult[]; className?: string }) {
  return (
    <div className={`self-center inline-flex min-h-4 items-center justify-center gap-0.5 leading-none ${className}`} aria-label={`Forma reciente: ${results.map((r) => LABEL[r]).join(", ") || "sin partidos"}`}>
      {results.length ? results.map((result, index) => (
        <span key={`${result}-${index}`} title={result === "W" ? "Victoria" : result === "D" ? "Empate" : "Derrota"} className={`inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle rounded-full text-[0.55rem] font-bold leading-none ${TONE[result]}`}>
          {LABEL[result]}
        </span>
      )) : <span className="text-muted-foreground">—</span>}
    </div>
  );
}
