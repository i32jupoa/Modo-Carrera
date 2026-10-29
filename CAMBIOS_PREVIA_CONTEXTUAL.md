ACTUALIZACIÓN: PREVIA CONTEXTUAL Y MARCADOR ANTES DEL INICIO

Instalación del parche:
1. Haz una copia de seguridad de tu proyecto.
2. Descomprime este ZIP en la carpeta raíz de Modo Carrera, junto a package.json.
3. Acepta combinar las carpetas y reemplazar los archivos existentes.
4. El archivo src/lib/matchPreviewAnalysis.ts es nuevo; deja que se cree si no existe.

Cambios:
- Se oculta completamente el marcador compacto y el reloj antes de pulsar «Iniciar partido».
- La previa usa los últimos resultados guardados, la clasificación real de la carrera, el contexto de la competición, derbis conocidos, sistemas tácticos, puntos fuertes y duelos clave.
- Los escenarios de descenso, permanencia, ascenso y Europa se basan en la clasificación calculada; la jornada 1 no se etiqueta como lucha por la permanencia ni por Europa.
- Se evita declarar la última jornada si el calendario todavía se está generando por fases.

Nota: este parche contiene los tres archivos relacionados con la previa y el marcador. Conserva el resto de los archivos de tu proyecto.
