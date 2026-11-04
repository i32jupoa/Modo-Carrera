# NOTA_CLAUSULAS_V1

## Alcance

Se añade una primera capa funcional de cláusulas sobre el motor de traspasos existente:

- `ReleaseClauseEngine.ts` centraliza elegibilidad, probabilidad, aceptación contractual, ejecución y contadores anti-exploit.
- Los jugadores satisfechos (descontento bajo) conservan una posibilidad residual muy pequeña; la lealtad y el rol de estrella reducen todavía más la probabilidad y elevan notablemente el salario exigido para aceptar.
- Los intentos IA no se realizan el primer día de mercado, requieren necesidad real de esa posición y quedan limitados a un máximo global por día y por ventana.
- Desde el modal abierto con «Negociar» aparece «Pagar cláusula» cuando existe una cláusula. El club vendedor no negocia: se proponen salario y duración al jugador y sólo se paga si acepta.
- Los pagos iniciados por el usuario se sincronizan con la plantilla, alineación/roles, presupuesto, masa salarial, historial y notificaciones.
- Los jugadores listados como transferibles o cedibles quedan excluidos de los intentos de clausulazo.
- El cierre utiliza `createTransferOffer` + `completeTransfer` + `recordTransfer`; por tanto reutiliza el cambio de club, la actualización de finanzas, la masa salarial, el historial y los cerrojos existentes.
- `TransferRecord.isReleaseClause` permite distinguir el movimiento y `describeTransfer` emite el formato: `El [comprador] ha pagado al [vendedor] la cláusula de [jugador] ([importe])`.
- `TransferHistoryCard` y `MarketFeed` muestran la etiqueta «Clausulazo» y la frase explícita «El [comprador] ha pagado al [vendedor] la cláusula de [jugador] ([importe])».
- `newsEngine.ts` publica una noticia diferenciada con temática visual «Clausulazo» y el mismo texto descriptivo.
- El simulador diario permite clausulazos IA sobre el club del usuario y entre clubes IA, con cupos y oportunidades rotatorias.
- `OfferClauses.releaseClause` permite que el contrato de un fichaje normal transporte una cláusula negociada; `TransferEngine` respeta ese valor al crear el contrato.
- Los contadores se guardan en `TransferSaveData.releaseClauses`; el campo es opcional para que las partidas anteriores sigan cargando.

## Constantes ajustables

En `src/lib/transfers/constants.ts`, `RELEASE_CLAUSE_RULES`:

| Constante | Uso |
|---|---|
| `baseProbability` / `maxProbability` | Escala y techo de probabilidad por oportunidad |
| `happyPlayerProbabilityFloor` / `desireExponent` | Probabilidad residual de jugadores contentos y peso del descontento |
| `winterProbabilityFactor` | Reducción de probabilidad en invierno |
| `roleProbabilityMultiplier` | Dificultad según rol (estrella, titular, rotación, secundario, promesa) |
| `roleWagePremium` / `roleAcceptanceResistance` | Prima salarial y resistencia según rol actual |
| `contentmentWagePremium` / `loyaltyWagePremium` | Exigencia salarial por satisfacción y lealtad |
| `contentmentAcceptancePremium` / `loyaltyAcceptancePremium` | Umbral adicional para aceptar un cambio estando contento y siendo leal |
| `maxUserIncomingByWindow` | Límite de salidas del club del usuario: 2 verano / 1 invierno |
| `maxAiGlobalByWindow` | Límite IA-IA global: 280 verano / 24 invierno (V1.6) |
| `maxPerClubPerWindow` | Límite IA-IA por comprador: 3 verano / 1 invierno (V1.6) |
| `maxGlobalPerDay` | Límite diario IA-IA: 12 verano / 2 invierno (V1.6) |
| `aiAttemptsPerClubDay` | Candidatos distintos revisados por comprador activo: 5 verano / 2 invierno |
| `aiSellerSampleSize` | Clubes vendedores muestreados por comprador y día |
| `aiMaximumWageMultiplier` | Techo del múltiplo salarial que puede ofrecer automáticamente la IA |
| `minimumWindowDay` | Día mínimo de la ventana para activar cláusulas automáticas |

## Corrección V1.1 (noviembre de 2026)

- La aceptación del jugador ahora exige una puntuación de `0.76` y un salario de al menos el `90%` de su demanda calculada. Los jugadores con `desireToLeave` inferior a `0.35` reciben un rechazo explícito por satisfacción; la lealtad penaliza adicionalmente la aceptación.
- La IA solo considera jugadores con descontento de al menos `0.58` (salvo `wantsOut`), la probabilidad máxima por intento es `1.2%` y la curva eleva el peso del descontento a `3.5`.
- No hay intentos automáticos el primer día de la ventana. Los límites automáticos son `1` por club y ventana, `2` globales por ventana y `1` por día. Estos límites solo afectan a la IA: los pagos manuales del usuario no consumen ni quedan bloqueados por esos cupos.
- `Pagar cláusula` solo se muestra dentro de una ventana abierta. El chequeo previo comprueba el coste de la cláusula; el salario introducido se valida dinámicamente en el modal y se vuelve a validar al ejecutar la operación.
- Los avisos de salida de un jugador del usuario incluyen el ingreso íntegro en presupuesto y la frase `describeTransfer`. El titular de la noticia, el feed y el historial utilizan la misma frase exacta.
- En `Ofertas recibidas`, los acentos verdes de importe, tipo de operación, futura venta y gestión pasan a ámbar. Aceptar permanece verde, rechazar rojo y contraofertar ámbar. Los contadores de «Mis negociaciones» y «Ofertas recibidas» son amarillos.

## Decisiones y límites conocidos de esta V1

1. La operación de clausulazo se ejecuta de forma atómica desde el punto de vista del motor: se valida ventana, cláusula, mercado, bloqueo, tamaño mínimo, porteros y presupuesto antes de llamar al cierre común.
2. El comprador negocia condiciones salariales a través de `evaluateClauseContract`. La función pública `attemptReleaseClause` permite forzar el intento probabilístico (`forceChance`) para el flujo iniciado por el usuario, una vez que su UI haya recogido la aceptación.
3. El pago del usuario reutiliza `evaluateClauseContract` dentro del motor existente: el usuario puede ajustar salario y años antes de ejecutar el pago. No se ha creado un subsistema paralelo de negociación.
4. La simulación IA intenta clausulazos entre clubes IA. Los cupos actuales están documentados en la sección V1.6; los cambios de volumen no eliminan las validaciones de presupuesto, plantilla mínima, portero, cláusula, necesidad, satisfacción y contrato. Los avisos de salidas de jugadores del usuario se registran en el buzón persistente. Los avisos anticipados y la distribución avanzada de `futureSalePercentage` siguen siendo mejoras separadas.
5. `marketIdb.ts` no necesita cambio de esquema: guarda el objeto serializado de `Persistence.ts` y admite campos opcionales. El contador diario nuevo es opcional, por lo que los saves previos se restauran con un mapa vacío.
6. La probabilidad usa `desireToLeave` con una clave de fecha de mercado; no introduce un segundo cálculo de satisfacción.

## Cómo probar

- `npm run test`
- `npm run typecheck`
- Añadir una prueba de integración con un jugador del club usuario, una cláusula positiva y un comprador IA con presupuesto suficiente; comprobar que el jugador cambia de club, el vendedor recibe el importe, el comprador asume el salario y el registro queda marcado con `isReleaseClause`.
- Comprobar que un jugador listado no puede clausularse y que `releaseClause: 0` devuelve un rechazo.
- Comprobar que no se intenta ningún clausulazo automático el 1 de julio / 1 de enero y que los jugadores felices y leales rechazan ofertas normales de contrato.
- Guardar y cargar una partida anterior sin `releaseClauses` y comprobar que los contadores se inicializan vacíos.

## Actualización V1.2 — negociación en dos pasos y finanzas

- «Cláusula» aparece como una modalidad nueva dentro del modal **Negociar** del jugador.
- El paso 1 abre una negociación `UserDeal` en la fase `player-terms`: el vendedor no recibe oferta, no interviene y no puede rechazar. Salario, rol y duración se negocian con el jugador usando `improvePlayerTerms` y el mismo `DealCard` que los fichajes normales.
- El paso 2 solo aparece cuando el jugador acepta (`ready`). El botón **Pagar cláusula y cerrar fichaje** ejecuta `finalizeUserDeal`/`completeTransfer`; el registro mantiene `isReleaseClause` para historial y noticias. Si el jugador rechaza, no se mueve dinero ni jugador.
- El pago se valida contra la bolsa de fichajes (`budget - wageBudget`) y el salario contra el margen real (`wageBudget - wageBill`). La misma comprobación se repite al confirmar para evitar gastar dinero reservado o quedar en negativo.
- La demanda salarial de un jugador satisfecho aumenta según su satisfacción y lealtad; también se eleva el umbral de aceptación. La frase de rechazo explica que está contento y no desea salir.
- Tras el paso de negociación, la tarjeta muestra «Paso 1 de 2»; tras la aceptación, cerrar la operación paga la cláusula.
- Los datos `isReleaseClause` siguen siendo opcionales: partidas antiguas se interpretan como operaciones normales.
- En «Ofertas recibidas», la información, importes, badges y contraofertas usan amarillo; **Aceptar oferta** sigue verde y **Rechazar** rojo. Los contadores de «Mis negociaciones» y «Ofertas recibidas» son amarillos.

### Cómo probar

1. Abre el mercado durante una ventana activa y entra en **Negociar** en un jugador con cláusula y sin bloqueo de movimiento.
2. Selecciona **Cláusula** y pulsa **Negociar contrato con el jugador**. La operación debe aparecer en **Mis negociaciones** sin haber descontado dinero.
3. Ajusta rol, salario y años desde la tarjeta de negociación. Si acepta, la tarjeta pasa a **Pagar cláusula y cerrar fichaje**.
4. Confirma: la cláusula se descuenta de fichajes, el salario del margen salarial y el traspaso queda marcado como clausulazo. Si rechaza, no debe producirse ningún pago.
5. Comprueba los colores de las ofertas entrantes: amarillo para la información y contraoferta, verde para aceptar y rojo para rechazar.


## Actualización V1.3 — flujo en dos pasos y separación de presupuestos

- La cláusula se ofrece como tercer tipo de operación dentro del modal **Negociar**.
- El paso 1 abre una `UserDeal` normal en fase `player-terms`: se negocian salario, rol y años directamente con el jugador. El club vendedor no recibe una oferta y no puede intervenir.
- El paso 2 aparece únicamente cuando la negociación del jugador alcanza `ready`. El botón **Pagar cláusula y cerrar fichaje** vuelve a validar presupuesto, salario y plantilla antes de ejecutar `finalizeUserDeal`.
- El precio de la cláusula se descuenta exclusivamente del presupuesto de fichajes (`budget - wageBudget`). El salario pactado consume únicamente el margen salarial (`wageBudget - wageBill`). La venta libera masa salarial, pero el ahorro anual no se suma como ingreso de caja.
- El comprador del usuario conserva su asignación salarial y la masa salarial se reconcilia con la plantilla ya actualizada para evitar sumar dos veces el sueldo.
- Los contadores anti-cadena de la simulación IA no limitan los pagos manuales del usuario.
- Los indicadores verdes del panel de ofertas pasan a amarillo; los botones **Aceptar oferta** y **Rechazar** conservan verde y rojo respectivamente.

### Comprobación manual

1. En Mercado, abre **Negociar** en un jugador con cláusula y selecciona **Cláusula**.
2. Pulsa **Negociar contrato con el jugador**. Comprueba que se crea una negociación en **Mis negociaciones** y que todavía no se descuenta el importe.
3. Negocia salario, rol y años desde la tarjeta habitual. Si el jugador acepta, aparece **Pagar cláusula y cerrar fichaje**; si rechaza, no se permite el pago.
4. Cierra la operación. Comprueba que baja el presupuesto de fichajes por el importe de la cláusula, que la asignación salarial no baja, y que la masa salarial refleja el nuevo contrato.
5. En **Ofertas recibidas**, comprueba los acentos amarillos, el botón verde para aceptar, el rojo para rechazar y los contadores amarillos.


## Corrección V1.4 — presupuesto salarial y ofertas entrantes

- Se corrigió el origen del precintado falso: `BudgetManager.getFinances`, `setWageBudget`, `syncWageBill` y `refillForNewWindow` ya no recortan el límite salarial del usuario al 30% ignorando la masa salarial existente. El límite se normaliza para cubrir la masa actual y conservar margen.
- La misma normalización se aplica al primer acceso a las finanzas del club, lo que migra partidas antiguas al vuelo.
- El margen inicial se configura en `USER_WAGE_BUDGET_RULES` (`initialHeadroomBudgetShare` y `initialHeadroomPayrollShare`).
- La franja «Precintado · Negociación bloqueada» usa rojo intenso.
- En «Ofertas recibidas», los acentos principales y las acciones de negociación pasan a amarillo; aceptar una oferta sigue verde y rechazarla rojo.
- El historial de una cesión creada por el usuario incluye destino, prima, reparto salarial, duración, opción/obligación de compra y rol.
- Se añadieron regresiones para sincronización salarial y asignaciones superiores al 30% cuando la masa real lo requiere.

## Hotfix V1.4.1 — error al abrir el mercado

- Se importa `userWageBudgetBounds` desde `src/lib/transfers/SalaryBudget.ts` en `src/routes/transfers.tsx`.
- La ruta `/transfers` ya utilizaba la función para calcular el rango del deslizador salarial, pero faltaba el import, causando `ReferenceError: userWageBudgetBounds is not defined` durante el renderizado de `TransfersPage`.
- No se modifica la lógica de presupuestos ni los datos de la partida; se corrige únicamente la referencia en tiempo de ejecución.
- Los 404 de escudos y los avisos de accesibilidad de Radix son independientes de este error.


## Actualización V1.5 — aceptación más exigente, topes por temporada y clausulazos IA-IA

- Un jugador contento y sin deseo de salir mantiene una probabilidad residual de recibir una oferta, pero es muy baja. La fórmula combina satisfacción (`1 - desireToLeave`), lealtad, necesidad de posición, agresividad del comprador y rol actual en su club.
- El rol se obtiene de `stats.squadRole` y se rehidrata al cargar la partida. Si no existe, se estima por media y minutos. Una estrella tiene una probabilidad mucho menor de salida que un jugador secundario o de rotación.
- La demanda salarial de salida crece de forma acumulativa con satisfacción, lealtad, ambición y rol. Para un jugador feliz y leal de rol estrella se puede exigir varias veces su salario/demanda base; el jugador puede rechazar una propuesta aunque exista cláusula.
- Límites de salidas del club del usuario por ventana: máximo dos en verano y una en invierno. El factor de probabilidad de invierno es `0.22`, por lo que lo habitual es terminar enero sin clausulazos. Los límites están persistidos en `releaseClauses.userIncomingCounts` y se restauran vacíos en partidas anteriores.
- Se habilita la búsqueda de objetivos IA-IA: cada club comprador activo revisa una muestra rotatoria de clubes vendedores, elige un objetivo elegible y el motor vuelve a comprobar presupuesto, salario, cláusula, necesidad, plantilla y aceptación del jugador. Topes globales IA-IA: ocho en verano, dos en invierno, uno por comprador/ventana y uno por día.
- Se corrigió una referencia incompleta en `ReleaseClauseEngine`: `MarketSimulation` invocaba `isAiReleaseClauseTimingAllowed`, pero la función no estaba implementada. El error se capturaba por club y anulaba silenciosamente los intentos automáticos. La función ahora comprueba la ventana oficial y el segundo día como mínimo.
- Cuando un club IA paga la cláusula de un jugador del usuario, `useMarketClock` añade un aviso persistente de tipo `release_clause_paid` al buzón con el comprador, vendedor, jugador e importe íntegro ingresado en presupuesto de fichajes. La notificación usa ID determinista para evitar duplicados al recargar.

### Constantes de ajuste V1.5

En `src/lib/transfers/constants.ts`, dentro de `RELEASE_CLAUSE_RULES`: `baseProbability`, `maxProbability`, `happyPlayerProbabilityFloor`, `desireExponent`, `winterProbabilityFactor`, `roleProbabilityMultiplier`, `roleWagePremium`, `roleAcceptanceResistance`, `contentmentWagePremium`, `loyaltyWagePremium`, `contentmentAcceptancePremium`, `loyaltyAcceptancePremium`, `maxUserIncomingByWindow`, `maxAiGlobalByWindow`, `maxPerClubPerWindow`, `maxGlobalPerDay` y `aiMaximumWageMultiplier`.

### Pruebas nuevas/actualizadas

- Satisfacción alta frente a descontento alto.
- Posibilidad residual para una estrella satisfecha, pero por debajo de la de un jugador secundario.
- Exigencia salarial muy superior para una estrella feliz y leal.
- Rechazo de una oferta insuficiente por satisfacción/lealtad y aceptación con una oferta extraordinaria.
- Restricción del primer día tanto en verano como en invierno y menor probabilidad en invierno.
- Topes de dos salidas en verano y una en invierno del club del usuario.
- Topes globales y por comprador de operaciones IA-IA, con restauración compatible de contadores antiguos.

Para probar manualmente: simula varios días a partir del 2 de julio y del 2 de enero, revisa el historial/noticias para comprobar la frase de clausulazo IA-IA y, si sale un jugador de tu plantilla, confirma que aparece el aviso «Clausulazo» en el buzón con el ingreso de la cláusula.


## Ajuste V1.6 — Volumen del mercado IA (noviembre de 2026)

- La probabilidad de rotación queda ligeramente por encima de la de promesa (`1.05` frente a `1.00`). Se mantiene por debajo de secundario (`1.12`) y muy por encima de estrella (`0.28`), sin tocar las primas salariales ni la resistencia contractual del rol.
- La V1.5 era demasiado restrictiva por dos motivos acumulados: probabilidad máxima del `0.3%` por intento y un límite global de sólo ocho operaciones IA-IA por verano. Ese techo impedía matemáticamente acercarse a 200.
- La probabilidad base pasa al `34%` por candidato evaluado y el techo al `38%`, pero la probabilidad final sigue multiplicada por descontento, satisfacción residual, lealtad, rol, necesidad posicional y agresividad del club. La curva usa exponente `2.3` y un suelo residual del `0.2%` antes de aplicar el resto de factores, por lo que un jugador realmente feliz y leal sigue siendo difícil de sacar. Un jugador feliz y leal conserva una posibilidad baja, no queda excluido.
- Cada comprador que entra en la rotación diaria evalúa hasta cinco candidatos distintos de otras plantillas en verano (dos en invierno) y puede cerrar como máximo un clausulazo IA-IA por día. El muestreo vendedor sube a 24 clubes para repartir mejor la búsqueda por el universo.
- Cupos IA-IA: máximo 280 en verano y 24 en invierno; máximo 3 por comprador en verano y 1 en invierno; máximo diario 12 en verano y 2 en invierno. El objetivo de equilibrio es rondar 200 o más en un verano activo, pero el total real no se fuerza: puede quedar por debajo por falta de presupuesto, necesidad, cláusula, plantilla o aceptación del jugador.
- El límite de salidas del club del usuario no cambia: 2 en verano y 1 en invierno. Los fichajes manuales tampoco consumen los cupos IA-IA.
- Tests nuevos: rotación ligeramente por encima de promesa, configuración de volumen 200+, límites de ventana y cuota diaria.


## V1.7 — Corrección de bolsas económicas e ingresos por cláusula

- `budget` del usuario sigue siendo el presupuesto total de la carrera; `wageBudget` es la reserva salarial y `budget - wageBudget` es fichajes.
- Los guardados con `wageBudget` heredado superior al 55% del total se migran interpretándolo como la antigua bolsa de fichajes; se convierte a su complemento salarial.
- El reparto inicial salarial pasa al 30% (salvo que la masa salarial real exija más); se configura en `USER_WAGE_BUDGET_RULES.defaultShare`.
- Los ingresos por venta/cláusula se conservan íntegramente en fichajes: los cambios de presupuesto total ya no aumentan automáticamente la reserva salarial en la misma proporción. `preserveUserWageBudget` mantiene la bolsa salarial fija salvo que el gasto real en nóminas crezca.
- `attemptReleaseClause` marca la oferta antes de `completeTransfer` y comprueba de forma idempotente que el club usuario haya recibido el importe íntegro.
- La selección IA-IA pondera también OVR y valor de mercado, y amplía la muestra de clubes vendedores; se elevan moderadamente los multiplicadores de estrellas y titulares sin invertir la jerarquía de roles. Las estrellas siguen siendo más difíciles de captar que los secundarios.
- Tests añadidos para migración 68/32, preservación de la bolsa salarial e ingreso exacto de ventas.


## V1.8 — Reparto original de la barra y ahorro salarial en clausulazos

- Restaurado el reparto original del presupuesto del usuario: 20% inicial para salarios y deslizador limitado al 5%-30%. La masa salarial real se mantiene como dato independiente y ya no fuerza la reserva salarial por encima del 30%, invirtiendo visualmente el dinero disponible para fichajes.
- La migración se aplica también al cargar una carrera guardada (`restorePlayersStoreState`), porque esa ruta restaura el estado directamente y no pasa por el `merge` de Zustand.
- Al ejecutar una cláusula sobre un jugador del club usuario, el presupuesto total recibe el importe íntegro de la cláusula más el salario anual que se libera. La masa salarial se recalcula con el jugador ya fuera de la plantilla; el salario deja de contar ahí. Las ventas normales mantienen su comportamiento anterior.
- La ficha de plantilla muestra el saldo real para fichajes (presupuesto total menos reserva salarial), no el presupuesto total.


## V1.8 — Reparto de presupuesto y salario liberado por clausulazo

- Restaurado el reparto salarial inicial del modelo original (20% del presupuesto total) y el deslizador de 5%-30%; el resto queda disponible para fichajes. La masa salarial real se muestra por separado y no invierte automáticamente ambos importes.
- Las partidas guardadas también migran el valor salarial al restaurarse, no solo al hidratar el estado persistido.
- Cuando otro club ejecuta una cláusula sobre un jugador del club usuario, el presupuesto total aumenta por el importe íntegro de la cláusula más el salario anual que deja de pagarse. La masa salarial real se recalcula después de la salida. Las ventas normales no reciben este abono salarial adicional.
- Tras el clausulazo se conserva la proporción salarial que tenía el club (dentro del rango original 5%-30%).


## V1.10 — Abono efectivo de clausulazos y ajuste de roles

- Corregido el origen del fallo de abono: `resetTransferSystem()` ejecutaba `resetFinances()`, que desconectaba el puente con el presupuesto real de Zustand al iniciar/restaurar el mercado. El reinicio del ledger ahora conserva ese puente; solo `setUserClubBridge(null)` lo desconecta cuando no hay club activo.
- Cuando otro club ejecuta una cláusula sobre un futbolista del usuario, el total aumenta exactamente por `fee + salario anual anterior del jugador`. Ambos importes llegan íntegros al presupuesto disponible para fichajes; la reserva salarial asignada no absorbe una parte del ingreso.
- La masa salarial real se recalcula desde la plantilla ya actualizada, por lo que deja de incluir al jugador que se marcha.
- La comprobación idempotente de `ReleaseClauseEngine` ahora garantiza el importe completo (cláusula más salario liberado), y el Buzón muestra los dos conceptos por separado.
- Multiplicadores de probabilidad por rol actualizados a los valores solicitados: estrella `0.50`, titular `0.75`, rotación `1.00`, secundario `1.00` y promesa `0.90`.
- Regresiones añadidas para comprobar que el puente sobrevive a `resetFinances()`, que el ingreso por clausulazo se acredita completo sin ampliar la bolsa salarial, y que la configuración de roles coincide con esos valores.


## V1.16 — Paleta semántica de cuatro colores en el mercado

- Se elimina la paleta multicolor heredada de la pantalla Mercado. Los únicos acentos de interfaz son verde (acciones/resultado positivo), amarillo (oferta o respuesta pendiente), naranja (negociación activa/atención) y rojo (rechazo/error).
- Los estados de `DealCard` distinguen las fases: espera en amarillo, contraoferta y negociación en naranja, cierre/operación completada en verde y operación fallida en rojo.
- En «Buscar jugadores», los botones «Negociar» y «Ojear» comparten el estilo verde, también en el estado de informe disponible.
- Las pestañas usan los mismos cuatro colores semánticos; sus contadores distinguen ofertas pendientes (amarillo) de negociaciones/ojos en curso (naranja).
- Los componentes del mercado que aún usan clases históricas cyan/azul o violeta/índigo se traducen visualmente a amarillo o naranja, respectivamente, incluyendo paneles, bordes, textos, gradientes y anillos.
- El panel económico queda reservado para la identidad cromática del club: borde, fondo, métricas y deslizador usan `--club` / `--club-2`. Esa excepción no cambia los colores de estado de ofertas y negociaciones.
- No se altera ninguna regla de fichajes, negociación, scouting ni economía; el cambio es exclusivamente visual.
