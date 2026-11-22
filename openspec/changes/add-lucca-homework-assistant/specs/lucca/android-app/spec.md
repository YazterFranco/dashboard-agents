# Spec Delta

## Purpose

Instalar el asistente como una app de Android que funciona sola, sin computadora ni servidor, con una guía de uso al abrirla por primera vez y la agenda de Mereb traída sin guardar la contraseña de Mereb.

## ADDED Requirements

### Requirement: App de Android sin servidor
El sistema SHALL poder instalarse como una app de Android (APK) que ejecuta dentro del dispositivo las mismas rutas que el servidor, con su base de datos guardada en el almacenamiento privado de la app. Sin conexión a internet, todo funciona salvo la IA y abrir Mereb.

#### Scenario: Datos guardados en el dispositivo
- **WHEN** papá importa la agenda y cierra la app
- **THEN** al volver a abrirla las tareas siguen ahí y el área de papá vuelve a pedir el PIN

#### Scenario: Sin internet
- **WHEN** el dispositivo no tiene conexión
- **THEN** Lucca abre la app, ve sus tareas, abre las lecciones guardadas o de ejemplo y practica

#### Scenario: Un cambio justo antes de cerrar
- **WHEN** papá marca una tarea como lista, vuelve enseguida a la pantalla de Lucca y cierra la app
- **THEN** al abrirla de nuevo la tarea sigue marcada como lista

### Requirement: Guía de uso al abrir por primera vez
La primera vez que se abre (sin PIN), el sistema SHALL mostrar una guía paso a paso: qué es el asistente, cómo lo usan Lucca y papá, crear el PIN, conectar Mereb e (opcionalmente) la clave de IA. La guía SHALL poder volver a abrirse desde el área de papá.

#### Scenario: Primera apertura
- **WHEN** se abre la app recién instalada
- **THEN** se ve la guía en lugar de la pantalla de Lucca, y al terminarla Lucca ve sus tareas

#### Scenario: Volver a ver la guía
- **WHEN** papá pulsa «Guía de uso» en su área
- **THEN** se abre la guía sin repetir la creación del PIN y se puede cerrar en cualquier paso

### Requirement: Mereb sin guardar la contraseña
El sistema SHALL guardar solo la dirección de Mereb y abrirla en el navegador del dispositivo, donde papá escribe su usuario y contraseña. La app SHALL aceptar el PDF exportado de la agenda desde «Abrir con» o «Compartir» de Android y abrir su revisión tras el PIN.

#### Scenario: Abrir Mereb
- **WHEN** papá guarda la dirección https de Mereb y pulsa «Abrir Mereb»
- **THEN** Mereb se abre fuera de la app y en ningún momento la app pide la contraseña de Mereb

#### Scenario: PDF compartido con Lucca
- **WHEN** papá comparte el PDF exportado de la agenda con Lucca
- **THEN** la app pide el PIN y muestra la revisión de esa agenda

### Requirement: Clave de IA en el dispositivo
El sistema SHALL permitir a papá guardar, cambiar o quitar la clave de IA desde la app (protegido por su PIN), mostrar solo sus últimos 4 caracteres y usar lecciones de ejemplo mientras no haya clave.

#### Scenario: Clave mal escrita
- **WHEN** papá escribe una clave que no empieza por «sk-ant-»
- **THEN** la app lo explica junto al campo y no la guarda

### Requirement: Actualizaciones sin perder datos
Cada versión del APK SHALL firmarse con la misma llave, guardada fuera del repositorio, para instalarse encima de la anterior conservando los datos.

#### Scenario: Nueva versión
- **WHEN** se instala una versión nueva firmada con la misma llave
- **THEN** se instala encima y Lucca conserva sus tareas, estrellas y progreso
