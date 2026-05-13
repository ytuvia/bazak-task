import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStore: Record<string, string> = {};

vi.mock('@/lib/store', () => ({
  getPreferences: vi.fn(() => ({ ...mockStore })),
  clearPreferences: vi.fn(() => { Object.keys(mockStore).forEach(k => delete mockStore[k]); }),
  deletePreference: vi.fn((key: string) => { delete mockStore[key]; }),
}));

import { GET, DELETE } from './route';
import { DELETE as DELETEKey } from './[key]/route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  Object.keys(mockStore).forEach(k => delete mockStore[k]);
  mockStore['budget'] = 'under $100';
  mockStore['brand'] = 'Nike';
});

describe('GET /api/preferences', () => {
  it('returns current preferences', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ budget: 'under $100', brand: 'Nike' });
  });
});

describe('DELETE /api/preferences', () => {
  it('clears all preferences', async () => {
    await DELETE();
    const res = await GET();
    expect(await res.json()).toEqual({});
  });
});

describe('DELETE /api/preferences/[key]', () => {
  it('removes a single key', async () => {
    await DELETEKey(
      new NextRequest('http://localhost/api/preferences/budget', { method: 'DELETE' }),
      { params: Promise.resolve({ key: 'budget' }) }
    );
    const res = await GET();
    const body = await res.json();
    expect(body).not.toHaveProperty('budget');
    expect(body.brand).toBe('Nike');
  });

  it('returns 404 for unknown key', async () => {
    const res = await DELETEKey(
      new NextRequest('http://localhost/api/preferences/unknown', { method: 'DELETE' }),
      { params: Promise.resolve({ key: 'unknown' }) }
    );
    expect(res.status).toBe(404);
  });
});
