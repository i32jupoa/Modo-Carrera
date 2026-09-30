# Progresión de OVR V4

## Objetivo

La valoración debe reaccionar principalmente al rendimiento real. La edad y el potencial son moduladores secundarios: una promesa joven y con margen sigue teniendo ventaja, pero un jugador de 28-30 años que está haciendo una gran temporada también debe subir claramente.

## Cambios

- La producción se calcula por 90 minutos, evitando que los goles/asistencias de un jugador con pocos minutos distorsionen la valoración.
- La producción ofensiva, la valoración media y los MVP pasan a dominar el índice de rendimiento.
- La posición principal manda para decidir el estándar de producción; Bellingham se evalúa como centrocampista aunque pueda jugar de delantero.
- Un delantero con una temporada goleadora puede subir incluso si su edad es 29 o si su potencial inicial coincide con su OVR.
- Un centrocampista de 90 OVR con muchos goles/asistencias y buena media ya no queda bloqueado por su OVR alto.
- Un jugador con mala temporada puede bajar a cualquier edad; no existe una penalización automática fuerte por tener 28-30 años.
- Pasar meses sin jugar provoca descenso gradual. Una temporada completa sin minutos produce una pérdida clara, pero no exagerada.
- El potencial es una previsión dinámica, no un techo. Una temporada extraordinaria puede elevarlo de forma apreciable.
- Las promesas de media baja y potencial alto mantienen un bonus específico de desarrollo, por lo que continúan progresando más rápido cuando tienen minutos y buen rendimiento.
- La progresión mensual y el ajuste de cierre de temporada se han reforzado para que una campaña excelente produzca una subida visible durante toda la temporada y no solo al final.

## Pruebas de referencia

Con las estadísticas facilitadas en la conversación, el modelo da aproximadamente:

| Jugador | Rendimiento | Subida mensual | Cierre de temporada |
|---|---:|---:|---:|
| Julián Quiñones, 84 OVR, 29 años, 16 G + 3 A, 7.29 | 0.919 | **+0.237** | **+0.760** |
| Jude Bellingham, 90 OVR, 23 años, 11 G + 3 A, 7.04 | 0.619 | **+0.153** | **+0.505** |
| Marcus Rashford, 82 OVR, 28 años, 13 G + 5 A, 6.00, 3 MVP | 0.419 | **+0.098** | **+0.339** |
| Promesa 70→88, 19 años, 8 G + 7 A, 7.10 | 0.690 | **+0.413** | **+1.161** |
| Estrella 90 OVR, temporada mala | -0.136 | **-0.031** | **-0.106** |
| Estrella 90 OVR, 0 partidos | -0.100 | **-0.077** | **-0.398** |

Los números son pruebas aisladas con estadísticas congeladas, no una predicción de una temporada real.

## Edad

Con la misma producción y rendimiento, la diferencia mensual entre 22 y 35 años queda aproximadamente en unas centésimas: la edad modula, pero ya no decide el resultado.
