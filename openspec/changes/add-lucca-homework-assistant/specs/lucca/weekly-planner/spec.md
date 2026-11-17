# Spec Delta

## Purpose

Pantalla principal de Lucca, "Mi semana": muestra qué tareas tiene cada día escolar, en qué estado están y cuántas estrellas lleva. Usa el estilo C · Bento aprobado y está pensada para un niño de 7 años.

## ADDED Requirements

### Requirement: Vista semanal
El sistema SHALL mostrar los días escolares de lunes a viernes de la semana actual, con su número de día, un indicador de tareas pendientes y el día de hoy resaltado. Al abrir, SHALL quedar seleccionado hoy. En sábado o domingo, SHALL mostrarse la semana siguiente con el lunes seleccionado.

#### Scenario: Abrir un martes
- **WHEN** Lucca abre el asistente el martes 17
- **THEN** ve lunes 16 a viernes 20, con el martes 17 seleccionado y marcado como "Hoy"

#### Scenario: Abrir un domingo
- **WHEN** Lucca abre el asistente un domingo
- **THEN** ve la semana siguiente con el lunes seleccionado

### Requirement: Día de trabajo de cada tarea
El sistema SHALL colocar cada tarea en su "día de trabajo": la fecha asignada si Mereb la da, o si no, el día escolar anterior a la entrega. Cada tarea SHALL mostrar su día de entrega ("Entregar: mié 18"). El padre puede mover una tarea a otro día.

#### Scenario: Tarea con entrega el miércoles
- **WHEN** una tarea sin fecha asignada se entrega el miércoles 18
- **THEN** aparece el martes 17 con la etiqueta "Entregar: mié 18"

#### Scenario: Tarea atrasada
- **WHEN** una tarea no está lista y su entrega es hoy o ya pasó
- **THEN** aparece en el día de hoy con la etiqueta "¡Para hoy!" sin mensajes de regaño

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
