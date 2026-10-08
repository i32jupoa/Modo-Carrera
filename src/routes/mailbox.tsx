import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, GraduationCap, MessageCircle, Search, Send } from "lucide-react";
import { loadSave, saveSaveWithRetry } from "@/lib/store";
import { TEAMS } from "@/data/teams";
import { usePlayersStore } from "@/store/playersStore";
import { faceUrl } from "@/lib/playerFaces";
import { PlayerFace, roleFromPosition } from "@/components/PlayerFace";
import { MoodFace } from "@/components/MoodFace";
import { RoleBadge } from "@/components/RoleBadge";
import {
  answerMailboxMessage,
  findNextUserFixture,
  getMailboxResponseOptions,
  markMailboxConversationRead,
  type MailboxMessage,
  type MailboxResponse,
} from "@/lib/mailbox";
import { useNotificationsStore } from "@/store/notificationsStore";
import { useAcademyStore } from "@/lib/academy/academyStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/mailbox")({ component: MailboxPage });

function formatTime(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return date;
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function formatDay(date: string, today: string): string {
  if (date === today) return "Hoy";
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (date === yesterday.toISOString().slice(0, 10)) return "Ayer";
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

function MailboxPage() {
  const navigate = useNavigate();
  const [save, setSave] = useState(() => loadSave());
  const currentDate = usePlayersStore((s) => s.currentDate);
  const stats = usePlayersStore((s) => s.stats);
  const squad = usePlayersStore((s) => s.getSimSquad(save?.myTeamId ?? ""));
  const markMailboxRead = useNotificationsStore((s) => s.markMailboxRead);
  const [query, setQuery] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [mobileChat, setMobileChat] = useState(false);
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const academyClub = useAcademyStore((state) => save?.myTeamId ? state.clubs[save.myTeamId] : undefined);
  const ensureAcademyClub = useAcademyStore((state) => state.ensureClub);

  useEffect(() => {
    if (!save?.myTeamId || !currentDate) return;
    void ensureAcademyClub(save.myTeamId, save.season, currentDate);
  }, [save?.myTeamId, save?.season, currentDate, ensureAcademyClub]);

  const playerMap = useMemo(() => new Map(squad.map((player) => [player.id, player])), [squad]);
  const conversations = useMemo(() => (save?.mailbox?.conversations ?? []).filter((conversation) => playerMap.has(conversation.playerId)), [save?.mailbox?.conversations, playerMap]);
  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conversation) => playerMap.get(conversation.playerId)?.name.toLowerCase().includes(q));
  }, [conversations, playerMap, query]);

  const selectedConversation = selectedPlayerId
    ? conversations.find((conversation) => conversation.playerId === selectedPlayerId) ?? null
    : null;
  const selectedPlayer = selectedPlayerId ? playerMap.get(selectedPlayerId) ?? null : null;

  useEffect(() => {
    if (selectedPlayerId || filteredConversations.length === 0) return;
    // No abrimos automáticamente una conversación que tenga mensajes sin leer:
    // el círculo amarillo debe permanecer visible hasta que el entrenador la abra.
    const firstReadConversation = filteredConversations.find((conversation) => conversation.unreadCount <= 0);
    if (firstReadConversation) setSelectedPlayerId(firstReadConversation.playerId);
  }, [filteredConversations, selectedPlayerId]);

  useEffect(() => {
    if (!selectedPlayerId || !save?.mailbox) return;
    const conversation = save.mailbox.conversations.find((entry) => entry.playerId === selectedPlayerId);
    if (!conversation || conversation.unreadCount <= 0) return;
    const next = { ...save, mailbox: markMailboxConversationRead(save.mailbox, selectedPlayerId) };
    saveSaveWithRetry(next);
    setSave(next);
    markMailboxRead();
    setTyping(true);
    const timer = window.setTimeout(() => setTyping(false), 550);
    return () => window.clearTimeout(timer);
  }, [selectedPlayerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversation?.messages.length, typing]);

  const teamNames = useMemo(() => new Map(TEAMS.map((team) => [team.id, team.name])), []);

  if (!save) {
    return <div className="flex min-h-[70vh] items-center justify-center text-muted-foreground">No hay una partida cargada.</div>;
  }

  const nextFixture = selectedPlayer ? findNextUserFixture([
    ...(save.fixtures?.[save.myLeague] ?? []),
    ...Object.values(save.cupFixtures ?? {}).flat(),
    ...(save.uclFixtures ?? []),
    ...(save.uelFixtures ?? []),
    ...(save.ueclFixtures ?? []),
  ], save.myTeamId, currentDate) : undefined;

  const lastMessage = selectedConversation?.messages.at(-1);
  const canRespond = lastMessage?.sender === "player";
  const responseOptions = selectedPlayer && lastMessage?.sender === "player"
    ? getMailboxResponseOptions(lastMessage, selectedPlayer, nextFixture, teamNames, currentDate)
    : [];

  const sendResponse = (response: MailboxResponse) => {
    if (!selectedPlayer || !selectedConversation || !save.mailbox || !canRespond || !lastMessage) return;
    const next = answerMailboxMessage(save.mailbox, selectedPlayer, lastMessage, response, currentDate, response === "promise" ? nextFixture : undefined, teamNames);
    if (!next.applied) return;
    const stat = stats[selectedPlayer.id];
    const nextStats = stat
      ? { ...stats, [selectedPlayer.id]: { ...stat, morale: Math.max(0, Math.min(100, Math.round((stat.morale ?? 70) + next.moraleDelta))) } }
      : stats;
    usePlayersStore.setState({ stats: nextStats });
    const nextSave = { ...save, mailbox: next.state };
    saveSaveWithRetry(nextSave);
    setSave(nextSave);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-7xl min-h-0 flex-col p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-black uppercase tracking-[0.22em] text-primary">Vestuario</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black"><MessageCircle className="h-6 w-6" />Buzón</h1>
        </div>
        <div className="hidden text-right text-xs text-muted-foreground sm:block">Mensajes de tus jugadores y conversaciones de confianza</div>
      </div>

      {(academyClub?.players.some((player) => (player.loanReports?.length ?? 0) > 0) ?? false) && (
        <section className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-sm font-black"><GraduationCap className="h-4 w-4 text-primary" />Informes de cesiones de cantera</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(academyClub?.players ?? []).filter((player) => player.status === "loaned" && (player.loanReports?.length ?? 0) > 0).map((player) => {
              const report = player.loanReports?.at(-1);
              return report ? (
                <div key={player.id} className="rounded-xl border border-border/50 bg-card/60 p-3">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-black">{player.name}</span><span className={`text-xs font-black ${report.delta >= 0 ? "text-emerald-400" : "text-rose-300"}`}>{report.delta >= 0 ? "+" : ""}{report.delta.toFixed(2)} OVR</span></div>
                  <div className="mt-1 text-[0.65rem] text-muted-foreground">{report.minutes} min. último seguimiento · {report.averageRating.toFixed(2)} de valoración</div>
                  <p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">{report.note}</p>
                </div>
              ) : null;
            })}
          </div>
        </section>
      )}

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-xl lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className={`${mobileChat ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-r border-border/60`}>
          <div className="border-b border-border/60 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conversaciones" className="pl-9" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-8 text-center text-muted-foreground">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10"><MessageCircle className="h-6 w-6 text-primary" /></div>
                <p className="font-bold text-foreground">Todavía no hay conversaciones</p>
                <p className="text-xs">Los jugadores pueden escribirte en los días sin partido cuando tengan algo que hablar contigo.</p>
              </div>
            ) : filteredConversations.map((conversation) => {
              const player = playerMap.get(conversation.playerId)!;
              const last = conversation.messages.at(-1);
              const active = conversation.playerId === selectedPlayerId;
              return (
                <button key={conversation.playerId} type="button" onClick={() => { setSelectedPlayerId(player.id); setMobileChat(true); }} className={`flex w-full items-center gap-3 border-b border-border/40 p-3 text-left transition ${active ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                  <div className="relative">
                    <PlayerFace name={player.name} image={faceUrl(player.id, player.cardImage)} role={roleFromPosition(player.position)} size={44} showRing={false} />
                    {conversation.unreadCount > 0 && (
                      <span
                        className="absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-yellow-400 text-[0px] text-black ring-2 ring-background"
                        title={`${conversation.unreadCount} mensaje${conversation.unreadCount === 1 ? "" : "s"} sin leer`}
                        aria-label={`${conversation.unreadCount} mensajes sin leer`}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-black">{player.name}</span><MoodFace morale={stats[player.id]?.morale ?? 70} size={16} /></div>
                    <div className="mt-0.5 flex items-center justify-between gap-2"><span className="truncate text-xs text-muted-foreground">{last?.text ?? "Nueva conversación"}</span><span className="shrink-0 text-[0.55rem] text-muted-foreground">{last ? formatTime(last.date) : ""}</span></div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={`${mobileChat ? "flex" : "hidden lg:flex"} min-h-0 flex-1 flex-col bg-gradient-to-b from-background/70 to-card/30`}>
          {!selectedPlayer || !selectedConversation ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-muted-foreground"><MessageCircle className="h-10 w-10 text-primary/50" /><p className="font-black text-foreground">Selecciona una conversación</p><p className="max-w-sm text-xs">Aquí aparecerán las conversaciones del vestuario.</p></div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-border/60 bg-card/70 px-4 py-3 backdrop-blur">
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileChat(false)}><ArrowLeft className="h-4 w-4" /></Button>
                <PlayerFace name={selectedPlayer.name} image={faceUrl(selectedPlayer.id, selectedPlayer.cardImage)} role={roleFromPosition(selectedPlayer.position)} size={42} showRing={false} />
                <div className="min-w-0 flex-1"><div className="truncate font-black">{selectedPlayer.name}</div><div className="mt-1 flex items-center gap-2"><RoleBadge role={stats[selectedPlayer.id]?.squadRole} compact /><MoodFace morale={stats[selectedPlayer.id]?.morale ?? 70} size={15} showLabel /></div></div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                <div className="mx-auto flex max-w-3xl flex-col gap-2">
                  {selectedConversation.messages.map((message: MailboxMessage, index) => {
                    const previous = selectedConversation.messages[index - 1];
                    const showDay = !previous || previous.date !== message.date;
                    return (
                      <div key={message.id}>
                        {showDay && <div className="my-4 text-center"><span className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[0.55rem] font-black uppercase tracking-wider text-muted-foreground">{formatDay(message.date, currentDate)}</span></div>}
                        <div className={`flex ${message.sender === "manager" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm ${message.sender === "manager" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border/60 bg-card"}`}>
                            <p className="text-sm leading-relaxed">{message.text}</p>
                            <div className={`mt-1 flex items-center justify-end gap-1 text-[0.52rem] ${message.sender === "manager" ? "text-primary-foreground/70" : "text-muted-foreground"}`}><span>{formatTime(message.date)}</span>{message.sender === "manager" && (message.read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {typing && <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground">escribiendo…</div></div>}
                  <div ref={bottomRef} />
                </div>
              </div>

              <div className="border-t border-border/60 bg-card/70 p-3 backdrop-blur">
                <div className="mx-auto mb-2 max-w-3xl text-[0.58rem] font-black uppercase tracking-wider text-muted-foreground">Responder</div>
                {canRespond ? (
                  <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
                    {responseOptions.map((option, index) => (
                      <Button key={`${option.id}-${index}`} variant="secondary" size="sm" onClick={() => sendResponse(option.id)}>
                        {option.id === "promise" && <Send className="mr-1.5 h-3 w-3" />}
                        {option.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="mx-auto max-w-3xl rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Ya has respondido a este mensaje. Podrás contestar de nuevo cuando el jugador vuelva a escribir.</div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
