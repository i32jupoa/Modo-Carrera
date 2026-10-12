# Corrección del error de arranque `ReferenceError: stats is not defined`

## Síntoma

Al ejecutar `npm run dev`, TanStack Start responde con HTTP 500 y muestra una excepción en `src/store/playersStore.ts`, dentro de `recomputeTeamRating()`.

## Causa

La construcción de la media del equipo referenciaba `stats.ageOverride`, pero no existía ninguna variable `stats` en el ámbito de esa función. Como `recomputeAllTeamRatings()` se ejecuta durante la inicialización del módulo, el error ocurría antes de que la página pudiera renderizarse.

## Corrección

- Se añadió `effectivePlayerAge(fc, stats?)`, que usa la edad calculada por fecha de nacimiento o un `ageOverride` cuando el llamador tiene las estadísticas disponibles.
- `recomputeTeamRating()` usa la edad del registro base sin consultar el store. Esto es intencional: la función se ejecuta antes de inicializar Zustand.
- Las vistas del jugador y el cálculo de su valor de mercado siguen usando `ageOverride` cuando está disponible, y ahora comparten la misma lógica de edad.
- Se añadió `npm run test:startup-regression` para evitar reintroducir la referencia a `stats` sin declarar.

## Validación

Pasan los tests existentes de calendario, ascensos/descensos, overrides de liga, clasificación europea, rollover, historia, economía, longevidad de 20 temporadas, salto de calendario y equilibrio de 95.000 partidos. También pasa la prueba estática de regresión de este error.

No se pudo ejecutar la compilación integral de Vite en este entorno porque el ZIP no incluye `node_modules`; la comprobación final de `npm run dev` debe realizarse en la instalación del usuario después de extraer el ZIP e instalar las dependencias.
