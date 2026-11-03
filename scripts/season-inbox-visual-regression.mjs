import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mailbox = await readFile(new URL('../src/routes/mailbox.tsx', import.meta.url), 'utf8');
assert.match(mailbox, /import \{ TeamLogo \} from "@\/components\/TeamLogo"/, 'el buzón debe usar escudos reales');
assert.match(mailbox, /import \{ PlayerFace, roleFromPosition \} from "@\/components\/PlayerFace"/, 'el buzón debe usar el componente de retratos');
assert.match(mailbox, /faceUrl\(item\.playerId, player\?\.cardImage\)/, 'el retrato debe resolver tanto la imagen del dataset como la carta de la plantilla');
assert.match(mailbox, /teamById\(save\.myTeamId, \{ teamLeagueOverrides: save\.teamLeagueOverrides \}\)/, 'el escudo debe respetar la liga actual del club en esta carrera');
assert.match(mailbox, /overflow-hidden rounded-2xl border/, 'las noticias deben renderizarse como tarjetas visuales');
assert.match(mailbox, /bg-gradient-to-br from-background\/90 via-secondary\/45 to-background\/75/, 'las tarjetas deben tener una franja visual integrada');
assert.match(mailbox, /onClick=\{\(\) => markOneRead\(item\.id\)\}/, 'pulsar el mensaje debe marcarlo como leído');
assert.doesNotMatch(mailbox, /TeamBadge/, 'el buzón no debe usar insignias de iniciales en lugar del escudo');

const teamLogo = await readFile(new URL('../src/components/TeamLogo.tsx', import.meta.url), 'utf8');
assert.match(teamLogo, /\/logos\/\$\{encodedLeague\}\/\$\{encodedTeam\}\.png/, 'el escudo debe servirse desde public/logos');
assert.match(teamLogo, /\/logos\/\$\{encodedLeague\}\/\$\{encodedTeam\}\.svg/, 'se debe admitir escudo SVG si no hay PNG');

const face = await readFile(new URL('../src/components/PlayerFace.tsx', import.meta.url), 'utf8');
assert.match(face, /onError=\{\(\) => setFailed\(true\)\}/, 'un retrato inexistente debe caer en iniciales y no romper la tarjeta');

console.log('season-inbox-visual-regression: OK');
console.log('✓ Escudo oficial desde public/logos, con liga dinámica y fallback');
console.log('✓ Retrato del jugador desde datos/carta, con fallback a iniciales');
console.log('✓ Diseño de tarjetas visuales y lectura automática conservados');
