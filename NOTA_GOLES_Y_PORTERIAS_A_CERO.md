# Ajuste del motor de goles y porterías a cero

## Cambios

- El entorno global de goles pasa de **2,55 a 3,05 xG por partido**.
- La ventaja de los favoritos se hace menos extrema: se reduce la amplitud del reparto de xG para no convertir al rival en un equipo de 0,3-0,6 xG demasiado a menudo.
- El peso del goleador dentro del xG de su equipo aumenta de forma clara.
- Se da una ventaja específica a atacantes de élite por **OVR + definición**, de forma que un Haaland/Mbappé/Kane puede concentrar una parte alta del xG cuando su equipo domina.
- La mejora no es determinista: las estrellas siguen pudiendo tener partidos malos y jugadores secundarios siguen pudiendo marcar.

## Calibración

En una muestra de 100.000 partidos con el mismo modelo:

- Goles: **~3,05 por partido**.
- Porterías a cero por equipo y partido: **~22%** en un partido equilibrado.
- En un favorito fuerte: **~26-28%**.
- Eso equivale aproximadamente a **6-8 porterías a cero en 30 partidos** para un equipo medio y alrededor de **8-9** para un favorito fuerte, con variación natural.

Para un ataque dominante con un delantero centro de élite, el delantero puede llegar a representar aproximadamente la mitad del xG del equipo, permitiendo temporadas cercanas o superiores a **un gol por partido** si el equipo genera alrededor de 2 xG por encuentro.

## Importante

Los partidos ya jugados no se recalculan. El cambio afecta a las simulaciones nuevas a partir de ahora.
