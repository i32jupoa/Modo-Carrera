# Mejora: resúmenes bajo demanda

- La previa conserva visibles la competición, equipos, escudos, nombres y formaciones.
- El análisis de previa (forma, contexto de competición, rachas individuales, rivalidad y claves tácticas) empieza plegado y se abre con «Ver resumen».
- Tras terminar el partido, el marcador final permanece visible; el desarrollo narrativo, estadísticas, fases del partido, crónica detallada, goleadores y MVP empiezan plegados y se muestran al pulsar «Ver resumen».
- Los botones indican «Ocultar resumen» cuando está abierto y exponen `aria-expanded` para accesibilidad.
- Los controles solo modifican la visibilidad; no cambian el estado ni el reloj del partido.

Validación realizada: análisis de sintaxis TSX mediante `typescript.transpileModule` y comprobaciones estáticas de los botones/estados. La compilación completa no se ha ejecutado porque las dependencias del proyecto no están instaladas en este entorno.
