# Mercado de fichajes V7

## Verano e invierno

El mercado mantiene dos ventanas distintas y la UI permite filtrar el historial por **verano**, **invierno** y por tipo de operación (**fichajes, cesiones, agentes libres**).

## Cesiones de la IA

Las cesiones automáticas ya no sirven para mandar a mitad de temporada a jugadores consolidados. En invierno la IA no crea cesiones automáticas; la herramienta queda para operaciones gestionadas por el usuario. En verano las cesiones automáticas se reservan a promesas jóvenes y con margen: máximo 21 años, OVR máximo 78, al menos 3 puntos de potencial sobre la media y alejadas al menos 4 puntos del nivel del once.

Esto bloquea casos como Bukayo Saka (24, OVR 87), Ousmane Diomande (22, OVR 81) o Yan Diomande (19, OVR 84) como candidatos automáticos a cesión.

## Variedad entre mercados

La puntuación de candidatos incorpora ahora una semilla específica de **temporada + ventana**. El ruido de scouting cambia entre veranos/inviernos, de modo que el mismo club puede perseguir jugadores distintos en mercados distintos sin perder coherencia.

El objetivo de incorporaciones de verano también deja de ser idéntico para todos: según el perfil del club y la semilla de esa ventana puede ser 0, 1, 2 o, para clubes especialmente agresivos en un mercado favorable, 3 incorporaciones de base. Las necesidades reales siguen teniendo prioridad y pueden superar ese objetivo.

## Verificación

Se hizo transpilación TypeScript de los seis archivos modificados sin errores de sintaxis. El `tsc` global no puede ejecutarse en este entorno porque el ZIP de proyecto no incluye `node_modules` y por tanto falta `vite/client`; no se ha usado ese fallo de entorno como señal de error del cambio.
