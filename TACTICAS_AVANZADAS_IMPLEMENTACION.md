# Planes tácticos: mentalidad y estilo de juego

## Selección

La pantalla de Plantilla muestra tres botones en una sola fila: **Defensiva**, **Equilibrada** y **Ofensiva**. Al pulsar uno aparecen únicamente sus tres planes. Cada plan muestra una descripción breve, una ventaja y un riesgo. No hay que abrir menús adicionales para ver las opciones del grupo.

| Mentalidad | Plan | Ventaja | Riesgo |
|---|---|---|---|
| Defensiva | Bloque bajo | Protege el área y reduce los espacios interiores | Cede posesión y puede sufrir centros |
| Defensiva | Bloque medio compacto | Cierra los pases por dentro y mantiene juntas las líneas | Puede conceder centros y recupera lejos del área rival |
| Defensiva | Repliegue y contraataque | Ataca rápido los espacios tras recuperar | Tiene menos posesión y necesita velocidad arriba |
| Equilibrada | Plan equilibrado | Mantiene un bloque medio y reparte riesgos | No domina una fase concreta |
| Equilibrada | Presión en medio campo | Busca robos en zona media sin adelantar demasiado la defensa | Exige coordinación y resistencia |
| Equilibrada | Salida desde atrás | Supera la primera presión con apoyos y pases cortos | Una pérdida cerca del área propia puede ser peligrosa |
| Ofensiva | Presión alta | Recupera cerca del área rival y genera ataques tras robo | Consume energía y deja espacio a la espalda |
| Ofensiva | Ataque por bandas | Genera amplitud, desbordes y centros | Reduce presencia central y expone los laterales |
| Ofensiva | Ataque por dentro | Crea superioridad central y pases filtrados | Puede atascarse por dentro y dejar espacio exterior |

## Estilo de juego independiente

El estilo se selecciona aparte y puede combinarse con cualquiera de los nueve planes:

- **Mixto:** alterna circulación y ataques rápidos.
- **Pases cortos:** más posesión y combinaciones; sufre ante presión intensa.
- **Transiciones rápidas:** más amenaza al espacio; menos control y más desgaste.
- **Centros laterales:** más centros y llegadas al área; expone los laterales.
- **Balón largo:** supera líneas con envíos directos; sacrifica precisión y posesión.

## Comportamiento por defecto y guardados

Al entrar por primera vez en Plantilla sin un plan previo se crea y persiste **Plan equilibrado**: mentalidad Equilibrada, táctica **Plan equilibrado** y estilo **Mixto**. Ese mismo plan se guarda como táctica activa del equipo para el siguiente partido.

`normalizeTactics()` conserva la estructura de hasta tres planes, formación, once, banquillo, capitán y lanzadores. Los planes antiguos se convierten a la opción actual más cercana: la antigua línea adelantada pasa a Presión en medio campo; el antiguo juego directo pasa a Repliegue y contraataque con el estilo Balón largo; las antiguas opciones de balón parado pasan al Plan equilibrado. El estilo antiguo se conserva cuando puede inferirse.

## Integración

- `src/lib/teamTactics.ts`: catálogo de nueve planes, grupos de mentalidad, estilos independientes, migración, inicialización por defecto y selección táctica de CPU.
- `src/lib/tacticsBalance.ts`: constantes de balance para cada plan y estilo.
- `src/lib/simulation.ts`: xG, perfil de ocasiones, energía, tarjetas, lesiones y estadísticas tácticas.
- `src/lib/liveMatch.ts` y `src/lib/liveMatchEngine.ts`: efectos en el partido en vivo, momentum, comentarios y decisiones del entrenador.
- `src/lib/matchPreviewAnalysis.ts`: análisis del plan propio frente al rival.
- `src/routes/lineup.tsx` y `src/routes/match.tsx`: tres botones de mentalidad, opciones desplegadas por grupo y selección separada del estilo de juego.
- `src/lib/teamTactics.test.ts` y `src/lib/teamTactics.balance.test.ts`: pruebas de categorías, migración, relaciones de contrajuego y equilibrio estadístico.

## Validación disponible

- La matriz de las nueve opciones activas se ha comprobado con **cero relaciones de contrajuego no recíprocas**.
- La transpilación sintáctica TypeScript/TSX de los ocho archivos tácticos/UI modificados termina correctamente.
- `npm run test:season-balance`: 250 temporadas, 95.000 partidos y 2,94 goles por partido.
- `npm run test:league-realism`: correcto; media de 2,94–2,98 goles por partido según liga/ruta.

No se ha podido completar `npm ci` en este entorno (agotó el tiempo sin generar `node_modules`), por lo que Vitest y el typecheck completo quedan pendientes. Tras instalar las dependencias, ejecutar `npm run typecheck` y `npm run test:tactics-balance`.
