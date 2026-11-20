# Spec Delta

## Purpose

"Practicar": sesiones cortas de juegos sobre el tema de cada tarea para reforzar lo aprendido, con dificultad que se adapta y sin castigos por equivocarse.

## ADDED Requirements

### Requirement: Sesión corta de práctica
Cada sesión de práctica SHALL durar unos 5 minutos, con entre 5 y 8 retos sobre el tema de la tarea, usando los bloques de juego del catálogo (contar, unir parejas, ordenar, opción múltiple, verdadero o falso, completar la palabra, clasificar, recta numérica).

#### Scenario: Empezar a practicar
- **WHEN** Lucca pulsa "Practicar" en "Restas sin llevar"
- **THEN** empieza una sesión de entre 5 y 8 retos de restas, de al menos 2 tipos de juego distintos

### Requirement: Banco de retos preparado
El sistema SHALL preparar un banco de al menos 20 retos por tarea junto con su lección, de modo que una sesión de práctica empiece sin esperar a la IA.

#### Scenario: Práctica inmediata
- **WHEN** Lucca abre "Practicar" en una tarea con la lección ya preparada
- **THEN** el primer reto aparece en menos de 1 segundo

### Requirement: Dificultad adaptable
La sesión SHALL empezar con retos fáciles, subir la dificultad tras 2 aciertos seguidos y bajarla tras 2 fallos seguidos.

#### Scenario: Dos aciertos
- **WHEN** Lucca acierta dos retos seguidos
- **THEN** el siguiente reto es de un nivel más difícil

#### Scenario: Dos fallos
- **WHEN** Lucca falla dos retos seguidos
- **THEN** el siguiente reto es de un nivel más fácil

### Requirement: Retroalimentación amable
Tras cada respuesta, el sistema SHALL dar retroalimentación inmediata y positiva. Si falla, SHALL dar una pista corta y dejarle intentarlo otra vez, sin quitarle estrellas ni puntos.

#### Scenario: Respuesta incorrecta en práctica
- **WHEN** Lucca falla un reto
- **THEN** ve una pista corta, puede intentarlo de nuevo y su contador de estrellas no baja

### Requirement: Repaso de lo fallado
Los retos fallados SHALL volver a aparecer más tarde en la misma sesión o en la siguiente práctica del mismo tema.

#### Scenario: Reto fallado
- **WHEN** Lucca falla un reto y luego acierta el siguiente
- **THEN** un reto parecido al fallado reaparece antes de terminar la sesión o al inicio de la próxima

### Requirement: Cierre de la sesión
Al terminar, el sistema SHALL mostrar un resumen alegre (retos completados y estrella ganada), leerlo en voz alta según el modo de voz, y ofrecer "Otra ronda" o "Volver a mi semana".

#### Scenario: Fin de la práctica
- **WHEN** Lucca completa el último reto
- **THEN** ve "¡Buen trabajo! Hiciste 6 retos", gana una estrella y puede elegir otra ronda o volver

### Requirement: Repaso rápido con práctica espaciada
Al terminar una lección, sus preguntas finales SHALL guardarse para un repaso que vuelve al día siguiente. Cada pregunta acertada a la primera SHALL volver más tarde (a los 3, 7 y 14 días) y una fallada SHALL volver al día siguiente. Lucca ve como mucho 5 preguntas al día y gana una estrella al terminar el repaso, una vez por día. Si papá oculta una tarea, sus preguntas dejan de aparecer.

#### Scenario: Repaso al día siguiente
- **WHEN** Lucca termina la lección de "Las partes de la planta" el miércoles
- **THEN** el miércoles no ve repaso y el jueves ve "3 para repasar hoy" y el botón "Repaso rápido"

#### Scenario: Pregunta fallada
- **WHEN** Lucca falla una pregunta del repaso a la primera
- **THEN** esa pregunta vuelve al día siguiente y las acertadas esperan 3 días

#### Scenario: Una estrella al día
- **WHEN** Lucca termina el repaso dos veces el mismo día
- **THEN** solo gana una estrella

#### Scenario: Papá ve el repaso
- **WHEN** papá abre Progreso
- **THEN** ve cuántas preguntas hay guardadas, cuántas aprendidas y cuántas tocan hoy

