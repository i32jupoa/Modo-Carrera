# Corrección definitiva de la Central

## Causa
Al crear una partida nueva, `newSave()` copiaba las fechas del calendario `ScheduleFixture` a los fixtures de `SaveGame`. `ScheduleFixture` usa `homeTeam`/`awayTeam`, no `homeId`/`awayId`, y la versión anterior sobrescribía los IDs canónicos con `undefined`.

Eso dejaba los fixtures de Liga sin `homeId`/`awayId`, por lo que `getMyNextFixtureAny()` descartaba todos los partidos y la Central quedaba sin próximo partido.

## Corrección
- `newSave()` conserva los IDs del fixture canónico y usa `homeTeam`/`awayTeam` solo como fallback.
- `loadSave()` repara automáticamente una partida existente si encuentra fixtures de Liga con IDs faltantes.
- La reparación solo completa IDs; no mueve fechas, no cambia resultados y no regenera el calendario.
- `store.ts` y `season.tsx` pasan la transpilación TypeScript dirigida.
