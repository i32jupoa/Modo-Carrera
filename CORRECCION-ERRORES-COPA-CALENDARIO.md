# Corrección de errores al abrir Copa y Calendario

## Causas confirmadas por los logs

1. `src/lib/store.ts`, función `fixCupDraws(save)`: la función intentaba leer `parsed.season`, pero `parsed` solo existe dentro de `loadSave()`. Se cambió por el año calculado desde el parámetro válido `save.season`.
2. `src/routes/cup.tsx`, componente `RoundBlock`: el componente auxiliar intentaba leer `save.season`, una variable local de `CupPage` que no existe en el ámbito de `RoundBlock`. La página ahora pasa `seasonStartYear` como propiedad explícita.

## Comportamiento adicional corregido

- `fixCupDraws` marca las migraciones de estructura y fechas como cambios.
- Si no necesita reparar nada, devuelve la misma referencia de guardado y evita escrituras innecesarias al montar Calendario.

## Validación ejecutada

- `npm run test:cup-calendar-runtime`
- `npm run test:season-calendar`
- `npm run test:season-promotion`
- `npm run test:team-league-overrides`
- `npm run test:season-european`
- `npm run test:season-rollover`
- `npm run test:season-history`
- `npm run test:season-economy`
- `npm run test:season-lifetime`
- `npm run test:startup-regression`
- `npm run test:calendar-jump`
- `npm run test:season-balance` (95.000 partidos)

Estas pruebas automatizadas pasaron. No se ha certificado una prueba end-to-end en el navegador de Windows.
