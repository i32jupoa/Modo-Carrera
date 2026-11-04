HISTORIAL COMPLETO DE PARTIDOS
==============================

CAMBIOS
- Al abrir cualquier partido ya disputado desde Jornadas, Copa, Champions League,
  Europa League, Conference League o el calendario general, se muestra el detalle
  común del encuentro.
- El detalle tiene cinco apartados: Estadísticas, Resumen (informe post-partido),
  Momentos destacados, Crónica y Alineaciones.
- Momentos destacados separa Goles, Al palo, Tarjetas, Sustituciones e Incidencias.
  Los eventos de cada apartado se ordenan por minuto.
- La información se conserva en el resultado de cada partido, también en los
  encuentros simulados entre dos equipos controlados por la IA.
- Los partidos antiguos que no guardaban estadísticas muestran una estimación
  estable y lo indican expresamente. No se inventan goleadores, tarjetas ni minutos.
- Los partidos resueltos en tanda de penaltis muestran quién ganó la eliminatoria.

ARCHIVOS PRINCIPALES MODIFICADOS
- src/components/MatchStatsModal.tsx
- src/lib/matchReport.ts (nuevo)
- src/lib/simulation.ts
- src/lib/store.ts
- scripts/match-report-history-regression.mjs (prueba de regresión)
- package.json (comando de prueba)

APLICAR EL ZIP LIGERO
Descomprime el contenido encima de la carpeta raíz del proyecto y acepta reemplazar
los archivos existentes, manteniendo las rutas incluidas.

PRUEBA
npm run test:match-report-history

NOTA DE VALIDACIÓN
Se comprobaron la sintaxis/transpilación de los archivos TypeScript modificados y la
prueba específica del informe. No se pudo ejecutar el build completo en este entorno
porque no están instaladas las dependencias locales (incluido vite/client).
