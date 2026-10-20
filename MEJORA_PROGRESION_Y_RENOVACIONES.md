# Mejora de progresión y renovaciones de IA

## Progresión
- La mayor parte de la evolución del OVR se distribuye entre los pasos mensuales de la temporada.
- El ajuste de final de temporada se limita a una variación pequeña y puede ser positivo o negativo por rendimiento, minutos, lesiones y edad.
- Las medias altas tienen rendimientos decrecientes: con el mismo rendimiento, un jugador de 94 OVR progresa mucho menos que uno de 80 OVR; las regresiones por mal rendimiento no se ocultan.
- Los objetivos de producción dependen de la demarcación. Los MCD no son evaluados como delanteros: sus notas, asistencias y contribución defensiva pesan más que los goles, aunque una temporada goleadora sí les da una recompensa clara.

## Renovaciones IA
- Cuando el límite salarial está lleno, los clubes pueden usar una reserva limitada del presupuesto de fichajes para financiar una renovación.
- La reserva depende de la ficha actual y es mayor para jugadores clave o titulares; el incremento y la prima siguen sujetos al dinero disponible y se conserva la reserva protegida.
- Se permite que haya jugadores que rechacen renovar o salgan libres, pero se evita perder automáticamente a estrellas por falta de margen salarial ordinario.

## Pruebas
- `node --experimental-strip-types scripts/player-progression-balance-test.mjs`
- `node --experimental-strip-types scripts/ai-contract-renewal-test.mjs`
- También se ejecutaron las pruebas de rollover, límite de temporada, duración de ligas y ascensos/descensos.
