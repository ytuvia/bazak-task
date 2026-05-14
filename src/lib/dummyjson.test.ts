import { describe, it, expect } from 'vitest';
import { stripHeavyFields, fetchDummyJSON, fetchCategories } from './dummyjson';

const fullProduct = {
  id: 1, title: 'Test', description: 'Desc', category: 'phones', price: 100,
  discountPercentage: 5, rating: 4.5, stock: 10, brand: 'Brand', tags: [],
  thumbnail: 'url', images: ['url'], availabilityStatus: 'In Stock',
  dimensions: { width: 10, height: 20, depth: 5 },
  warrantyInformation: '1 year',
  sku: 'SKU-001',
  weight: 0.5,
};

describe('stripHeavyFields', () => {
  it('removes dimensions, warrantyInformation, sku, weight', () => {
    const result = stripHeavyFields(fullProduct as Record<string, unknown>);
    expect(result).not.toHaveProperty('dimensions');
    expect(result).not.toHaveProperty('warrantyInformation');
    expect(result).not.toHaveProperty('sku');
    expect(result).not.toHaveProperty('weight');
  });
  it('preserves essential fields', () => {
    const result = stripHeavyFields(fullProduct as Record<string, unknown>);
    expect(result.id).toBe(1);
    expect(result.title).toBe('Test');
    expect(result.price).toBe(100);
    expect(result.rating).toBe(4.5);
    expect(result.thumbnail).toBe('url');
    expect(result.availabilityStatus).toBe('In Stock');
  });
});

describe('fetchDummyJSON', () => {
  it('returns stripped products from search endpoint', async () => {
    const result = await fetchDummyJSON('/products/search?q=phone&limit=10');
    expect(result.products).toHaveLength(2);
    expect(result.products[0]).not.toHaveProperty('sku');
    expect(result.total).toBe(2);
  });
  it('returns single product from id endpoint', async () => {
    const result = await fetchDummyJSON('/products/1');
    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe(1);
  });
});

describe('fetchCategories', () => {
  it('returns category list', async () => {
    const cats = await fetchCategories();
    expect(cats).toHaveLength(2);
    expect(cats[0]).toHaveProperty('slug');
    expect(cats[0]).toHaveProperty('name');
  });
});
