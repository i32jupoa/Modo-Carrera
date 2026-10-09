# Mejora de Cantera — entrega

## Qué encontré

- `src/lib/academy/academyGenerator.ts`: origen/generación determinista de canteranos.
- `src/lib/academy/academyTypes.ts`: modelo persistible de jugador/club de cantera y estadísticas.
- `src/lib/academy/academyProgression.ts`: avance mensual; ahora integra rendimiento de partidos de cantera y excluye `called-up`.
- `src/lib/academy/academySimulation.ts`: nueva simulación semanal abstracta contra rivales ficticios; genera estadísticas separadas de primer equipo.
- `src/lib/academy/academyPersistence.ts`: normalización/migración de partidas existentes.
- `src/lib/academy/academyStore.ts`: operaciones de usuario, promoción, convocatoria, cesión y venta.
- `src/routes/cantera.tsx`: listado/acciones/UI de cantera.
- `src/components/PlayerDetailDialog.tsx`: detalle y estadísticas separadas de cantera.
- `src/lib/positions.ts`: ordenación compartida con Plantilla.
- `src/routes/squad.tsx`: mantiene el mismo orden compartido y sirve como referencia de los flujos de Mercado.

## Decisiones

1. La competición de cantera es abstracta: no modifica el calendario oficial ni crea rivales reales del juego. Cada 7 días se simula un partido del filial/juvenil con rival ficticio.
2. Solo `academy` y `listed` participan en estos partidos. `loaned` conserva su seguimiento de cesión y `called-up` progresa/estadísticas por el primer equipo.
3. Cada partido rota un once de 11 y hasta 3 sustitutos de forma determinista. Las estadísticas incluyen PJ, minutos, goles, asistencias, porterías a cero, amarillas, rojas y valoración.
4. El crecimiento se aplica mensualmente con un OVR interno decimal persistente. La UI continúa mostrando el OVR redondeado a entero.
5. La subida/bajada de OVR puede ser positiva o ligeramente negativa cuando el rendimiento es suficientemente malo; la edad, potencial, minutos, valoración, instalaciones y entrenador modulan la magnitud.
6. Las posiciones secundarias salen únicamente de `ACADEMY_SECONDARY_POSITION_COMPATIBILITY`, con probabilidad configurable. GK nunca recibe secundaria.
7. La composición objetivo para 28 jugadores es 3 GK, 9 DEF, 8 MID y 8 FWD, con reparto configurable por posición. Las altas nuevas priorizan la demarcación primaria más deficitaria.
8. El máximo de cantera es 28. La plantilla profesional sigue sin límite máximo.
9. El flujo de cesión usa el mismo `LoanSearchModal` que Plantilla; el listado/retirada de venta usa `listForTransfer`/`unlistFromTransfer` del motor existente.
10. La persistencia eleva `ACADEMY_STATE_VERSION` a 4 y migra `internalOvr` desde el último snapshot mensual cuando sea posible, o desde el OVR visible en partidas antiguas.

## Archivos modificados

- `src/lib/academy/academyTypes.ts`
- `src/lib/academy/academyConstants.ts`
- `src/lib/academy/academyGenerator.ts`
- `src/lib/academy/academyGenerator.test.ts`
- `src/lib/academy/academySimulation.ts`
- `src/lib/academy/academySimulation.test.ts`
- `src/lib/academy/academyProgression.ts`
- `src/lib/academy/academyPersistence.ts`
- `src/lib/academy/academyAdapters.ts`
- `src/lib/academy/academyCallUp.ts`
- `src/lib/academy/academyLoanBridge.ts`
- `src/lib/academy/academyAnalytics.ts`
- `src/lib/academy/academyPromotionEngine.ts`
- `src/lib/academy/academyStore.ts`
- `src/lib/positions.ts`
- `src/routes/cantera.tsx`
- `src/routes/squad.tsx`
- `src/components/PlayerDetailDialog.tsx`

## Validación realizada

- Parseo sintáctico de todos los `.ts`/`.tsx` del proyecto: 0 diagnósticos.
- `Math.random()` en `src/lib/academy`: no hay coincidencias.
- No queda un `maxPlayers: 22` ni otro límite de 22 en la lógica de academia.
- El ZIP no incluye `node_modules`.

El `typecheck` completo no se puede declarar limpio en este entorno porque las dependencias del proyecto no están instaladas; se ha usado validación sintáctica independiente para no confundir errores de entorno con errores del código.
