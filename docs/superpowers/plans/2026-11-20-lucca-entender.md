# Plan: "Entender" — lecciones interactivas con IA (fase 4 + 5 de OpenSpec)

**Objetivo:** que «Empezar» en una tarea abra una lección corta e interactiva (4–6 pantallas + 2–3 preguntas) en el
idioma correcto, con voz, estrella al terminar y «Explícamelo de otra forma». Funciona ya sin clave (modo grabado para la
demo y las pruebas) y con IA real en cuanto papá ponga `ANTHROPIC_API_KEY` en el `.env`.

**Decisiones (dentro de lo aprobado en design.md):**
- `LessonDoc` en `shared/lesson.ts`: textos bilingües por fragmentos, ilustraciones con emoji (la biblioteca Fluent 5.2
  queda para después), catálogo v1 de 10 bloques: explain, story, choice, trueFalse, count, numberLine, order, match,
  fillWord, sort. `hotspots` y `freeform` (iframe) quedan pendientes.
- Controles deterministas D6: esquema, sin URLs, frases ≤ 12 palabras, ambos idiomas, índices en rango, emoji corto.
- Generación: `LessonModel` (interfaz) → `generateLesson` con 3 intentos y lección de respaldo. Adaptador Claude:
  `client.beta.messages.parse` + `betaZodOutputFormat`, `claude-opus-5-5`, `effort: medium`, `fallbacks: "default"`
  (beta `server-side-fallback-2026-07-01`), caché del prompt de sistema, comprobación de `refusal`.
- Modos: `LUCCA_AI=recorded` (lecciones grabadas, sin red) · clave presente → IA real · sin clave → «Esta tarea la vemos con papá».
- Lecciones guardadas en `lessons` (no se regeneran al reabrir); gasto en `ai_usage` con tope mensual (20 USD).
- Web: `LessonPlayer` (Atrás/Siguiente, «Paso N de M», preguntas, celebración, otra explicación tras 2 fallos,
  idioma por materia con botón para cambiar, lectura en voz alta). Papá: «Ver lección» y «Regenerar», y el gasto de IA.

**Tareas:** 1 esquema+controles · 2 generador+respaldo+grabadas · 3 adaptador Claude · 4 almacén+API niño/papá+gasto ·
5 bloques web · 6 reproductor + integración · 7 área de papá · 8 pruebas funcionales + capturas · 9 docs/OpenSpec.
