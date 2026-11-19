import { describe, expect, it } from 'vitest';
import {
  ChangePinBodySchema,
  LoginBodySchema,
  PinSchema,
  SetupBodySchema,
  SettingsPatchSchema,
  TaskInputSchema,
  TaskPatchSchema,
  datesInOrder,
  fieldErrors,
} from '../src/index.js';

const minimalTask = { subject: 'science', title: 'Traer una hoja del jardín' } as const;

describe('PinSchema', () => {
  it.each(['1234', '123456', '0000', '000000'])('accepts %s', (pin) => {
    expect(PinSchema.safeParse(pin).success).toBe(true);
  });
  it.each(['123', '1234567', '12a4', '', ' 1234', '1234 ', '12 34', '１２３４', '12.4'])('rejects %j', (pin) => {
    expect(PinSchema.safeParse(pin).success).toBe(false);
  });
  it('rejects values that are not text', () => {
    expect(PinSchema.safeParse(1234).success).toBe(false);
    expect(PinSchema.safeParse(null).success).toBe(false);
    expect(PinSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('datesInOrder', () => {
  it('is true when either date is missing or the due date is not earlier', () => {
    expect(datesInOrder(null, null)).toBe(true);
    expect(datesInOrder('2026-11-18', null)).toBe(true);
    expect(datesInOrder(null, '2026-11-18')).toBe(true);
    expect(datesInOrder('2026-11-18', '2026-11-18')).toBe(true);
    expect(datesInOrder('2026-11-18', '2026-11-19')).toBe(true);
  });
  it('is false when the due date is before the assigned day', () => {
    expect(datesInOrder('2026-11-19', '2026-11-18')).toBe(false);
  });
});

describe('TaskInputSchema', () => {
  it('accepts a minimal task and applies the defaults', () => {
    const t = TaskInputSchema.parse(minimalTask);
    expect(t).toMatchObject({ description: '', assignedDate: null, dueDate: null });
  });
  it('accepts a full task', () => {
    const t = TaskInputSchema.parse({ ...minimalTask, titleEn: 'Bring a leaf', description: 'Del jardín', assignedDate: '2026-11-19', dueDate: '2026-11-20' });
    expect(t.titleEn).toBe('Bring a leaf');
  });
  it('trims the title', () => {
    expect(TaskInputSchema.parse({ ...minimalTask, title: '  Hoja  ' }).title).toBe('Hoja');
  });
  it('accepts a title of exactly 200 characters and rejects 201', () => {
    expect(TaskInputSchema.safeParse({ ...minimalTask, title: 'a'.repeat(200) }).success).toBe(true);
    expect(TaskInputSchema.safeParse({ ...minimalTask, title: 'a'.repeat(201) }).success).toBe(false);
  });
  it('rejects an empty title or one made of spaces', () => {
    expect(TaskInputSchema.safeParse({ ...minimalTask, title: '' }).success).toBe(false);
    expect(TaskInputSchema.safeParse({ ...minimalTask, title: '   ' }).success).toBe(false);
  });
  it('rejects a missing or unknown subject', () => {
    expect(TaskInputSchema.safeParse({ title: 'x' }).success).toBe(false);
    expect(TaskInputSchema.safeParse({ ...minimalTask, subject: 'chemistry' }).success).toBe(false);
  });
  it('rejects impossible dates', () => {
    expect(TaskInputSchema.safeParse({ ...minimalTask, assignedDate: '2026-02-30' }).success).toBe(false);
    expect(TaskInputSchema.safeParse({ ...minimalTask, dueDate: '2026-13-01' }).success).toBe(false);
    expect(TaskInputSchema.safeParse({ ...minimalTask, dueDate: '19/11/2026' }).success).toBe(false);
  });
  it('rejects a due date before the assigned day, with the error on dueDate', () => {
    const r = TaskInputSchema.safeParse({ ...minimalTask, assignedDate: '2026-11-19', dueDate: '2026-11-18' });
    expect(r.success).toBe(false);
    expect(fieldErrors(r.error!)).toEqual({ dueDate: 'La entrega no puede ser antes del día asignado' });
  });
  it('accepts a due date equal to the assigned day', () => {
    expect(TaskInputSchema.safeParse({ ...minimalTask, assignedDate: '2026-11-19', dueDate: '2026-11-19' }).success).toBe(true);
  });
  it('accepts an empty English title', () => {
    expect(TaskInputSchema.safeParse({ ...minimalTask, titleEn: '' }).success).toBe(true);
  });
  it('rejects a description longer than 2000', () => {
    expect(TaskInputSchema.safeParse({ ...minimalTask, description: 'a'.repeat(2001) }).success).toBe(false);
  });
  it('keeps odd text as it is', () => {
    const title = '<script>alert(1)</script> "comillas" y 🌱 ñandú';
    expect(TaskInputSchema.parse({ ...minimalTask, title }).title).toBe(title);
  });
});

describe('TaskPatchSchema', () => {
  it('accepts an empty patch and partial patches without inventing defaults', () => {
    expect(TaskPatchSchema.parse({})).toEqual({});
    expect(TaskPatchSchema.parse({ hidden: true })).toEqual({ hidden: true });
    expect(TaskPatchSchema.parse({ status: 'done' })).toEqual({ status: 'done' });
  });
  it('accepts explicit null dates (to clear them)', () => {
    expect(TaskPatchSchema.parse({ dueDate: null })).toEqual({ dueDate: null });
  });
  it('rejects a wrong status or a wrong type', () => {
    expect(TaskPatchSchema.safeParse({ status: 'hecho' }).success).toBe(false);
    expect(TaskPatchSchema.safeParse({ hidden: 'sí' }).success).toBe(false);
    expect(TaskPatchSchema.safeParse({ title: '' }).success).toBe(false);
  });
});

describe('SettingsPatchSchema', () => {
  it('accepts partial changes', () => {
    expect(SettingsPatchSchema.parse({ lang: 'en' })).toEqual({ lang: 'en' });
    expect(SettingsPatchSchema.parse({})).toEqual({});
  });
  it('rejects the timezone and unknown keys', () => {
    expect(SettingsPatchSchema.safeParse({ tz: 'America/Bogota' }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ colorFavorito: 'azul' }).success).toBe(false);
  });
  it('rejects out of range values', () => {
    expect(SettingsPatchSchema.safeParse({ speechRate: 2 }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ grade: 9 }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ childName: '' }).success).toBe(false);
  });
});

describe('body schemas', () => {
  const setup = { pin: '1234', childName: 'Lucca', grade: 2, lang: 'es', theme: 'dark' } as const;
  it('SetupBodySchema accepts a complete body', () => {
    expect(SetupBodySchema.safeParse(setup).success).toBe(true);
  });
  it('SetupBodySchema rejects a short PIN, and says which field', () => {
    const r = SetupBodySchema.safeParse({ ...setup, pin: '123' });
    expect(fieldErrors(r.error!)).toEqual({ pin: 'El PIN debe tener de 4 a 6 dígitos' });
  });
  it('SetupBodySchema reports every wrong field at once', () => {
    const r = SetupBodySchema.safeParse({ ...setup, pin: 'x', childName: '', grade: 9 });
    expect(Object.keys(fieldErrors(r.error!)).sort()).toEqual(['childName', 'grade', 'pin']);
  });
  it('LoginBodySchema needs a pin string', () => {
    expect(LoginBodySchema.safeParse({ pin: '12' }).success).toBe(true);
    expect(LoginBodySchema.safeParse({}).success).toBe(false);
    expect(LoginBodySchema.safeParse({ pin: 1234 }).success).toBe(false);
  });
  it('ChangePinBodySchema validates only the new PIN format', () => {
    expect(ChangePinBodySchema.safeParse({ currentPin: 'lo que sea', newPin: '4321' }).success).toBe(true);
    expect(ChangePinBodySchema.safeParse({ currentPin: '1234', newPin: '12' }).success).toBe(false);
  });
});
