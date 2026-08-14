# Tests del motor de mercado

Se ha añadido `vitest` como scaffolding (no estaba instalado, y este
entorno no tiene acceso a red para instalarlo, así que **no se ha podido
ejecutar `npm install` ni correr esta suite todavía**). Antes de fiarte de
ella:

```bash
npm install
npm run test        # una vez
npm run test:watch  # modo watch
```

## Qué cubre `NegotiationEngine.test.ts`

Fija el contrato del arreglo de `buyerClubId`/`sellerClubId` en
`TransferOffer` (antes `fromClubId`/`toClubId`, con nombres que sugerían lo
contrario de lo que realmente contenían). Es una función pura, sin datos de
clubes/jugadores reales de por medio, así que no debería dar problemas.

## Qué falta por cubrir (deliberadamente no incluido aquí)

- `completeTransfer` / `forceSellSurplusPlayer` / `attemptEliteDeparture`:
  necesitan un club y un jugador reales de `PlayerIndex` (o mocks de
  `@/data/teams` y `@/data/playersData`). No los he escrito porque no podía
  ejecutarlos aquí para comprobar que compilan y pasan; mejor no dejar tests
  rotos que dar falsa confianza.
- `simulateUntil` (aviso al recortar un salto de días muy grande): requiere
  inicializar la simulación completa. Mismo motivo.
- `BidWar.escalatedPrice` / `sellerShouldWait`: dependen de
  `ClubStrategy.getClubProfile`, que a su vez necesita un id de club real de
  `@/data/teams`.

Si quieres, en la siguiente vuelta puedo escribir estos usando IDs reales de
`src/data/teams.ts`, pero tendrás que ejecutarlos tú (o pegarme la salida)
para que los ajuste si fallan a la primera.
