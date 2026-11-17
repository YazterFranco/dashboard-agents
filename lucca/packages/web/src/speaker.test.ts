import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpeaker, pickVoice, shouldAutoSpeak, showSpeakerButtons, type Segment } from './speaker';

class FakeUtterance {
  lang = '';
  rate = 1;
  voice: { lang: string; name: string } | null = null;
  onboundary: ((e: { name: string; charIndex: number; charLength?: number }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

function fakeSynth(voices: { lang: string; name: string }[]) {
  const spoken: FakeUtterance[] = [];
  const synth = {
    spoken,
    speak: (u: FakeUtterance) => void spoken.push(u),
    cancel: vi.fn(),
    getVoices: () => voices,
  };
  return synth;
}

const ES_PA = { lang: 'es-PA', name: 'Paulina' };
const ES_MX = { lang: 'es-MX', name: 'Mónica' };
const ES_ES = { lang: 'es-ES', name: 'Jorge' };
const ES_419 = { lang: 'es-419', name: 'Soledad' };
const ES_US = { lang: 'es-US', name: 'Paloma' };
const EN_GB = { lang: 'en-GB', name: 'Daniel' };
const EN_US = { lang: 'en-US', name: 'Samantha' };

beforeEach(() => vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance));
afterEach(() => vi.unstubAllGlobals());

describe('pickVoice', () => {
  it('prefers es-PA over es-MX over es-US over es-419 over any es-*', () => {
    expect(pickVoice([ES_ES, ES_419, ES_US, ES_MX, ES_PA], 'es')).toBe(ES_PA);
    expect(pickVoice([ES_ES, ES_419, ES_US, ES_MX], 'es')).toBe(ES_MX);
    expect(pickVoice([ES_ES, ES_419, ES_US], 'es')).toBe(ES_US);
    expect(pickVoice([ES_ES, ES_419], 'es')).toBe(ES_419);
    expect(pickVoice([ES_ES], 'es')).toBe(ES_ES);
  });

  it('prefers en-US and then any en-*', () => {
    expect(pickVoice([EN_GB, EN_US], 'en')).toBe(EN_US);
    expect(pickVoice([EN_GB], 'en')).toBe(EN_GB);
  });

  it('returns null when no voice matches the language', () => {
    expect(pickVoice([EN_US], 'es')).toBeNull();
    expect(pickVoice([], 'en')).toBeNull();
  });

  it('accepts tags written with an underscore, in any case', () => {
    const v = { lang: 'es_PA', name: 'Paulina' };
    expect(pickVoice([ES_ES, v], 'es')).toBe(v);
    expect(pickVoice([{ lang: 'EN-us', name: 'x' }], 'en')).not.toBeNull();
  });
});

describe('createSpeaker', () => {
  const segments: Segment[] = [
    { text: 'Palabras:', lang: 'es' },
    { text: 'cat, hat, bat', lang: 'en' },
  ];

  it('speaks one utterance per segment with the voice of its language', () => {
    const synth = fakeSynth([ES_MX, EN_US]);
    createSpeaker(synth as never).speak(segments);
    expect(synth.spoken.map((u) => [u.text, u.lang, u.voice])).toEqual([
      ['Palabras:', 'es-MX', ES_MX],
      ['cat, hat, bat', 'en-US', EN_US],
    ]);
  });

  it('uses rate 0.9 by default and accepts another rate', () => {
    const a = fakeSynth([ES_MX]);
    createSpeaker(a as never).speak([segments[0]]);
    expect(a.spoken[0].rate).toBe(0.9);
    const b = fakeSynth([ES_MX]);
    createSpeaker(b as never, 1.1).speak([segments[0]]);
    expect(b.spoken[0].rate).toBe(1.1);
  });

  it('speaks with the language tag while the voice list is not loaded yet', () => {
    const synth = fakeSynth([]);
    createSpeaker(synth as never).speak([segments[0]]);
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0].lang).toBe('es-MX');
  });

  it('skips silently a segment whose language has no voice', () => {
    const synth = fakeSynth([ES_MX]);
    const onEnd = vi.fn();
    createSpeaker(synth as never).speak(segments, { onEnd });
    expect(synth.spoken.map((u) => u.text)).toEqual(['Palabras:']);
    synth.spoken[0].onend!();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('ends immediately when no segment can be spoken', () => {
    const synth = fakeSynth([ES_MX]);
    const onEnd = vi.fn();
    const speaker = createSpeaker(synth as never);
    speaker.speak([segments[1]], { onEnd });
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(speaker.speaking).toBe(false);
  });

  it('emits onWord for word boundaries only', () => {
    const synth = fakeSynth([ES_MX]);
    const onWord = vi.fn();
    createSpeaker(synth as never).speak([segments[0]], { onWord });
    synth.spoken[0].onboundary!({ name: 'sentence', charIndex: 0 });
    synth.spoken[0].onboundary!({ name: 'word', charIndex: 3, charLength: 4 });
    expect(onWord).toHaveBeenCalledTimes(1);
    expect(onWord).toHaveBeenCalledWith(0, 3, 4);
  });

  it('reports segment ends and the final end, then stops speaking', () => {
    const synth = fakeSynth([ES_MX, EN_US]);
    const onSegmentEnd = vi.fn();
    const onEnd = vi.fn();
    const speaker = createSpeaker(synth as never);
    speaker.speak(segments, { onSegmentEnd, onEnd });
    expect(speaker.speaking).toBe(true);
    synth.spoken[0].onend!();
    expect(onSegmentEnd).toHaveBeenLastCalledWith(0);
    expect(onEnd).not.toHaveBeenCalled();
    synth.spoken[1].onend!();
    expect(onSegmentEnd).toHaveBeenLastCalledWith(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(speaker.speaking).toBe(false);
  });

  it('stop cancels the queue and clears speaking', () => {
    const synth = fakeSynth([ES_MX]);
    const speaker = createSpeaker(synth as never);
    speaker.speak([segments[0]]);
    speaker.stop();
    expect(synth.cancel).toHaveBeenCalled();
    expect(speaker.speaking).toBe(false);
  });

  it('ignores late events from a cancelled reading', () => {
    const synth = fakeSynth([ES_MX]);
    const speaker = createSpeaker(synth as never);
    const firstEnd = vi.fn();
    speaker.speak([segments[0]], { onEnd: firstEnd });
    speaker.speak([{ text: 'Hola', lang: 'es' }]);
    synth.spoken[0].onerror!();
    synth.spoken[0].onend!();
    expect(speaker.speaking).toBe(true);
    expect(firstEnd).not.toHaveBeenCalled();
  });

  it('never throws when speechSynthesis is missing', () => {
    const speaker = createSpeaker(undefined);
    const onEnd = vi.fn();
    expect(speaker.available('es')).toBe(false);
    expect(() => speaker.speak(segments, { onEnd })).not.toThrow();
    expect(() => speaker.stop()).not.toThrow();
    expect(speaker.speaking).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('available reflects the installed voices', () => {
    const speaker = createSpeaker(fakeSynth([ES_MX]) as never);
    expect(speaker.available('es')).toBe(true);
    expect(speaker.available('en')).toBe(false);
  });
});

describe('voice modes', () => {
  it('auto-speaks and shows speaker buttons for audio and both', () => {
    expect([shouldAutoSpeak('audio'), shouldAutoSpeak('both'), shouldAutoSpeak('text')]).toEqual([true, true, false]);
    expect([showSpeakerButtons('audio'), showSpeakerButtons('both'), showSpeakerButtons('text')]).toEqual([true, true, false]);
  });
});
