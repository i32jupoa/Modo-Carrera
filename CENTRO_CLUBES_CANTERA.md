# Canteras en Centro de Clubes

En `/teams`, selecciona un equipo y abre la pestaña **Cantera**. La vista presenta la lista completa de jugadores juveniles en estado activo, con búsqueda por nombre/posición/nacionalidad y filtros por estado. Incluye OVR, potencial, edad, PJ, minutos, goles, asistencias y nota media.

Las canteras de otros clubes se cargan en modo de solo lectura usando la persistencia de academias IA del `saveId` activo. Solo se lee el club seleccionado, para evitar hidratar todas las academias al abrir Centro de Clubes. Los datos del equipo del usuario continúan viniendo de `useAcademyStore` y el botón de gestión abre la cantera propia.
