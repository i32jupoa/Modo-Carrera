# Implementación del módulo Cantera

## Estado

El módulo de Cantera está implementado sobre la arquitectura existente, sin modificar `routeTree.gen.ts` y manteniendo separados el dominio de cantera y la UI.

## Fase 1 — completada

- Modelo tipado `AcademyPlayer` / `ClubAcademyState` con estados de cantera, cesión, convocatoria y promoción.
- Generación determinista por `saveId + teamId + temporada` utilizando el RNG existente; no se usa `Math.random()` en el módulo.
- IDs numéricos reservados desde `900000000`, separados de `playersData`.
- Nombres nacionales, posiciones, atributos coherentes con OVR, potencial real oculto y rango de potencial visible.
- Perfiles de crecimiento: normal, precoz, late bloomer y estancado.
- Rasgos de cantera: diamante en bruto, talento precoz, late bloomer, trabajador y temperamental.
- Calidad/volumen derivados de `ClubStrategy`, instalaciones y contexto del club.
- Persistencia por partida en IndexedDB con versión/migración. La cantera del usuario se guarda completa; las canteras IA se generan bajo demanda y sólo se conservan sus cambios reales.
- `/cantera` dentro de `Mi equipo`, con filtros, orden, búsqueda, resumen e indicadores.
- `PlayerDetailDialog` reutilizado con `academyMode` en lugar de crear una ficha paralela.
- Promoción manual del usuario con contrato profesional, sueldo, cláusula y control del máximo de 28.
- Jugador promovido integrado en `playersStore`, stats, `PlayerIndex`, mercado, `teamRating`, alineaciones y simulación.
- Insignia de canterano con año de promoción en Plantilla/ficha.
- Avatar procedural cuando el jugador no dispone de fotografía.
- Acciones de usuario: promocionar, convocar, buscar cesión, poner en venta, renovar contrato juvenil, liberar y bajar un joven del primer equipo a la cantera.

## Fase 2 — completada

- Progresión juvenil mensual y de cambio de temporada con techo en potencial.
- Influencia de edad, perfil, rasgos, instalaciones, entrenador juvenil, mentor, cesión y reconversión.
- Nueva promoción anual de 4–6 jugadores de entrada.
- Instalaciones 1–5 mejorables con presupuesto.
- Entrenador juvenil 1–5.
- Promociones IA en pretemporada, cierre de mercado y emergencias.
- La IA no promociona automáticamente jugadores del club controlado por el usuario.
- Solución interna de cantera antes de generar un fichaje externo para una necesidad compatible.
- Límite de plantilla y límites de promoción por ventana.
- Registro estructurado de promociones y noticias específicas de cantera.
- Punto de notificación de cantera en la barra lateral.
- Integración con cesiones: `LoanEngine`, estado `loaned`, retorno, compra definitiva y seguimiento periódico.
- Informes mensuales de cesiones de cantera en el Buzón.
- Convocatoria puntual con primer equipo sin ocupar una plaza de plantilla; el simulador añade esos jugadores como `called-up`.
- Mapa de necesidades por posición dentro de la pantalla de Cantera reutilizando `SquadAnalyzer`.
- Comparador básico de promesas.
- Mentores con requisito de veterano de 30+ y efecto sobre progresión/moral.
- Reconversión de posición con coste y penalización temporal de progreso.

## Fase 3 — integrada

- Pestaña Cantera en Centro de Clubes con las 5 promesas destacadas del equipo consultado.
- Ranking mundial de mejores canteras.
- Ranking mundial de mejores promesas.
- Apartado de premios con `Joya de la cantera`, mejor cantera e hijos de la cantera.
- Estructura de historial de trayectoria/Hall of Fame basada en eventos de promoción.
- Datos de futura venta y cláusula de recompra asociados a operaciones de canteranos.
- Arquitectura preparada para ampliaciones posteriores sin mezclar el estado de cantera con el mercado general.

## Puntos de integración principales

- `AppSidebar.tsx`: navegación y badge.
- `PlayerDetailDialog.tsx`: ficha común y acciones de cantera.
- `squad.tsx`: insignia/descenso de jóvenes a cantera.
- `playersStore.ts`: jugadores dinámicos, stats, convocatoria y simulación.
- `PlayerIndex.ts`: jugadores promovidos como integrantes reales de la plantilla; los juveniles en cantera/cesión/venta no inflan la plantilla.
- `TransferEngine.ts`: comprobación de solución interna antes del fichaje.
- `MarketSimulation.ts`: hooks de progresión, promociones y sincronización de cesiones.
- `savedGames.ts`: snapshot de jugadores dinámicos y hechos de cantera.
- `newsEngine.ts`: noticias estructuradas de promociones.
- `mailbox.tsx`: informes de seguimiento de cesiones.
- `teams.tsx`, `scorers.tsx`, `awards.tsx`: Centro de Clubes, rankings y premios.

## Verificación realizada

- Parseo TypeScript/TSX de todos los archivos nuevos/modificados relacionados: **0 errores de sintaxis**.
- Búsqueda de `Math.random()` en `src/lib/academy`: **ninguna coincidencia**.
- Referencias a `routeTree.gen.ts` dentro de la implementación de Cantera: **ninguna**.
- Se revisó la integración para evitar que los estados `loaned`/`listed` cuenten como plantilla del primer equipo.
- Se corrigió la progresión anual para que no elimine por accidente a convocados o cedidos del usuario.
- Se corrigió la promoción IA para que nunca automatice promociones del club del usuario.

## Validación de proyecto completo

`npm run typecheck` y `npm run lint` no se pudieron ejecutar en este entorno porque el ZIP de trabajo no contiene las dependencias y el intento de instalar con `npm ci` no pudo completar la descarga. No se presenta ese bloqueo de entorno como un resultado positivo del proyecto.
