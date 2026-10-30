# Equilibrio competitivo — Liga Portugal

## Cambios

- La IA ya no descansa titulares automáticamente por enfrentarse a un rival de menor nivel. La CPU no arrastra energía entre encuentros, por lo que esa rotación solo debilitaba su once. Se conserva una rotación pequeña cuando existe congestión real de calendario.
- La IA elige la formación que maximiza la calidad y el encaje posicional del once. Solo mantiene su formación preferida si queda a un máximo de 4 puntos de la mejor selección.
- Se reduce la bonificación táctica de las formaciones de cinco defensas para que no desplace a una alineación claramente superior.
- La curva de reparto de ocasiones refuerza moderadamente la ventaja de calidad (0.39 · tanh(diferencia efectiva / 7.5), límites 11/89), manteniendo goles y sorpresas. El fallback matemático usa la misma curva.

## Regresión de Portugal

`node scripts/portugal-league-balance-test.mjs` usa el catálogo real de jugadores de Liga Portugal, forma onces compatibles y simula las primeras diez jornadas en 1.200 semillas. En la calibración actual, Benfica tiene un XI de 78.9 OVR, Rio Ave de 70.3; Benfica termina en posición media 2.28 y Rio Ave en 10.08. El escenario conjunto Rio Ave primero + Benfica 11.º o peor no aparece en la muestra.

La prueba es un control Monte Carlo del modelo con plantillas base: una carrera guardada con traspasos, lesiones y progresión puede variar, y las sorpresas de un partido siguen siendo posibles.
