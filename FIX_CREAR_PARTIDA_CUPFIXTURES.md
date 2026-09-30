# Fix: creación de partida y cupFixtures

Al crear una partida nueva, el calendario de liga se generaba antes de que existiera un SaveGame persistido.
La función `buildProtectedCompetitionDates` aceptaba `SaveGame | null`, pero accedía a `save.cupFixtures` sin comprobar el null.

Se ha cambiado ese acceso a `save?.cupFixtures`, de modo que las carreras nuevas generen el calendario con las protecciones estándar de copa/europa sin lanzar:

`Cannot read properties of null (reading 'cupFixtures')`
