type Pos = string;
type Player = { id: string; name: string; positions: Pos[]; rating: number; energy?: number };
type SubstitutionEvent = { minute:number; team:"home"|"away"; playerOutId:string; playerOutName:string; playerInId:string; playerInName:string };
type SimTactics = any;
type InjuryEvent = {
  team:"home"|"away"; playerId:string; playerName:string; weeks:number; durationDays?:number;
  injuryType?:string; bodyPart?:string; diagnosis?:string; reason:string; minute?:number;
  replacementId?:string; replacementName?:string; forcedSub?:boolean;
};

let randomQueue:number[] = [
  0.01, // minute -> 5 + floor(.01*80) = 5, not 6; replaced below with .02
];
function rand(){ return randomQueue.shift() ?? 0; }
function activePlayersAt(xi:Player[], _bench:Player[], _subs:SubstitutionEvent[], _reds:Map<string,number>, _team:"home"|"away", _minute:number){ return xi; }
function tacticsModifiers(_tactics:any){ return {stamina:1}; }
function drainPerMinute(_position:string,_pressure:any,_mult:number){ return 0; }
function fatigueInjuryRisk(_stamina:number){ return 1; }
function injuryChanceForLeague(teamCount:number){ return Math.min(0.45, Math.max(0.12, 5.5 / Math.max(1,teamCount))); }
function rollInjuryDurationDays(){ return 7; }
function rollInjuryProfile(){ return {type:"Lesión muscular", area:"Muslo", diagnosis:"Contractura muscular", weight:24}; }

function maybeInjury(
  xi: Player[],
  team: "home" | "away",
  bench: Player[] = [],
  plannedSubs: SubstitutionEvent[] = [],
  redCards: Map<string, number> = new Map(),
  tactics: SimTactics | null = null,
  leagueTeamCount = 20,
): InjuryEvent | null {
  const minute = 5 + Math.floor(rand() * 80);
  const active = activePlayersAt(xi, bench, plannedSubs, redCards, team, minute);
  if (active.length === 0) return null;

  const pressure = (tactics?.pressure ?? "medium") as "low" | "medium" | "high";
  const staminaMult = tacticsModifiers(tactics).stamina;
  const candidates = active.map((player) => {
    const priorSub = plannedSubs
      .filter((sub) => sub.team === team && sub.playerInId === player.id && sub.minute <= minute)
      .sort((a, b) => b.minute - a.minute)[0];
    const startedWith = priorSub ? 100 : (player.energy ?? 100);
    const elapsed = priorSub ? Math.max(0, minute - priorSub.minute) : minute;
    const estimatedStamina = Math.max(
      0,
      startedWith - elapsed * drainPerMinute(player.positions?.[0] ?? "CM", pressure, staminaMult),
    );
    return {
      player,
      estimatedStamina,
      fatigueRisk: fatigueInjuryRisk(estimatedStamina),
    };
  });

  // A typical match injury is still uncommon, but slightly more likely than before.
  // Once a player is below 40% energy, the match-level risk rises sharply.
  const anyVeryTired = candidates.some((c) => c.estimatedStamina < 40);
  const baseChance = injuryChanceForLeague(leagueTeamCount);
  const matchInjuryChance = Math.min(0.55, baseChance * (anyVeryTired ? 2.2 : 1));
  if (rand() > matchInjuryChance) return null;

  // Fatigue also makes the low-energy players more likely to be the one who
  // actually suffers the injury.
  const weighted = candidates.map((c) => ({
    player: c.player,
    weight: Math.max(0.25, c.fatigueRisk),
  }));
  const totalWeight = weighted.reduce((sum, c) => sum + c.weight, 0);
  let pick = rand() * totalWeight;
  let victim = weighted[weighted.length - 1].player;
  for (const candidate of weighted) {
    pick -= candidate.weight;
    if (pick <= 0) {
      victim = candidate.player;
      break;
    }
  }

  const durationDays = Math.min(180, rollInjuryDurationDays());
  const profile = rollInjuryProfile();

  // A forced substitution happens whenever a bench player of a compatible
  // profile is available and the injury happens before the 88th minute.
  //
  // IMPORTANT: planned tactical substitutions are generated before injuries, but
  // substitutions scheduled AFTER the injury have not been used yet. They must
  // not prevent the injury replacement from being created. If the chosen
  // replacement was itself planned to enter later, the reconciliation pass below
  // cancels that later tactical change so the match still respects the 5-sub cap.
  const plannedIncomingIdsAtInjury = new Set(
    plannedSubs
      .filter((s) => s.team === team && s.minute <= minute)
      .map((s) => s.playerInId),
  );
  const replacementCandidates = bench.filter(
    (p) => p.id !== victim.id && !plannedIncomingIdsAtInjury.has(p.id),
  );
  const samePos = replacementCandidates.filter((p) =>
    p.positions.some((pos) => victim.positions.includes(pos)),
  );
  const replacement = (samePos.length > 0 ? samePos : replacementCandidates)
    .slice()
    .sort((a, b) => b.rating - a.rating)[0];

  // Only substitutions that have already happened at the injury minute count
  // against the live 5-change allowance. Future planned changes are reconciled
  // after the injury is known, so an early injury can always consume an unused
  // substitution slot when a legal replacement exists.
  const teamSubCountAtInjury = plannedSubs.filter(
    (s) => s.team === team && s.minute <= minute,
  ).length;
  const canForceSub = teamSubCountAtInjury < 5 && !!replacement && minute < 88;
  const reason = `${profile.diagnosis} · ${profile.area}`;

  return {
    team,
    playerId: victim.id,
    playerName: victim.name,
    weeks: Math.max(1, Math.ceil(durationDays / 7)),
    durationDays,
    injuryType: profile.type,
    bodyPart: profile.area,
    diagnosis: profile.diagnosis,
    minute,
    reason,
    forcedSub: canForceSub,
    replacementId: canForceSub ? replacement.id : undefined,
    replacementName: canForceSub ? replacement.name : undefined,
  };
}


function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const xi: Player[] = [
  {id:"o0", name:"Adama Traoré", positions:["ED"], rating:84, energy:100},
  {id:"o1", name:"Jugador 2", positions:["MC"], rating:80, energy:100},
  {id:"o2", name:"Jugador 3", positions:["MC"], rating:80, energy:100},
  {id:"o3", name:"Jugador 4", positions:["DFC"], rating:80, energy:100},
  {id:"o4", name:"Jugador 5", positions:["LI"], rating:80, energy:100},
  {id:"o5", name:"Jugador 6", positions:["DC"], rating:80, energy:100},
  {id:"o6", name:"Jugador 7", positions:["MC"], rating:80, energy:100},
  {id:"o7", name:"Jugador 8", positions:["DFC"], rating:80, energy:100},
  {id:"o8", name:"Jugador 9", positions:["MC"], rating:80, energy:100},
  {id:"o9", name:"Jugador 10", positions:["DC"], rating:80, energy:100},
  {id:"o10", name:"Portero", positions:["GK"], rating:80, energy:100},
];
const bench: Player[] = [
  {id:"i0", name:"Extremo suplente", positions:["ED"], rating:82, energy:100},
  {id:"i1", name:"S1", positions:["MC"], rating:81},
  {id:"i2", name:"S2", positions:["MC"], rating:81},
  {id:"i3", name:"S3", positions:["DFC"], rating:81},
  {id:"i4", name:"S4", positions:["LI"], rating:81},
  {id:"i5", name:"S5", positions:["DC"], rating:81},
];
const plannedSubs: SubstitutionEvent[] = [
  {minute:47,team:"away",playerOutId:"o1",playerOutName:"",playerInId:"i1",playerInName:""},
  {minute:52,team:"away",playerOutId:"o2",playerOutName:"",playerInId:"i2",playerInName:""},
  {minute:52,team:"away",playerOutId:"o3",playerOutName:"",playerInId:"i3",playerInName:""},
  {minute:52,team:"away",playerOutId:"o4",playerOutName:"",playerInId:"i4",playerInName:""},
  {minute:70,team:"away",playerOutId:"o5",playerOutName:"",playerInId:"i5",playerInName:""},
];

// rand order: minute, injury chance (force injury), victim selection, duration, profile
randomQueue = [0.02, 0.0, 0.0, 0.0, 0.0];
const injury = maybeInjury(xi,"away",bench,plannedSubs,new Map(),"medium",20);
assert(!!injury, "injury should be generated");
assert(injury.minute === 6, "injury should be at minute 6");
assert(injury.playerId === "o0", "expected first player as deterministic victim");
assert(injury.forcedSub === true, "future planned substitutions must not block forced substitution");
assert(injury.replacementId === "i0", "compatible unused bench player should be chosen");
console.log("maybeInjury early-forced-sub regression: OK");
