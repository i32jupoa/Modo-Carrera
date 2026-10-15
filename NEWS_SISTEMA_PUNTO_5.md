# Punto 5 — ampliación del sistema de noticias

## Lo que ya existía

El motor principal consumido por la central es `src/lib/news/newsEngine.ts` a través de `newsCache.ts`. Ya derivaba noticias reales de partidos, remontadas, goleadas, sorpresas, cambios de líder, campeones matemáticos, rachas, pichichis, copas, competiciones europeas, traspasos, renovaciones, lesiones y ascensos de cantera. Se han mantenido esas rutas y su formato visual.

## Cambios aplicados

- **Rumores reales del mercado:** el feed convierte los rumores persistidos en `RumorEngine` en historias periodísticas. Mantiene la fiabilidad que registró la simulación y deja claro que un rumor no es un fichaje confirmado.
- **Enfriamiento de rumores:** `newsRules.ts` limita a una historia reciente por tipo y jugador dentro de cinco días; un rumor de tipo distinto (por ejemplo, puja entre clubes) puede seguir apareciendo. El filtro descarta fechas inválidas, antiguas y futuras.
- **Retiradas:** el feed consume `SaveGame.retiredPlayers`, prioriza las despedidas del club del usuario y muestra edad, último club, media final, temporada y motivo registrado. Sólo las retiradas recientes se presentan como noticia actual.
- **Tratamiento visual:** las despedidas tienen una temática propia y conservan escudo/cara usando la infraestructura de `NewsCarousel`.
- **Caché:** la clave incluye la fecha actual, los resultados jugados, el último rumor y la retirada más reciente, evitando que la central siga mostrando un feed antiguo tras esos cambios.
- **Determinismo:** titulares alternativos se seleccionan con semilla estable; recargar la carrera no cambia aleatoriamente el titular.

## Límites de los datos

El registro de retiradas disponible no guarda una estadística completa de goles, partidos y títulos de toda la carrera; la noticia no inventa esas cifras. El historial de traspasos tampoco mantiene un libro estructurado de todas las ofertas ordinarias rechazadas, por lo que no se genera una noticia de rechazo si no existe un evento persistido verificable. Los rumores disponibles sí se aprovechan.

## Verificación

`npm run test:news-expansion` comprueba ventana temporal, exclusión de hechos futuros, enfriamiento por tipo y entidad, y conexión de rumores/retiradas con la caché y la temática visual. El typecheck completo requiere instalar las dependencias del proyecto (`vite/client` no está disponible en el entorno de empaquetado).
