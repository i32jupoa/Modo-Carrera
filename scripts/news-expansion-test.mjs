import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterStoriesByEntityCooldown, isWithinNewsWindow } from '../src/lib/news/newsRules.ts';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

assert.equal(isWithinNewsWindow('2027-05-30', '2027-05-30', 30), true, 'hoy cuenta como noticia reciente');
assert.equal(isWithinNewsWindow('2027-05-01', '2027-05-30', 30), true, 'el límite de 30 días es inclusivo');
assert.equal(isWithinNewsWindow('2027-04-29', '2027-05-30', 30), false, 'no debe superar la ventana de 30 días');
assert.equal(isWithinNewsWindow('2027-05-31', '2027-05-30', 30), false, 'no se deben publicar hechos futuros');
assert.equal(isWithinNewsWindow('fecha incorrecta', '2027-05-30', 30), false, 'las fechas inválidas se descartan');

const stories = [
  { id: 'interest-new', date: '2027-05-30', type: 'interest', entityId: 'player-1' },
  { id: 'interest-old', date: '2027-05-27', type: 'interest', entityId: 'player-1' },
  { id: 'bid-war-same-player', date: '2027-05-29', type: 'bid-war', entityId: 'player-1' },
  { id: 'interest-other-player', date: '2027-05-29', type: 'interest', entityId: 'player-2' },
  { id: 'interest-stale', date: '2027-04-01', type: 'interest', entityId: 'player-3' },
  { id: 'future-story', date: '2027-06-01', type: 'interest', entityId: 'player-4' },
];
const cooled = filterStoriesByEntityCooldown(stories, '2027-05-30', { windowDays: 30, cooldownDays: 5 });
assert.deepEqual(cooled.map((story) => story.id), [
  'interest-new',
  'bid-war-same-player',
  'interest-other-player',
], 'se conserva el rumor más reciente por tipo y jugador, pero se permite un hecho distinto');

const [engine, cache, themes, events, panel] = await Promise.all([
  read('../src/lib/news/newsEngine.ts'),
  read('../src/lib/news/newsCache.ts'),
  read('../src/components/news/newsThemes.ts'),
  read('../src/lib/news/NewsEvents.ts'),
  read('../src/components/news/NewsCarousel.tsx'),
]);
assert.match(engine, /function rumorNews\(/, 'el motor debe transformar rumores reales en noticias');
assert.match(engine, /function retirementNews\(/, 'el motor debe generar noticias de retirada');
assert.match(engine, /filterStoriesByEntityCooldown\(/, 'los rumores deben tener enfriamiento por entidad');
assert.match(engine, /listRumors\(120\)/, 'las noticias deben consumir rumores persistidos del mercado');
assert.match(engine, /ctx\.save\.retiredPlayers/, 'las retiradas deben proceder del guardado activo');
assert.match(engine, /isWithinNewsWindow\(record\.retiredAt, referenceDate, 45\)/, 'las retiradas antiguas no deben reaparecer como nuevas');
assert.match(cache, /listRumors\(1\)/, 'la caché debe invalidarse cuando aparece un rumor');
assert.match(cache, /latestRetirement\?\.retiredAt/, 'la caché debe invalidarse cuando entra una retirada');
assert.match(cache, /save\.currentDate/, 'la caché debe avanzar con la fecha de la partida');
assert.match(themes, /retirada:/, 'la UI debe tener una temática de despedida');
assert.match(panel, /NEWS_THEMES\[current\.theme/, 'el carrusel debe usar la nueva temática sin una ruta especial');
assert.match(events, /MAX_NEWS_STORIES/, 'el estado estructurado mantiene sus límites de tamaño');

console.log('news-expansion-test: OK');
console.log('✓ Vigencia temporal: fechas inválidas/futuras excluidas y límite inclusivo');
console.log('✓ Enfriamiento por tipo y entidad: suprime rumores repetidos sin borrar historias diferentes');
console.log('✓ Integración: rumores persistidos, retiradas recientes, caché y tema visual');
