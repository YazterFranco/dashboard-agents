# Spec Delta

## Purpose

"Entender": lecciones interactivas cortas, generadas con IA para cada tarea, que explican el tema a un niño de 7 años con una idea por pantalla. Se construyen con una biblioteca de bloques validados más un bloque libre aislado.

## ADDED Requirements

### Requirement: Estructura de la lección
Cada lección SHALL tener entre 4 y 6 pantallas, con una sola idea por pantalla, y SHALL terminar con 2 o 3 preguntas cortas de comprensión. Lucca avanza y retrocede con botones grandes y ve su avance ("Paso 2 de 5").

#### Scenario: Recorrer una lección
- **WHEN** Lucca abre "Entender" en "Las partes de la planta"
- **THEN** ve la pantalla 1 de entre 4 y 6, con botones "Atrás" y "Siguiente" y el indicador de paso

#### Scenario: Preguntas finales
- **WHEN** Lucca llega al final de la lección
- **THEN** responde 2 o 3 preguntas cortas antes de ver la celebración y su estrella

### Requirement: Catálogo de bloques
Las lecciones SHALL construirse solo con bloques del catálogo: explicación con ilustración, tocar partes de un dibujo, contar objetos, recta numérica, ordenar pasos, unir parejas, opción múltiple, verdadero o falso, completar la palabra, clasificar en grupos, mini cuento y bloque libre.

#### Scenario: Bloque desconocido
- **WHEN** la IA propone un tipo de bloque que no está en el catálogo
- **THEN** la lección no supera la validación y no se muestra así

### Requirement: Validación antes de mostrar
Toda lección generada MUST cumplir el esquema de bloques y los controles automáticos de calidad y seguridad antes de mostrarse. Si falla, el sistema SHALL reintentar hasta 2 veces y, si sigue fallando, SHALL usar una lección sencilla de respaldo (explicación + preguntas). Nunca se muestra una lección rota.

#### Scenario: Generación inválida
- **WHEN** la respuesta de la IA no cumple el esquema dos veces seguidas y la tercera también falla
- **THEN** Lucca ve la lección sencilla de respaldo y el padre ve el aviso en su área

### Requirement: Bloque libre aislado
El bloque libre (animaciones o simulaciones que ningún bloque cubre) SHALL ejecutarse aislado: sin red, sin acceso a datos de la aplicación ni al resto de la página, con un tamaño máximo de 100 KB, y comunicándose solo con los eventos "terminado" y "respuesta". Si no carga en 3 segundos o falla, se omite.

#### Scenario: Intento de acceso a red
- **WHEN** el código de un bloque libre intenta cargar un recurso de internet
- **THEN** la petición se bloquea y la lección continúa

#### Scenario: Bloque libre que falla
- **WHEN** el bloque libre lanza un error al cargar
- **THEN** se omite y Lucca pasa a la pantalla siguiente sin ver el error

### Requirement: Lecciones preparadas por adelantado
Tras cada sincronización, el sistema SHALL preparar en segundo plano las lecciones de las tareas de la semana visible. Si Lucca abre una lección que aún no está lista, el sistema SHALL generarla en ese momento y mostrar una animación de espera amable, con un máximo de 60 segundos.

#### Scenario: Lección lista
- **WHEN** Lucca abre "Entender" de una tarea sincronizada hace una hora
- **THEN** la lección aparece en menos de 1 segundo

#### Scenario: Lección no preparada
- **WHEN** Lucca abre "Entender" de una tarea recién añadida
- **THEN** ve una animación de la mascota "Estoy preparando tu lección" y la lección aparece en 60 segundos o menos

### Requirement: Lecciones guardadas
Una lección generada SHALL guardarse y reutilizarse: volver a abrirla no la genera de nuevo, salvo que el padre pida regenerarla o Lucca pida otra explicación.

#### Scenario: Reabrir una lección
- **WHEN** Lucca abre la misma lección por segunda vez
- **THEN** ve el mismo contenido sin nueva llamada a la IA

### Requirement: Lecciones bilingües
Cada lección SHALL existir en español y en inglés y mostrarse en el idioma activo. Las tareas de Inglés SHALL mostrarse en inglés por defecto, con un botón "¿Me lo dices en español?" para esa pantalla. Las de Español SHALL mostrarse en español por defecto, con "Tell me in English?".

#### Scenario: Cambio de idioma
- **WHEN** Lucca cambia a EN en mitad de una lección de Ciencias
- **THEN** la misma pantalla se muestra en inglés sin perder su avance

#### Scenario: Tarea de Inglés
- **WHEN** Lucca abre una lección de la materia Inglés con la interfaz en español
- **THEN** el contenido se muestra en inglés y el botón "¿Me lo dices en español?" está disponible

### Requirement: Explícamelo de otra forma
Lucca SHALL poder pedir "Explícamelo de otra forma" en cualquier pantalla. El sistema también lo ofrece cuando falla dos veces la misma pregunta. La nueva explicación usa otro enfoque (más visual o con objetos del día a día).

#### Scenario: Dos fallos seguidos
- **WHEN** Lucca falla dos veces la misma pregunta de comprensión
- **THEN** la mascota ofrece "¿Te lo explico de otra forma?" y, si acepta, ve una explicación con otro enfoque

### Requirement: Adaptado a su edad
El contenido SHALL estar adaptado a un niño de 7 años en el grado configurado: frases de 12 palabras o menos, vocabulario sencillo, ejemplos concretos y tono alegre y paciente.

#### Scenario: Control de longitud
- **WHEN** una pantalla generada tiene una frase de más de 12 palabras
- **THEN** la lección no supera los controles automáticos y se regenera

### Requirement: Revisión del padre
El padre SHALL poder ver cualquier lección tal como la ve Lucca, regenerarla u ocultarla. El ajuste "Revisar antes de mostrar" viene desactivado; si el padre lo activa, una lección nueva no se muestra a Lucca hasta que él la aprueba. Los controles automáticos se aplican siempre.

#### Scenario: Ajuste por defecto
- **WHEN** se genera una lección nueva sin cambiar los ajustes
- **THEN** la lección se muestra a Lucca en cuanto supera los controles automáticos

#### Scenario: Aprobación obligatoria
- **WHEN** "Revisar antes de mostrar" está activado y se genera una lección nueva
- **THEN** Lucca ve "Papá está revisando esta lección" hasta que el padre la aprueba

### Requirement: Pistas que no dan la respuesta
Cada pregunta final SHALL poder llevar una pista corta que se muestra solo después del primer fallo. La pista MUST NOT contener la respuesta correcta (ni la opción correcta, ni el número en cifras o en palabras, ni "verdadero"/"falso"); si la contiene, la lección no supera los controles.

#### Scenario: Primer fallo
- **WHEN** Lucca falla una pregunta que tiene pista
- **THEN** ve "Pista:" con una frase que le ayuda a pensar, sin la respuesta

#### Scenario: Pista con la respuesta
- **WHEN** la IA propone la pista "Es la raíz" para la pregunta cuya respuesta es "La raíz"
- **THEN** la lección no supera los controles y se regenera

### Requirement: Elogio del esfuerzo
Los mensajes tras una respuesta SHALL elogiar el razonamiento o la constancia ("¡Muy bien pensado!", "¡Seguiste intentando y lo lograste!") y nunca el talento.

#### Scenario: Acierto tras un fallo
- **WHEN** Lucca acierta una pregunta después de fallarla
- **THEN** ve "¡Seguiste intentando y lo lograste!"

### Requirement: Tocar para oír
Con la voz activa ("Escuchar" o "Ambos"), cada texto de la lección SHALL poder tocarse para oírlo, con la voz del idioma de cada palabra. En modo "Leer" los textos no son tocables.

#### Scenario: Tocar una frase
- **WHEN** Lucca toca "Una planta es un ser vivo"
- **THEN** la frase se lee en voz alta

