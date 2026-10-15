# Punto 3 — Renovaciones realistas de la IA

## Causa raíz verificada

La hipótesis de que `maxRenewals: 2` era un límite de toda la temporada no era exacta: `runClubContractCycle` también se invocaba desde el reloj diario del mercado. Sí había, no obstante, un límite explícito de dos en el cierre de temporada, y la ruta normal dejaba los intentos supeditados a los clubes seleccionados en cada día. Eso hacía que la fase final no garantizase revisar a todos los clubes de forma consistente.

Además, `attemptRenewal` actualizaba el contrato directamente, sin registrar el incremento salarial ni la prima mediante `BudgetManager.registerRenewal`. El presupuesto de la IA no reflejaba correctamente ese compromiso.

## Cambios

- `RenewalPolicy.ts` centraliza las dos fases (enero y abril-junio), las claves deterministas por temporada y la probabilidad de que el club presente una oferta según ambición, importancia deportiva, potencial y declive.
- `MarketSimulation.ts` ejecuta cada revisión para todos los clubes de IA, no sólo para el subconjunto activo del día. El resto de los ciclos diarios mantiene la revisión de transferibles, pero no duplica negociaciones de renovación.
- `ContractEngine.ts` elimina el límite fijo de dos en el cierre, prioriza jugadores clave, titulares y jóvenes útiles, respeta el margen salarial y económico, y registra las renovaciones. Los jugadores retirados quedan excluidos.
- `PlayerDecision.ts` hace que la aceptación dependa también del desajuste entre ambición del jugador y del club y de la oportunidad de minutos; la ficha pedida sigue siendo una condición separada. Una oferta externa activa con mejor salario puede inclinar al jugador a rechazar.
- `BudgetManager.ts` contabiliza las renovaciones de la IA sin descontar dos veces el mismo incremento del margen salarial. La ruta presupuestaria del club del usuario mantiene su puente existente.
- `RumorEngine` ya tenía `rumorRenewal`, pero no se invocaba desde la simulación. Ahora los intentos aceptados y rechazados se reflejan en el flujo de rumores del mercado; `RenewalLog` sigue alimentando las noticias y se persiste mediante `Persistence.ts`.
- `seasonRollover.ts` usa la política de la fase final y ya no limita las renovaciones IA a dos en el cierre.

No se añade ningún campo obligatorio a los saves, por lo que las partidas antiguas siguen utilizando la misma forma de datos.

## Prueba añadida

Comando:

```bash
npm run test:ai-contract-renewal
```

La prueba verifica el cableado de ambas fases, la eliminación del tope del cierre, el presupuesto, la persistencia de `RenewalLog`, las noticias y los rumores. Además, simula una cohorte sintética determinista de 250 clubes con dos fases de revisión; el porcentaje de titulares/importantes que renuevan queda dentro del objetivo del 55–75 % y comprueba que ningún club pierde a todo su grupo importante.

### Calibración posterior al Punto 3

La petición posterior subió el objetivo de renovaciones de titulares/importantes a aproximadamente el 90 %. `RenewalPolicy.ts` ajusta la probabilidad de oferta y `PlayerDecision.ts` utiliza ahora señales de minutos reales cuando existen. La prueba de regresión queda en **89,9 % (2.473 de 2.750)** para titulares/importantes.

Los 277 rechazos se distribuyen por una razón explícita en la cohorte de prueba: salario insuficiente (95), tope de presupuesto salarial (39), proyecto deportivo/ambición (54), prioridad del club (68), insatisfacción (14) y pocos minutos (7). La señal de estrella ignorada exige que su OVR supere al rating del XI y que consten pocos minutos; no se supone que un `minutesShare` inicial de cero sea frustración.

La cohorte sigue siendo una prueba sintética determinista de política y regresión, no una simulación integral de una partida cargada con todo el catálogo real de jugadores. Los resultados sirven para validar la lógica, los motivos de rechazo y el rango aproximado; el typecheck completo sigue necesitando instalar las dependencias de Vite.
