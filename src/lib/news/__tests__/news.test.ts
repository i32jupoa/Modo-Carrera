import assert from "node:assert/strict";
import { renderNewsEvent } from "../NewsText.ts";
import { detectFixtureFacts, detectStandingsFacts } from "../NewsDetectorCore.ts";

test("las noticias sólo redactan datos presentes en el hecho", () => {
  const event = detectFixtureFacts(
    {
      id: "test-match-1",
      date: "2026-10-07",
      matchday: 8,
      competition: "league",
      league: "laliga",
      homeId: "rma",
      awayId: "bar",
      result: {
        homeGoals: 2,
        awayGoals: 1,
        events: [
          { minute: 90, team: "home", type: "goal", scorerId: "p1", scorerName: "Jugador Real" },
          { minute: 72, team: "home", type: "goal", scorerId: "p1", scorerName: "Jugador Real" },
        ],
      },
    },
    "2026-10-07",
    undefined,
    undefined,
    (teamId) => ({ value: teamId === "rma" ? 85 : 70 }),
  ).find((fact) => fact.type === "match")!;

  assert.ok(event, "debe existir un hecho de partido");
  const rendered = renderNewsEvent(event);
  const text = `${rendered.title} ${rendered.intro} ${rendered.body}`;
  assert.match(text, /Jugador Real/);
  assert.match(text, /2-1/);
  assert.ok(!text.includes("Manchester City"));
});

test("la misma semilla produce el mismo texto", () => {
  const event = {
    id: "seed-a",
    date: "2026-10-07",
    type: "transfer",
    category: "mercado",
    relevance: 80,
    entities: { playerIds: ["p1"], teamIds: ["a", "b"] },
    data: {
      scorerNames: ["Jugador Test"],
      fromClubId: "a",
      fromClubName: "Club A",
      toClubId: "b",
      toClubName: "Club B",
      transferFee: 200_000_000,
      transferType: "permanent",
    },
  } as const;
  assert.deepEqual(renderNewsEvent(event), renderNewsEvent(event));
});

test("semillas distintas pueden cambiar las variantes", () => {
  const base = {
    date: "2026-10-07",
    type: "match" as const,
    category: "liga" as const,
    relevance: 70,
    entities: { teamIds: ["a", "b"] },
    data: {
      homeName: "Club A",
      awayName: "Club B",
      homeGoals: 2,
      awayGoals: 0,
      result: "2-0",
    },
  };
  const a = renderNewsEvent({ ...base, id: "seed-1" });
  const b = renderNewsEvent({ ...base, id: "seed-2" });
  assert.notEqual(`${a.title}${a.intro}${a.body}`, `${b.title}${b.intro}${b.body}`);
});

test("sin hecho real no se emite ninguna noticia", () => {
  const facts = detectFixtureFacts(
    {
      id: "unplayed",
      matchday: 1,
      competition: "league",
      league: "laliga",
      homeId: "rma",
      awayId: "bar",
    },
    "2026-10-07",
  );
  assert.deepEqual(facts, []);
});

function test(name: string, fn: () => void): void {
  fn();
  console.log(`✓ ${name}`);
}


test("un cambio de líder se construye sólo con la tabla anterior y la nueva", () => {
  const [event] = detectStandingsFacts(
    { laliga: [
      { teamId: "bar", played: 0, points: 50, gd: 20 },
      { teamId: "rma", played: 0, points: 48, gd: 18 },
    ] },
    { laliga: [
      { teamId: "rma", played: 10, points: 51, gd: 22 },
      { teamId: "bar", played: 10, points: 50, gd: 20 },
    ] },
    "2026-10-07",
    "rma",
  );

  assert.equal(event.type, "standings_change");
  assert.equal(event.data.previousLeaderId, "bar");
  assert.equal(event.data.newLeaderId, "rma");
  assert.equal(event.data.teamId, "rma");
});
