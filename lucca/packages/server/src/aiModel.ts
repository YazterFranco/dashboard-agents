import Anthropic from '@anthropic-ai/sdk';
import type { Config } from './config.js';
import { ClaudeLessonModel } from './ai/claude.js';
import type { LessonModel } from './ai/generate.js';
import { RecordedLessonModel } from './ai/recorded.js';

/** La fuente de lecciones según la configuración. La clave la lee el SDK del entorno; nunca pasa por aquí. */
export function lessonModelFor(config: Config): LessonModel | null {
  if (config.aiMode === 'recorded') return new RecordedLessonModel();
  if (config.aiMode === 'live') return new ClaudeLessonModel(new Anthropic());
  return null;
}

