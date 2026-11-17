# Spec Delta

## Purpose

"Hacer la tarea": guiar a Lucca paso a paso en los ejercicios reales de su tarea, a partir de una foto de la hoja o del libro (o de la ficha adjunta en Mereb), con pistas graduadas y sin darle nunca la respuesta.

## ADDED Requirements

### Requirement: Foto de la hoja
Lucca o su padre SHALL poder añadir hasta 4 fotos de la hoja o del libro de tres formas: con la cámara de la tablet, eligiendo un archivo o escaneando un código QR con el celular conectado al mismo wifi. La foto subida desde el celular SHALL aparecer en la pantalla de Lucca sin recargar.

#### Scenario: Foto con la tablet
- **WHEN** Lucca pulsa "Tomar foto" en la tablet
- **THEN** se abre la cámara trasera y, tras la foto, aparece su miniatura en la tarea

#### Scenario: Foto con el celular por QR
- **WHEN** el padre escanea el QR que muestra la pantalla y toma la foto con el celular
- **THEN** la foto aparece en la pantalla de Lucca en menos de 5 segundos

#### Scenario: Enlace QR caducado
- **WHEN** se usa el enlace del QR más de 10 minutos después de generarlo o por segunda vez
- **THEN** el celular ve "Este código ya no sirve, genera otro" y no se sube nada

### Requirement: Lectura de los ejercicios
El sistema SHALL leer la foto con IA y mostrar la lista de ejercicios detectados (número y enunciado corto) junto a la miniatura para que Lucca confirme "¡Sí, es mi hoja!". Si la foto no se puede leer, SHALL pedir otra con consejos sencillos.

#### Scenario: Hoja legible
- **WHEN** la foto muestra 6 restas numeradas
- **THEN** Lucca ve 6 tarjetas de ejercicio y el botón "¡Sí, es mi hoja!"

#### Scenario: Foto borrosa
- **WHEN** la foto está borrosa u oscura
- **THEN** la mascota dice "No la veo bien. Busca más luz y acércate un poco" y ofrece repetir la foto

### Requirement: Guía paso a paso
Para cada ejercicio, el sistema SHALL dividir el trabajo en pasos cortos y guiar a Lucca uno a uno. Lucca resuelve en su hoja o responde en la pantalla con un teclado grande de números o con opciones; cuando la respuesta se puede comprobar, el sistema la comprueba.

#### Scenario: Resta guiada
- **WHEN** Lucca trabaja "47 − 23"
- **THEN** ve primero "Empieza por las unidades: 7 − 3" y, al responder 4, pasa al paso de las decenas

### Requirement: Escalera de pistas
Lucca SHALL poder pedir ayuda en cada paso con una escalera de 3 niveles: pista pequeña, pista grande y ejemplo parecido resuelto con otros datos. Tras usar las 3 pistas y seguir sin poder, el sistema SHALL sugerir pedir ayuda a papá y marcar el ejercicio para el padre.

#### Scenario: Pedir pistas
- **WHEN** Lucca pulsa "Ayuda" tres veces en el mismo paso
- **THEN** ve en orden la pista pequeña, la pista grande y un ejemplo parecido ya resuelto con números distintos

#### Scenario: Sigue atascado
- **WHEN** Lucca falla el paso después de ver las 3 pistas
- **THEN** la mascota dice "¡Vamos a pedirle ayuda a papá!" y el ejercicio aparece marcado en el área del padre

### Requirement: Nunca dar la respuesta
El sistema MUST NOT mostrar ni decir la respuesta final de un ejercicio de la tarea antes de que Lucca dé la suya. Si su respuesta es incorrecta, SHALL indicar qué paso revisar, no el resultado correcto. Cada pista generada MUST pasar un control que rechaza las que contienen la respuesta.

#### Scenario: Respuesta incorrecta
- **WHEN** Lucca responde 25 a "47 − 23"
- **THEN** ve "Casi. Revisa las unidades: ¿cuánto es 7 − 3?" y no ve el número 24

#### Scenario: Pista que revela la respuesta
- **WHEN** una pista generada contiene la respuesta del ejercicio
- **THEN** la pista se descarta y se genera otra antes de mostrarse

### Requirement: Ficha adjunta de Mereb
Si la tarea tiene una ficha adjunta desde Mereb, el sistema SHALL usarla en lugar de pedir foto, y Lucca SHALL poder añadir una foto si su hoja es distinta.

#### Scenario: Tarea con ficha
- **WHEN** Lucca abre "Hacer la tarea" en una tarea con ficha PDF adjunta
- **THEN** ve directamente los ejercicios de la ficha

### Requirement: Guía por tema sin foto
Si no hay foto ni ficha, el sistema SHALL guiar a Lucca con ejercicios parecidos sobre el tema de la tarea y después le pedirá que haga su hoja solo y pulse "¡Terminé!".

#### Scenario: Sin foto
- **WHEN** Lucca pulsa "No tengo foto"
- **THEN** practica 3 ejercicios guiados sobre "restas sin llevar" y luego ve "¡Ahora hazlo en tu hoja!"

### Requirement: Terminar la tarea
Lucca SHALL poder pulsar "¡Terminé!" en cualquier momento de "Hacer la tarea". El sistema marca la tarea como lista, le da una estrella y muestra una celebración breve que respeta el ajuste de movimiento reducido.

#### Scenario: Terminar
- **WHEN** Lucca pulsa "¡Terminé!"
- **THEN** la tarea queda "¡Lista!", su contador de estrellas sube en 1 y vuelve a "Mi semana" tras la celebración

### Requirement: Fotos privadas y temporales
Las fotos SHALL guardarse solo en el servidor de casa, sin metadatos de ubicación, y SHALL borrarse automáticamente a los 30 días (el padre puede cambiar el plazo).

#### Scenario: Limpieza de fotos
- **WHEN** una foto cumple 30 días
- **THEN** se borra del disco y la tarea conserva solo la lista de ejercicios leída
