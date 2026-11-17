# Spec Delta

## Purpose

Obtener las tareas de la agenda de Mereb y convertirlas en tareas normalizadas que el asistente muestra a Lucca. Incluye el respaldo por foto y la carga manual para que la agenda nunca quede vacía por un fallo.

## ADDED Requirements

### Requirement: Sincronización automática con Mereb
El sistema SHALL iniciar sesión en la web de Mereb con la cuenta del padre configurada localmente y leer las entradas de la agenda de la semana actual y de la siguiente. La sincronización se ejecuta al arrancar el servidor, cada 3 horas mientras esté encendido y cuando el padre pulsa "Sincronizar ahora".

#### Scenario: Arranque del servidor
- **WHEN** el servidor arranca y hay credenciales de Mereb configuradas
- **THEN** el sistema completa una sincronización en menos de 2 minutos y las tareas aparecen en "Mi semana"

#### Scenario: Sincronización manual
- **WHEN** el padre pulsa "Sincronizar ahora" en su área
- **THEN** el sistema sincroniza y muestra la hora de la última sincronización correcta

#### Scenario: Límite de frecuencia
- **WHEN** se pide una sincronización menos de 15 minutos después de la anterior
- **THEN** el sistema no vuelve a entrar en Mereb y responde con los datos ya guardados

### Requirement: Tarea normalizada
El sistema SHALL convertir cada entrada de la agenda en una tarea con: identificador estable, materia, título, descripción, fecha asignada (si existe), fecha de entrega, adjuntos y origen (`mereb`, `foto` o `manual`). La materia SHALL mapearse a una lista conocida (Matemáticas, Español, Inglés, Ciencias, Sociales, Arte, Música, Educación física, Religión) o a "Otra".

#### Scenario: Entrada con materia conocida
- **WHEN** Mereb publica "Matemáticas – Restas sin llevar, pág. 26" con entrega el miércoles
- **THEN** existe una tarea con materia Matemáticas, título "Restas sin llevar, pág. 26" y fecha de entrega ese miércoles

#### Scenario: Materia desconocida
- **WHEN** la entrada tiene una materia que no está en la lista
- **THEN** la tarea queda con materia "Otra" y conserva el nombre original como etiqueta

### Requirement: Sincronización sin duplicados
El sistema SHALL ser idempotente: volver a sincronizar no crea tareas duplicadas, actualiza las que cambiaron en Mereb y marca como "retirada" (sin borrarla) una tarea que desaparece de Mereb si Lucca ya tenía progreso en ella.

#### Scenario: Doble sincronización
- **WHEN** se sincroniza dos veces sin cambios en Mereb
- **THEN** el número de tareas no cambia

#### Scenario: Tarea modificada por el docente
- **WHEN** el docente cambia la fecha de entrega de una tarea ya sincronizada
- **THEN** la tarea existente se actualiza y conserva el progreso de Lucca

#### Scenario: Tarea retirada con progreso
- **WHEN** una tarea con progreso deja de aparecer en Mereb
- **THEN** la tarea se marca "retirada", se oculta de la vista de Lucca y el padre la sigue viendo en su área

### Requirement: Reutilización de la sesión de Mereb
El sistema SHALL guardar localmente el estado de la sesión de Mereb y reutilizarlo, y SHALL volver a iniciar sesión solo cuando la sesión haya caducado, con un máximo de 6 inicios de sesión por día.

#### Scenario: Sesión vigente
- **WHEN** hay una sesión guardada válida
- **THEN** la sincronización lee la agenda sin volver a escribir usuario y contraseña

#### Scenario: Demasiados inicios de sesión
- **WHEN** se alcanzan 6 inicios de sesión en el día
- **THEN** el sistema deja de intentarlo hasta el día siguiente y avisa al padre

### Requirement: Fallos visibles solo para el padre
Cuando la sincronización falla (credenciales incorrectas, página cambiada, captcha o sin red), el sistema SHALL conservar la última agenda conocida, registrar la causa y mostrarla en el área del padre. A Lucca nunca se le muestran errores técnicos.

#### Scenario: Página de Mereb cambiada
- **WHEN** el lector no encuentra la agenda en la página
- **THEN** el padre ve "No pude leer la agenda de Mereb" con la fecha del último éxito y la opción de subir una foto, y Lucca sigue viendo las tareas guardadas

### Requirement: Respaldo por foto o captura de la agenda
El padre SHALL poder subir una o varias imágenes de la agenda. El sistema extrae las tareas con IA y las muestra al padre para confirmarlas o corregirlas antes de añadirlas.

#### Scenario: Captura de la agenda semanal
- **WHEN** el padre sube una captura con 6 tareas legibles
- **THEN** el sistema propone 6 tareas con materia y fecha, y solo las añade cuando el padre pulsa "Añadir tareas"

#### Scenario: Imagen ilegible
- **WHEN** la imagen no permite leer ninguna tarea
- **THEN** el sistema pide otra imagen con consejos (más luz, enfocar, recortar) y no añade nada

### Requirement: Tareas manuales
El padre SHALL poder crear, editar, mover de día, ocultar y borrar tareas desde su área, aunque provengan de Mereb.

#### Scenario: Tarea manual
- **WHEN** el padre crea "Ciencias – Traer una hoja del jardín" para el jueves
- **THEN** la tarea aparece el jueves en "Mi semana" con origen `manual`

### Requirement: Adjuntos de la agenda
Si una entrada de Mereb trae adjuntos (PDF o imágenes de la hoja de trabajo), el sistema SHALL descargarlos y guardarlos con la tarea para que "Hacer la tarea" los use sin necesidad de foto.

#### Scenario: Ficha adjunta
- **WHEN** una tarea de Mereb incluye un PDF con la ficha
- **THEN** la tarea muestra la ficha y "Hacer la tarea" parte de ella

### Requirement: Credenciales protegidas
Las credenciales de Mereb SHALL leerse solo de la configuración local del servidor. Nunca se escriben en registros, nunca se envían a la IA y nunca se muestran completas en la interfaz.

#### Scenario: Revisión de registros
- **WHEN** se revisan los registros del servidor tras una sincronización
- **THEN** no aparece la contraseña ni las cookies de sesión de Mereb
