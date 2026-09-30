# Mercado + copas — corrección V9

## Copas nacionales
- Los partidos de copa siguen resolviéndose desde `advanceTime(1)` / avanzar día.
- Se eliminó la referencia fuera de alcance a `getCachedCupTactics` dentro de `processScheduledBackgroundSims`.
- `processScheduledBackgroundSims` mantiene ahora una caché local de tácticas por equipo para los partidos de copa del día.
- No se vuelve a meter la simulación de copa dentro de la lógica de "volver a temporada" ni se adelanta el calendario de liga.

## Mercado
- El mercado vuelve a tener una participación diaria más alta en verano: 42% de clubes como base, con un factor de verano del 1.18.
- Los clubes pueden cerrar hasta 18 fichajes permanentes y 18 salidas por ventana; las cesiones tienen un tope de 8.
- El suelo de verano sube a 3 fichajes y 3 salidas por club, manteniendo la variación por club/ventana.
- Se conserva la lógica V8 de potencial, reinversión tras ventas, necesidades estratégicas y control de overbooking.

## Robustez
- Si las finanzas de un club antiguo/migrado no se pueden materializar, el cálculo de objetivos usa un fallback y no aborta el día completo.
- Si falla la ruta estratégica de un club, se intenta de nuevo con el selector de mercado normal.
- Si un club sigue fallando, se omite ese club y el resto del mercado continúa.
- La selección de clubes activos también está protegida contra estados corruptos/migrados.
- `useMarketClock` ahora conserva la aplicación funcionando y registra el stack real si aparece otra anomalía.

## Resultado buscado
El mercado de verano vuelve a tener una escala alta y dinámica, evitando que una excepción de un único club detenga la actividad de todos. El volumen exacto sigue variando por temporada, presupuesto, ventas, necesidades y ventana.
