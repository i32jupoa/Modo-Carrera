# Noticias reales + notificaciones visuales (v1)

## Noticias (central)
- `src/lib/news/newsEngine.ts`: deriva las noticias del estado REAL de la partida (resultados, clasificaciones
  antes/después de cada jornada, Champions/Europa/Conference, copas, historial de traspasos y renovaciones).
  No se guarda nada nuevo en el guardado: es una función pura y determinista (no afecta a la cuota de localStorage).
- Detectores: remontadas, hat-tricks/pókeres, sorpresas, goleadas, partidos de muchos goles, victorias en el
  descuento, penaltis, duelos de gigantes, cambio de líder (cruza el resultado del nuevo líder con el del anterior),
  campeón matemático, rachas (victorias/invicto/derrotas), pichichi, líder de la fase de liga europea, campeones,
  fichajes (con récord de la partida), cesiones, agentes libres y renovaciones.
- `src/lib/news/newsText.ts`: redacción con RNG sembrado (variantes de titular, apertura y conectores, apodos de
  clubes, artículos el/la, importes). Cada noticia explica qué, cómo, por qué y consecuencia.
- Puntuación de relevancia + selección con variedad (categoría/equipo) en `selectVaried`.
- `src/lib/news/newsCache.ts`: caché por estado de la partida.
- `src/components/news/NewsCarousel.tsx`: desplegable que rota solo (7 s), pausa al pasar el ratón/abrir,
  clic para leer la noticia completa, anterior/siguiente, flechas del teclado, deslizar en móvil, filtros por categoría.
- `src/components/news/NewsVisuals.tsx`: escudos (`TeamLogo`), caras (`PlayerFace`) y banderas (`CountryFlag`).

## Renovaciones
- `src/lib/transfers/RenewalLog.ts`: registro de renovaciones (IA y usuario), guardado con el mercado
  (`TransferSaveData.renewals`, opcional → compatible con partidas antiguas).

## Notificaciones
- `notificationsStore.ts`: cada notificación puede llevar `title` y `visual` (escudos, jugador, país).
  Las antiguas siguen funcionando solo con texto.
- `src/components/notifications/`: `NotificationCard`, avisos emergentes con imágenes (`richToast`) y campana
  con bandeja (`NotificationCenter`, montada en `__root.tsx`).
