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

#### Scenario: PIN correcto durante el bloqueo
- **WHEN** el acceso está bloqueado y se introduce el PIN correcto
- **THEN** no se entra, se muestra el tiempo que falta y el intento no reinicia el bloqueo

#### Scenario: Intentos restantes
- **WHEN** se introduce un PIN incorrecto con menos de 5 fallos acumulados
- **THEN** se muestra cuántos intentos quedan, y un PIN correcto pone el contador de fallos a cero

#### Scenario: PIN con formato inválido
- **WHEN** se introduce algo que no son entre 4 y 6 dígitos
- **THEN** se pide un PIN de 4 a 6 dígitos y el intento no cuenta como fallo

#### Scenario: Sesión caducada
- **WHEN** pasan más de 15 minutos sin actividad del padre
- **THEN** la siguiente acción pide el PIN de nuevo y no muestra datos

#### Scenario: Cerrar sesión
- **WHEN** el padre pulsa "Salir"
- **THEN** la sesión deja de valer y volver atrás en el navegador no muestra datos

#### Scenario: Sin sesión
- **WHEN** se pide cualquier dato del área del padre sin una sesión válida
- **THEN** se responde que hace falta el PIN y no se devuelve ningún dato

### Requirement: Primera configuración
En el primer arranque, el sistema SHALL guiar al padre por un asistente de configuración: crear el PIN, comprobar que hay API key de IA, comprobar la conexión con Mereb, y elegir el nombre del niño, su grado, el idioma y el tema predeterminados.

#### Scenario: Falta la API key
- **WHEN** el asistente de configuración no encuentra la API key de IA
- **THEN** muestra cómo añadirla al archivo de configuración, avisa de que las lecciones con IA no estarán disponibles hasta que la detecte y deja terminar la configuración

#### Scenario: Datos inválidos
- **WHEN** el PIN no tiene entre 4 y 6 dígitos, la confirmación no coincide o el nombre está vacío
- **THEN** el asistente señala el campo con un mensaje claro y no guarda nada

#### Scenario: Configuración una sola vez
- **WHEN** ya existe un PIN y alguien intenta repetir la configuración inicial
- **THEN** se rechaza y el PIN existente no cambia

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

#### Scenario: Crear una tarea
- **WHEN** el padre crea "Ciencias – Traer una hoja del jardín" para el jueves con su título en inglés
- **THEN** Lucca la ve el jueves en español e inglés y su origen es manual

#### Scenario: Datos de tarea inválidos
- **WHEN** el padre guarda una tarea sin título, con un título de más de 200 caracteres o con la entrega antes del día asignado
- **THEN** se muestra el motivo junto al campo y la tarea no se guarda

#### Scenario: Ocultar y volver a mostrar
- **WHEN** el padre oculta una tarea
- **THEN** Lucca deja de verla, el padre la sigue viendo marcada como oculta y puede volver a mostrarla

#### Scenario: Marcar lista sin dar estrella
- **WHEN** el padre marca una tarea como lista
- **THEN** Lucca la ve lista y sus estrellas no cambian

#### Scenario: Borrar una tarea manual
- **WHEN** el padre confirma "Borrar" en una tarea manual
- **THEN** la tarea desaparece del todo; si cancela, no cambia nada

#### Scenario: Borrar una tarea de Mereb
- **WHEN** el padre confirma "Borrar" en una tarea que vino de Mereb
- **THEN** la tarea queda retirada y las sincronizaciones siguientes no la recrean

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

#### Scenario: Velocidad de la voz
- **WHEN** el padre cambia la velocidad de la voz a 1,1
- **THEN** la lectura en voz alta de Lucca usa esa velocidad desde la siguiente carga

#### Scenario: Valores fuera de rango
- **WHEN** el padre guarda una velocidad fuera de 0,7 a 1,2, un nombre vacío o un grado que no existe
- **THEN** se rechaza con el motivo y los ajustes anteriores se conservan

### Requirement: Cambiar el PIN
El padre SHALL poder cambiar su PIN escribiendo el actual y el nuevo (de 4 a 6 dígitos). Un PIN actual incorrecto cuenta como intento fallido del bloqueo, y tras el cambio el PIN anterior deja de valer.

#### Scenario: Cambio correcto
- **WHEN** el padre escribe su PIN actual y uno nuevo válido
- **THEN** el PIN nuevo funciona y el anterior ya no entra

#### Scenario: PIN actual incorrecto
- **WHEN** el padre escribe mal su PIN actual
- **THEN** el PIN no cambia y el intento cuenta para el bloqueo

### Requirement: Gasto de IA
El sistema SHALL mostrar el gasto estimado de IA del mes y permitir fijar un tope mensual (20 USD por defecto). Al llegar al 80 % SHALL avisar al padre. Al llegar al 100 % SHALL dejar de llamar a la IA y seguir funcionando solo con el contenido ya guardado.

#### Scenario: Tope alcanzado
- **WHEN** el gasto del mes llega al tope configurado
- **THEN** no se hacen nuevas llamadas a la IA, Lucca sigue usando las lecciones guardadas y el padre ve "Tope de IA alcanzado"

#### Scenario: Tarea sin contenido con el tope alcanzado
- **WHEN** el tope está alcanzado y Lucca abre una tarea sin lección guardada
- **THEN** la mascota dice "Esta tarea la vemos con papá" y no se muestra ningún error
