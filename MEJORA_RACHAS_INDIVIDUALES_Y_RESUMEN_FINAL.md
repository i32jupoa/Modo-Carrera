# Mejora: rachas individuales en la previa y crónica final del partido

## Previa
- La sección «Nombres propios y rachas» utiliza estadísticas de encuentros guardados de la carrera.
- Destaca rachas de goles, asistencias, porterías a cero de porteros, valoraciones altas y premios de jugador del partido cuando los datos registrados cumplen los umbrales.
- Los goles y las asistencias se atribuyen desde eventos del lado correcto, evitando contar goles en propia puerta como goles del jugador que los introdujo en su propia portería.
- Las porterías a cero se atribuyen solamente a porteros identificados por códigos GK/POR/PT/PORTERO y que han jugado una parte significativa del encuentro.
- Si el historial no contiene pruebas suficientes, la previa no inventa una racha.

## Resumen final
- El resumen agrupa los acontecimientos reales en primera parte, segunda parte y, si procede, prórroga/tiempo añadido.
- La crónica incluye goles con autor y asistente cuando constan, tarjetas, sustituciones, paradas, ocasiones, penaltis, VAR y lesiones registradas.
- Incluye evolución del marcador tras los goles, estadísticas disponibles y un momento decisivo cuando los eventos permiten identificarlo.
- Si no hay suficiente información guardada, lo indica expresamente en lugar de inventar acontecimientos.

## Validación
- Se verificó la sintaxis TypeScript/TSX con el transpiler de TypeScript en los tres archivos modificados.
- Se comprobó la integridad de los ZIP generados.
- No se pudo ejecutar una compilación completa ni pruebas en navegador porque este entorno no tiene las dependencias de frontend instaladas.
