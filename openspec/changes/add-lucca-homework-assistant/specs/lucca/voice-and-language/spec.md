# Spec Delta

## Purpose

Que Lucca pueda usar el asistente aunque todavía lea despacio: modos de audio, lectura o ambos; lectura en voz alta con resaltado; y la interfaz y el contenido en español o en inglés.

## ADDED Requirements

### Requirement: Modos de voz
El sistema SHALL ofrecer tres modos que Lucca cambia en cualquier momento: "Escuchar" (cada pantalla se lee sola al abrirse y los botones de audio se ven grandes), "Leer" (no hay audio automático y se ocultan los botones de audio) y "Ambos" (texto visible y lectura automática). El modo elegido se recuerda.

#### Scenario: Modo Leer
- **WHEN** Lucca elige "Leer"
- **THEN** las pantallas no se leen solas y desaparecen los botones de audio de las tarjetas

#### Scenario: Modo Escuchar
- **WHEN** Lucca elige "Escuchar" y abre una pantalla de lección
- **THEN** el texto de la pantalla se lee en voz alta sin pulsar nada

#### Scenario: Modo recordado
- **WHEN** Lucca cierra y vuelve a abrir el asistente
- **THEN** sigue en el último modo que eligió

### Requirement: Botón de escuchar
En los modos "Escuchar" y "Ambos", todo texto que Lucca deba entender (saludo, tarjetas, pantallas de lección, pistas y preguntas) SHALL tener un botón para escucharlo. Pulsarlo mientras suena lo detiene.

#### Scenario: Escuchar una tarjeta
- **WHEN** Lucca pulsa el altavoz de la tarjeta "Las partes de la planta"
- **THEN** oye la materia y el título de la tarea

### Requirement: Resaltado de palabras
Mientras se lee un texto en voz alta, el sistema SHALL resaltar la palabra que se está diciendo, si el motor de voz lo permite. Si no lo permite, SHALL resaltar la frase completa.

#### Scenario: Lectura con resaltado
- **WHEN** se lee "Esta es la raíz. Toma agua de la tierra."
- **THEN** cada palabra se resalta al pronunciarse, o cada frase si el motor no informa de las palabras

### Requirement: Velocidad y voz
La lectura SHALL usar por defecto una velocidad un 10 % más lenta que la normal. El padre SHALL poder elegir la voz de cada idioma y ajustar la velocidad entre 0,7× y 1,2×.

#### Scenario: Cambio de voz
- **WHEN** el padre elige otra voz en español
- **THEN** las siguientes lecturas en español usan esa voz

### Requirement: Idioma de la interfaz y del contenido
Lucca SHALL poder cambiar entre Español y English en cualquier momento. La interfaz, las tareas y el contenido generado cambian al instante, sin perder el avance de la pantalla en la que está.

#### Scenario: Cambiar a inglés
- **WHEN** Lucca pulsa "English" en "Mi semana"
- **THEN** el saludo, los días, los botones y los títulos de las tareas se muestran en inglés

### Requirement: Pronunciación por idioma
Cada fragmento de texto SHALL leerse con una voz de su idioma, aunque aparezca dentro de un texto en el otro idioma.

#### Scenario: Palabras en inglés dentro de una tarea en español
- **WHEN** se lee "Palabras: cat, hat, bat" con la interfaz en español
- **THEN** "Palabras" se lee con voz en español y "cat, hat, bat" con voz en inglés

### Requirement: Voz no disponible
Si el dispositivo no tiene una voz para un idioma, el sistema SHALL avisar al padre en su área con instrucciones para instalarla y, mientras tanto, mostrar el texto sin audio sin mostrar errores a Lucca.

#### Scenario: Tablet sin voz en inglés
- **WHEN** el dispositivo no tiene voz en inglés y Lucca pulsa un altavoz con la interfaz en inglés
- **THEN** no suena nada, Lucca no ve errores y el padre ve el aviso "Instala una voz en inglés en este dispositivo"

### Requirement: Etiquetas accesibles
Todo control interactivo SHALL tener una etiqueta accesible en el idioma activo, y los botones que solo tienen icono SHALL tener nombre accesible.

#### Scenario: Lector de pantalla
- **WHEN** un lector de pantalla recorre "Mi semana" en inglés
- **THEN** cada botón se anuncia con un nombre en inglés, incluidos los altavoces
