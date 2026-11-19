# Spec Delta

## Purpose

Pantalla principal de Lucca, "Mi semana": muestra qué tareas tiene cada día escolar, en qué estado están y cuántas estrellas lleva, le deja elegir la semana y lo guía por semana y por día. Usa el estilo C · Bento aprobado y está pensada para un niño de 7 años.

## ADDED Requirements

### Requirement: Vista semanal
El sistema SHALL mostrar los días escolares de lunes a viernes de la semana elegida (por defecto la actual), con su número de día, un indicador de tareas pendientes y el día de hoy resaltado. Al abrir, SHALL quedar seleccionado hoy. En sábado o domingo, SHALL mostrarse la semana siguiente con el lunes seleccionado.

#### Scenario: Abrir un martes
- **WHEN** Lucca abre el asistente el martes 17
- **THEN** ve lunes 16 a viernes 20, con el martes 17 seleccionado y marcado como "Hoy"

#### Scenario: Abrir un domingo
- **WHEN** Lucca abre el asistente un domingo
- **THEN** ve la semana siguiente con el lunes seleccionado

### Requirement: Elegir la semana
El sistema SHALL permitir a Lucca ir a la semana anterior, a la siguiente o volver a la actual con botones grandes, mostrando el rango de fechas y marcando la semana actual. Al cambiar de semana queda seleccionado hoy si pertenece a esa semana; si no, el primer día con tareas por hacer o, si no hay, el lunes.

#### Scenario: Semana siguiente
- **WHEN** Lucca pulsa "Semana siguiente" estando en la semana del 16
- **THEN** ve lunes 23 a viernes 27, el rango "23 – 27 de noviembre" y el botón "Esta semana" para volver

#### Scenario: Volver a esta semana
- **WHEN** Lucca pulsa "Esta semana" desde otra semana
- **THEN** vuelve a la semana actual con hoy seleccionado

#### Scenario: Rango que cruza de mes
- **WHEN** la semana elegida empieza el 30 de noviembre
- **THEN** el rango se muestra como "30 nov – 4 dic"

#### Scenario: Semana sin tareas
- **WHEN** la semana elegida no tiene tareas
- **THEN** Lucca ve el mensaje de día libre en el día seleccionado y ningún error

### Requirement: Resumen de la semana
El sistema SHALL mostrar el avance de la semana elegida como "N de M tareas listas" con una barra de progreso, contando las tareas que aparecen en los días de esa semana. La mascota SHALL poder leer ese resumen en voz alta.

#### Scenario: Semana con avance
- **WHEN** la semana elegida tiene 10 tareas y 5 están listas
- **THEN** Lucca ve "5 de 10 tareas listas" y la barra llena a la mitad

#### Scenario: Semana sin tareas en el resumen
- **WHEN** la semana elegida no tiene tareas
- **THEN** Lucca ve "Sin tareas esta semana" y no ve barra de progreso

### Requirement: Plan de la semana
El sistema SHALL ofrecer una vista "Plan de la semana" que lista cada día escolar con sus tareas (icono de la materia, título y estado) y dice por dónde empezar: hoy, o el primer día con tareas por hacer si hoy está completo. Tocar un día SHALL llevar a Lucca a ese día.

#### Scenario: Ver el plan
- **WHEN** Lucca abre "Plan de la semana" el martes 17 con tareas por hacer
- **THEN** ve de lunes a viernes sus tareas con su estado y el mensaje "Empieza por hoy"

#### Scenario: Hoy ya está completo
- **WHEN** todas las tareas de hoy están listas y el miércoles tiene tareas por hacer
- **THEN** el plan dice "Empieza por el miércoles"

#### Scenario: Plan con lector de pantalla
- **WHEN** un lector de pantalla recorre el plan de la semana
- **THEN** cada día se anuncia con su nombre y la lista de sus tareas con su estado

#### Scenario: Ir a un día desde el plan
- **WHEN** Lucca toca el miércoles en el plan
- **THEN** vuelve a "Mi semana" con el miércoles seleccionado

### Requirement: Guía del día
El sistema SHALL ofrecer "Guíame" para recorrer las tareas pendientes del día seleccionado de una en una, mostrando "Tarea N de M", la materia y el título, con los botones "¡Ya la hice!" y "Más tarde". El orden SHALL ser: primero la ya empezada, luego las urgentes y luego por materia.

#### Scenario: Guiarme un día con tres pendientes
- **WHEN** Lucca pulsa "Guíame" el martes 17 con Ciencias a medias, Matemáticas y Español por hacer
- **THEN** ve primero Ciencias como "Tarea 1 de 3"

#### Scenario: Ya la hice
- **WHEN** Lucca pulsa "¡Ya la hice!" en una tarea de la guía
- **THEN** la tarea queda "¡Lista!", gana una estrella y la guía pasa a la siguiente tarea

#### Scenario: Más tarde
- **WHEN** Lucca pulsa "Más tarde" en una tarea
- **THEN** la tarea pasa al final de esta ronda, conserva su estado y no ve ningún mensaje de regaño

#### Scenario: Terminar el día
- **WHEN** Lucca completa la última tarea pendiente de la guía
- **THEN** ve "¡Terminaste el día!" con las estrellas ganadas y vuelve a "Mi semana" al pulsar el botón

#### Scenario: Día sin tareas pendientes
- **WHEN** Lucca pulsa "Guíame" en un día sin tareas por hacer
- **THEN** ve el mensaje de día libre o de todo listo en lugar de una guía vacía

#### Scenario: Guía con voz
- **WHEN** Lucca avanza a otra tarea de la guía con el modo "Escuchar" o "Ambos"
- **THEN** la tarea se lee en voz alta y el botón de escuchar la detiene al pulsarlo mientras suena

#### Scenario: Salir de la guía
- **WHEN** Lucca pulsa "Volver a mi semana" en cualquier momento de la guía
- **THEN** vuelve a "Mi semana" con el mismo día seleccionado

### Requirement: Día de trabajo de cada tarea
El sistema SHALL colocar cada tarea en su "día de trabajo": la fecha asignada si Mereb la da, o si no, el día escolar anterior a la entrega. Una tarea sin terminar cuyo día de trabajo ya pasó SHALL aparecer hoy. Cada tarea SHALL mostrar su día de entrega ("Entregar: mié 18"). El padre puede mover una tarea a otro día.

#### Scenario: Tarea con entrega el miércoles
- **WHEN** una tarea sin fecha asignada se entrega el miércoles 18
- **THEN** aparece el martes 17 con la etiqueta "Entregar: mié 18"

#### Scenario: Tarea atrasada
- **WHEN** una tarea no está lista y su entrega es hoy o ya pasó
- **THEN** aparece en el día de hoy con la etiqueta "¡Para hoy!" sin mensajes de regaño

#### Scenario: Tarea pendiente de un día anterior
- **WHEN** una tarea sin terminar tenía su día de trabajo el lunes, hoy es miércoles y su entrega es la semana siguiente
- **THEN** aparece hoy sin la marca "¡Para hoy!" y cuenta en el avance de esta semana, no en el de la semana anterior

### Requirement: Tarjetas de tarea
Cada tarea del día seleccionado SHALL mostrarse como una tarjeta con icono y color de su materia, título, estado y una acción principal ("Empezar", "Seguir" o "Repasar"). Al tocarla se abre la tarea con sus tres opciones: Entender, Hacer la tarea y Practicar.

#### Scenario: Abrir una tarea
- **WHEN** Lucca toca "Empezar" en "Las partes de la planta"
- **THEN** se abre la tarea con los botones Entender, Hacer la tarea y Practicar

#### Scenario: Día sin tareas
- **WHEN** el día seleccionado no tiene tareas
- **THEN** se muestra "¡Nada más por hoy! Tiempo de jugar." en lugar de tarjetas

### Requirement: Estado de la tarea
Cada tarea SHALL tener uno de tres estados: "Por hacer", "A medias" (Lucca empezó alguna actividad) o "¡Lista!" (Lucca pulsó "¡Terminé!" o el padre la marcó). El padre SHALL poder cambiar el estado.

#### Scenario: Empezar una lección
- **WHEN** Lucca completa la primera pantalla de "Entender" de una tarea "Por hacer"
- **THEN** la tarea pasa a "A medias"

#### Scenario: Terminar la tarea
- **WHEN** Lucca pulsa "¡Terminé!" en "Hacer la tarea"
- **THEN** la tarea pasa a "¡Lista!" y el día muestra la marca de completado si no le quedan tareas

### Requirement: Estrellas
El sistema SHALL dar estrellas por terminar pasos (una lección, una práctica, una tarea) y nunca SHALL quitarlas por errores. El total de la semana se muestra en "Mi semana" y empieza de cero cada lunes; el historial queda en el área del padre.

#### Scenario: Error en una pregunta
- **WHEN** Lucca responde mal una pregunta
- **THEN** su número de estrellas no baja

#### Scenario: Nueva semana
- **WHEN** llega el lunes
- **THEN** el contador de la semana vuelve a 0 y el padre conserva el total de la semana anterior

### Requirement: Saludo y mascota
La pantalla SHALL saludar a Lucca por su nombre, resumir el día ("Hoy, martes 17 · Te faltan 2 tareas") y mostrar a la mascota con una sugerencia de por dónde empezar, que se puede escuchar.

#### Scenario: Sugerencia de inicio
- **WHEN** hoy hay tareas pendientes
- **THEN** la mascota sugiere la primera tarea pendiente ("¿Empezamos con Ciencias?") y tiene un botón para escucharla

### Requirement: Sin agenda todavía
Si nunca se ha sincronizado ninguna tarea, el sistema SHALL mostrar a Lucca un mensaje amable ("Pídele a papá que conecte tu agenda") en lugar de una semana vacía.

#### Scenario: Primera vez
- **WHEN** Lucca abre el asistente antes de la primera sincronización
- **THEN** ve el mensaje amable y ningún error técnico

### Requirement: Controles a la medida de un niño
Todo control que use Lucca SHALL medir al menos 60 × 60 px CSS, y las acciones principales al menos 76 px de alto (unos 2 cm en tablet). Ninguna acción SHALL requerir arrastrar sobre distancias largas, doble toque ni gestos complejos.

#### Scenario: Revisión de tamaños
- **WHEN** se mide cualquier botón de las pantallas de Lucca a 1024 × 768
- **THEN** ninguno mide menos de 60 × 60 px

### Requirement: Tema y pantallas
La interfaz SHALL ofrecer modo oscuro y modo claro (el padre elige el predeterminado) y SHALL funcionar sin desplazamiento horizontal en tablet horizontal (1024–1366 px), en tablet vertical (768 px) y en portátil.

#### Scenario: Tablet en vertical
- **WHEN** la tablet se gira a vertical (768 × 1024)
- **THEN** la cuadrícula se reorganiza en una columna y todo sigue visible sin desplazamiento horizontal
