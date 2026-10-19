import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [playerIndex, rollover, savedGames, playerStore, transfers, loans, userNegotiation, marketClock] = await Promise.all([
  read('../src/lib/transfers/PlayerIndex.ts'),
  read('../src/lib/season/seasonRollover.ts'),
  read('../src/lib/savedGames.ts'),
  read('../src/store/playersStore.ts'),
  read('../src/lib/transfers/TransferEngine.ts'),
  read('../src/lib/transfers/LoanEngine.ts'),
  read('../src/lib/transfers/UserNegotiation.ts'),
  read('../src/hooks/useMarketClock.ts'),
]);

// La retirada forma parte del delta que se persiste y se restaura.
assert.match(playerIndex, /retired\?: boolean;/, 'PlayerDelta debe persistir el estado retired');
assert.match(playerIndex, /player\.retired !== undefined \? \{ retired: player\.retired \} : \{\}/, 'deltaOf debe serializar retired');
assert.match(playerIndex, /delta\.retired \? null : legacyLoan \? delta\.loanClubId : delta\.clubId/, 'restaurar un retirado debe forzar clubId=null');
assert.match(playerIndex, /export function ensurePlayersRetired\(/, 'debe existir la reconciliación del ledger de retiradas');
assert.match(playerIndex, /if \(player\.retired \|\| isRetiredIdentity\(playerId, player\.name\)\)/, 'no se puede reasignar un retirado a una plantilla ni a agentes libres');
assert.match(playerIndex, /export function setRetiredPlayersLedger\(/, 'el índice debe hidratar el ledger antes de cargar el mercado');
assert.match(playerIndex, /const retiredLedgerNames = new Set<string>\(\)/, 'el ledger debe reconocer retirados aunque haya fichas duplicadas con otro ID');
assert.match(playerIndex, /normalizePlayerIdentity\(player\.name\)/, 'la identidad del retirado debe normalizar nombre y tildes');
assert.match(playerIndex, /function deactivateRetiredPlayer\(/, 'los retirados deben eliminarse de todos los índices activos');
assert.match(playerIndex, /\.filter\(\(player\) => !player\.retired\)/, 'las consultas de jugadores libres deben excluir retirados');

// La retirada tiene que ocurrir antes de renovar o liberar contratos.
const retirementDecision = rollover.indexOf('const retirements = selectSeasonRetirements');
const contractCycle = rollover.indexOf('runClubContractCycle(team.id');
const contractAdvance = rollover.indexOf('advanceContracts(dates.endDate');
assert.ok(retirementDecision >= 0 && contractCycle > retirementDecision, 'primero se deciden las retiradas y después las renovaciones IA');
assert.ok(contractAdvance > retirementDecision, 'los vencimientos de contrato se procesan después de retirar');
assert.match(rollover, /ensurePlayersRetired\(retirements\.map\(\(retirement\) => retirement\.playerId\)\)/, 'el cierre debe aplicar la retirada canónica');
assert.match(rollover, /contractYearsLeft: player\.contract\.yearsLeft/, 'la curva de retirada debe tener en cuenta el fin de contrato');

// El ledger del SaveGame repara el caso en que falte el snapshot de IndexedDB.
assert.match(savedGames, /const retiredIds = new Set\(retiredRecords\.map\(\(record\) => String\(record\.playerId\)\)\)/, 'la carga debe recuperar IDs del ledger');
assert.match(savedGames, /setRetiredPlayersLedger\(retiredRecords\)/, 'la carga debe restaurar IDs y nombres retirados');
assert.match(savedGames, /!isRetiredIdentity\(String\(playerId\), player\)/, 'los jugadores dinámicos retirados no deben restaurarse');
assert.match(savedGames, /for \(const playerId of retiredIds\) clubOverrides\[playerId\] = ""/, 'el ledger debe impedir que el jugador vuelva a una plantilla');
assert.match(savedGames, /retiredIds\.has\(String\(playerId\)\)/, 'los retirados no deben entrar en el roster ni en cesiones guardadas');
assert.match(marketClock, /ensurePlayersRetired\(\(activeSave\?\.retiredPlayers \?\? \[\]\)\.map\(\(player\) => player\.playerId\)\)/, 'el arranque del mercado debe reconciliar el ledger');

// Los puntos de entrada de búsqueda, fichaje y cesión también se protegen.
assert.match(playerStore, /if \(getMarketPlayer\(id\)\?\.retired\) continue/, 'searchMarket no debe listar retirados');
assert.match(transfers, /if \(!player \|\| player\.retired\) return null/, 'completeTransfer debe rechazar retirados');
assert.match(loans, /if \(!player \|\| player\.retired \|\| !player\.clubId \|\| player\.loanClubId\) return base/, 'no se debe poder iniciar una cesión de un retirado');
assert.match(userNegotiation, /if \(player\.retired\) return \{ ok: false, reason: "Este jugador se ha retirado y ya no está disponible\." \}/, 'una oferta manual debe explicar que el jugador está retirado');
assert.match(userNegotiation, /if \(getPlayer\(deal\.playerId\)\?\.retired\) \{[\s\S]*?deal\.stage = "failed"[\s\S]*?la negociación queda anulada/, 'las negociaciones antiguas se cancelan cuando el jugador se retira');
assert.match(userNegotiation, /El jugador se ha retirado y la negociación ya no puede completarse/, 'finalizeUserDeal debe bloquear una negociación obsoleta');

console.log('retirement-persistence-regression: OK');
