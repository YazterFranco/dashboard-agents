import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, parentApi, withExpiry, type ParentApi } from './api';

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (body === undefined) throw new SyntaxError('no body');
    return body;
  },
});

describe('parentApi requests', () => {
  it('reads the status with a plain GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { setupDone: true }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await parentApi.status()).toEqual({ setupDone: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/parent/status', expect.objectContaining({ method: 'GET', credentials: 'same-origin' }));
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('sends JSON with its content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await parentApi.login('482913');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/parent/login');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ pin: '482913' });
  });

  it('a delete sends neither a body nor a content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { result: 'removed' }));
    vi.stubGlobal('fetch', fetchMock);
    await parentApi.deleteTask('manual-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/parent/tasks/manual-1');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('encodes the task id in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await parentApi.patchTask('a/b c', { hidden: true });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/parent/tasks/a%2Fb%20c');
  });

  it('asks for the weeks of progress in the query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { weeks: [], needsHelp: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await parentApi.progress(4);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/parent/progress?weeks=4');
  });

  it('returns nothing for a 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(204)));
    expect(await parentApi.logout()).toBeUndefined();
  });
});

describe('ApiError', () => {
  it('carries the status, the fields, the attempts left and the lock time from the answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401, { error: 'PIN incorrecto', attemptsLeft: 3 })));
    const err = await parentApi.login('000000').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'PIN incorrecto', status: 401, attemptsLeft: 3 });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(423, { error: 'Demasiados intentos', retryAfterSeconds: 300 })));
    expect(await parentApi.login('000000').catch((e) => e)).toMatchObject({ status: 423, retryAfterSeconds: 300 });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(400, { error: 'Datos inválidos', fields: { pin: 'Muy corto' } })));
    expect(await parentApi.setup({ pin: '1', childName: 'L', grade: 2, lang: 'es', theme: 'dark' }).catch((e) => e)).toMatchObject({
      status: 400,
      fields: { pin: 'Muy corto' },
    });
  });

  it('survives an error answer that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(502)));
    const err = await parentApi.overview().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.fields).toEqual({});
  });

  it('lets a network failure through as it is, so the screen can tell it apart', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await parentApi.status().catch((e) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(ApiError);
  });
});

describe('withExpiry', () => {
  const fake = (overview: () => Promise<unknown>): ParentApi => ({ ...parentApi, overview: overview as ParentApi['overview'] });

  it('calls the callback when a protected request answers 401, and still throws', async () => {
    const onExpired = vi.fn();
    const api = withExpiry(fake(() => Promise.reject(new ApiError('Hace falta el PIN', 401))), onExpired);
    await expect(api.overview()).rejects.toMatchObject({ status: 401 });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('ignores other errors and successes', async () => {
    const onExpired = vi.fn();
    await expect(withExpiry(fake(() => Promise.reject(new ApiError('boom', 500))), onExpired).overview()).rejects.toMatchObject({ status: 500 });
    await expect(withExpiry(fake(() => Promise.reject(new TypeError('red'))), onExpired).overview()).rejects.toBeInstanceOf(TypeError);
    await expect(withExpiry(fake(() => Promise.resolve({ tasks: [] })), onExpired).overview()).resolves.toEqual({ tasks: [] });
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('does not treat a wrong PIN at login as an expired session', async () => {
    const onExpired = vi.fn();
    const api = withExpiry({ ...parentApi, login: () => Promise.reject(new ApiError('PIN incorrecto', 401)) } as ParentApi, onExpired);
    await expect(api.login('1')).rejects.toBeInstanceOf(ApiError);
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe('withExpiry and the PIN change', () => {
  it('a wrong current PIN (401 with attempts left) is not an expired session', async () => {
    const onExpired = vi.fn();
    const api = withExpiry({ ...parentApi, changePin: () => Promise.reject(new ApiError('PIN actual incorrecto', 401, {}, { attemptsLeft: 4 })) } as ParentApi, onExpired);
    await expect(api.changePin('1', '2')).rejects.toMatchObject({ attemptsLeft: 4 });
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('closing the session never counts as an expiry', async () => {
    const onExpired = vi.fn();
    const api = withExpiry({ ...parentApi, logout: () => Promise.reject(new ApiError('Hace falta el PIN', 401)) } as ParentApi, onExpired);
    await expect(api.logout()).rejects.toBeInstanceOf(ApiError);
    expect(onExpired).not.toHaveBeenCalled();
  });
});
