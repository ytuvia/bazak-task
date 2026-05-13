import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./store', () => ({
  setPreference: vi.fn(),
  getPreferences: vi.fn().mockReturnValue({}),
}));

import {
  searchProductsTool,
  browseCategoryTool,
  listCategoriesTool,
  getProductTool,
  savePreferenceTool,
  PRODUCT_TOOLS,
  ALL_TOOLS,
} from './tools';

describe('searchProductsTool', () => {
  it('calls /products/search with query param', async () => {
    const result = JSON.parse(await searchProductsTool.invoke({ query: 'phone' }));
    expect(result.products).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('returns error shape on fetch failure', async () => {
    const { server } = await import('../test/mocks/server');
    const { http, HttpResponse } = await import('msw');
    server.use(
      http.get('https://dummyjson.com/products/search', () =>
        HttpResponse.json({ message: 'error' }, { status: 500 })
      )
    );
    const result = JSON.parse(await searchProductsTool.invoke({ query: 'fail' }));
    expect(result.products).toEqual([]);
    expect(result.error).toBeDefined();
  });
});

describe('browseCategoryTool', () => {
  it('calls /products/category/:slug with rating sort', async () => {
    const result = JSON.parse(await browseCategoryTool.invoke({ slug: 'smartphones' }));
    expect(result.products).toHaveLength(2);
  });
});

describe('listCategoriesTool', () => {
  it('returns categories array', async () => {
    const result = JSON.parse(await listCategoriesTool.invoke({}));
    expect(result.categories).toHaveLength(2);
    expect(result.categories[0]).toHaveProperty('slug');
  });
});

describe('getProductTool', () => {
  it('calls /products/:id', async () => {
    const result = JSON.parse(await getProductTool.invoke({ id: 1 }));
    expect(result.products[0].id).toBe(1);
  });

  it('returns error shape for missing product', async () => {
    const result = JSON.parse(await getProductTool.invoke({ id: 9999 }));
    expect(result.products).toEqual([]);
  });
});

describe('savePreferenceTool', () => {
  it('calls setPreference and returns saved confirmation', async () => {
    const { setPreference } = await import('./store');
    const result = JSON.parse(await savePreferenceTool.invoke({ key: 'brand', value: 'Nike' }));
    expect(result.saved).toBe(true);
    expect(setPreference).toHaveBeenCalledWith('brand', 'Nike');
  });
});

describe('tool exports', () => {
  it('PRODUCT_TOOLS has 4 entries', () => expect(PRODUCT_TOOLS).toHaveLength(4));
  it('ALL_TOOLS has 5 entries', () => expect(ALL_TOOLS).toHaveLength(5));
});
