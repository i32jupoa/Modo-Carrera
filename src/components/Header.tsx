import { Link } from "@tanstack/react-router";

export function Header({ teamName, season }: { teamName?: string; season?: string }) {
  return (
    <header className="border-b border-border/60 bg-background/70 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-md bg-primary grid place-items-center glow-neon">
            <span className="text-primary-foreground font-black text-sm">FC</span>
          </div>
          <span className="font-bold text-lg tracking-tight group-hover:text-primary transition">
            FC <span className="text-primary text-glow">SIM</span>
          </span>
        </Link>
        {teamName && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Temporada {season}</span>
            <span className="chip">{teamName}</span>
          </div>
        )}
      </div>
    </header>
  );
}
