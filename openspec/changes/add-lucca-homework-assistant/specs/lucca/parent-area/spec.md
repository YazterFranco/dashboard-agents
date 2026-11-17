# Spec Delta

## Purpose

Dar al padre un lugar protegido para configurar el asistente, conectar Mereb, revisar tareas y lecciones, ver el progreso de Lucca y controlar el gasto de IA.

## ADDED Requirements

### Requirement: Acceso con PIN
El área del padre SHALL protegerse con un PIN de 4 a 6 dígitos creado en la primera configuración. Tras 5 intentos fallidos, el acceso SHALL bloquearse durante 5 minutos. La sesión del padre se cierra sola tras 15 minutos sin actividad.

#### Scenario: PIN correcto
- **WHEN** el padre pulsa el candado e introduce su PIN
- **THEN** entra al área del padre

#### Scenario: Intentos fallidos
- **WHEN** se introduce un PIN incorrecto 5 veces seguidas
- **THEN** el acceso queda bloqueado 5 minutos y el contador se muestra en pantalla

### Requirement: Primera configuración
En el primer arranque, el sistema SHALL guiar al padre por un asistente de configuración: crear el PIN, comprobar que hay API key de IA, comprobar la conexión con Mereb, y elegir el nombre del niño, su grado, el idioma y el tema predeterminados.

#### Scenario: Falta la API key
- **WHEN** el asistente de configuración no encuentra la API key de IA
- **THEN** muestra cómo añadirla al archivo de configuración y no deja terminar hasta que la detecta

### Requirement: Conexión con Mereb
El padre SHALL ver el estado de la conexión con Mereb (conectado, error con causa, última sincronización), probar la conexión y lanzar una sincronización manual.

#### Scenario: Probar conexión
- **WHEN** el padre pulsa "Probar conexión" con credenciales válidas
- **THEN** ve "Conectado a Mereb" y la cantidad de tareas encontradas

### Requirement: Gestión de la agenda
El padre SHALL ver las tareas de la semana anterior, la actual y la siguiente, y podrá editarlas, moverlas de día, ocultarlas, marcarlas como listas, añadir tareas manuales y subir fotos de la agenda.

#### Scenario: Mover una tarea
- **WHEN** el padre mueve una tarea del martes al miércoles
- **THEN** Lucca la ve el miércoles

### Requirement: Revisión de lecciones
El padre SHALL poder abrir cualquier lección o práctica en modo vista previa (tal como la ve Lucca, sin que cuente como progreso), regenerarla, ocultarla y activar o desactivar "Revisar antes de mostrar".

#### Scenario: Vista previa
- **WHEN** el padre abre la vista previa de una lección y la recorre entera
- **THEN** la tarea de Lucca no cambia de estado ni gana estrellas

### Requirement: Progreso semanal
El padre SHALL ver por semana: tareas listas y pendientes, tiempo de uso por día, estrellas, pistas usadas y ejercicios en los que Lucca pidió ayuda a papá.

#### Scenario: Ejercicio marcado
- **WHEN** Lucca agota las 3 pistas en un ejercicio
- **THEN** el ejercicio aparece en "Necesita ayuda" en el progreso del padre, con la foto y el paso donde se atascó

### Requirement: Ajustes
El padre SHALL poder cambiar: idioma y modo de voz predeterminados, voz y velocidad por idioma, tema oscuro o claro, recordatorio de pausa y límite diario de uso, y el plazo de borrado de fotos.

#### Scenario: Cambiar tema
- **WHEN** el padre cambia el tema a claro
- **THEN** las pantallas de Lucca se muestran en modo claro desde la siguiente carga

### Requirement: Gasto de IA
El sistema SHALL mostrar el gasto estimado de IA del mes y permitir fijar un tope mensual (20 USD por defecto). Al llegar al 80 % SHALL avisar al padre. Al llegar al 100 % SHALL dejar de llamar a la IA y seguir funcionando solo con el contenido ya guardado.

#### Scenario: Tope alcanzado
- **WHEN** el gasto del mes llega al tope configurado
- **THEN** no se hacen nuevas llamadas a la IA, Lucca sigue usando las lecciones guardadas y el padre ve "Tope de IA alcanzado"

#### Scenario: Tarea sin contenido con el tope alcanzado
- **WHEN** el tope está alcanzado y Lucca abre una tarea sin lección guardada
- **THEN** la mascota dice "Esta tarea la vemos con papá" y no se muestra ningún error
