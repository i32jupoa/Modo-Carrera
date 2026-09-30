# Mercado V10 — Reposición inteligente tras salidas

## Problema corregido
Un club podía vender muchos jugadores durante el verano y aun así quedarse con muy pocas altas porque el mínimo de fichajes sólo miraba un objetivo base y las pérdidas de titulares por posición.

## Cambios
- El objetivo de fichajes de verano ahora crece con las **salidas netas** de la ventana.
- La relación es sublineal: vender 6 jugadores no obliga a comprar 6, pero sí eleva claramente el objetivo.
- Las pérdidas de varias zonas importantes añaden presión adicional.
- Ejemplo: un club con objetivo base de 5, 7 salidas y 1 llegada pasa a un objetivo de **9 altas**.
- La búsqueda sigue teniendo en cuenta OVR, potencial, necesidades de posición, presupuesto y personalidad del club; no obliga a fichar 9 estrellas.
- Se puede completar la reconstrucción con jugadores de rotación, promesas de alto potencial y fichajes de mercado secundarios.
- Las ventas forzadas de seguridad ya no pueden usar automáticamente como salida a un jugador del núcleo.
- Se protegen titulares, jugadores de demarcaciones escasas, veteranos importantes y jugadores identificados como `stars` del club, salvo que el propio jugador fuerce de verdad la salida.
- Las estrellas veteranas importantes tienen ahora una probabilidad de renovación sensiblemente mayor para reducir salidas absurdas como Aubameyang abandonando siempre su equipo.

## Ejemplo del caso mostrado
Real Madrid: 7 salidas y 1 llegada en verano → objetivo dinámico de 9 altas. Esto no significa que vaya a cerrar 9 operaciones grandes: algunas pueden ser promesas, profundidad, oportunidades de mercado o sustitutos directos.

## Verificación
Los archivos `MarketSimulation.ts`, `TransferEngine.ts` y `ContractEngine.ts` pasan `typescript.transpileModule` sin errores de sintaxis.
