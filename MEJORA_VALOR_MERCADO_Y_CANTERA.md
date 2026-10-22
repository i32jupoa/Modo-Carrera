# Ajuste de valoración de mercado y generación de cantera

- El valor de mercado distingue las cinco grandes ligas, ligas profesionales secundarias, segundas divisiones y categorías inferiores. La Segunda española aplica un multiplicador claramente inferior al de Primera.
- La calidad de la plantilla y el prestigio del club influyen de forma más marcada en el valor, además de la media, la edad, la posición y el potencial individual.
- Las pantallas que consultan el valor de un jugador sin pasar el club ahora resuelven el equipo desde su ficha cuando es posible.
- Los canteranos se generan a partir de una combinación del nivel deportivo del club y la fuerza de su liga. Afecta tanto a la media inicial como a la distribución de potencial y a la probabilidad de producir talentos excepcionales.
- La valoración de mercado de los canteranos utiliza también el nivel real de su club y la liga a la que pertenece.
- Se han añadido pruebas de regresión para comparar las valoraciones del mismo jugador en Villarreal y Córdoba, y el perfil de cantera del Real Madrid y Córdoba.

## Ajuste posterior: precios de clubes modestos

- Los jugadores con media inferior a 88 reciben una curva de precio adicional para que la edad y el potencial no conviertan automáticamente a un buen jugador en un fichaje de 30-40 M€.
- Se refuerza la diferencia de capacidad de mercado entre las cinco grandes ligas, las segundas divisiones y los clubes con menor nivel deportivo.
- Se corrige Málaga CF para que su liga inicial sea LALIGA HYPERMOTION, y se actualiza la liga de sus jugadores en la base de datos. Esto evita valorar a Chupe como si jugara en Primera.
- Los jugadores de 88+ conservan la curva de valoración anterior; se añadieron pruebas para Chupe (menos de 10 M€ al inicio) y para los umbrales de Mbappé y Vinícius.

