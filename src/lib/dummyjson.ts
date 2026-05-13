import type { Product, ToolResult } from '@/types';

const BASE_URL = 'https://dummyjson.com';
const HEAVY_FIELDS = new Set(['dimensions', 'warrantyInformation', 'sku', 'weight']);

export function stripHeavyFields(product: Record<string, unknown>): Product {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(product)) {
    if (!HEAVY_FIELDS.has(k)) result[k] = v;
  }
  return result as unknown as Product;
}

export async function fetchDummyJSON(path: string): Promise<ToolResult> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`DummyJSON ${res.status}`);
  const data = await res.json();
  const raw: Record<string, unknown>[] = data.products ?? (data.id ? [data] : []);
  return { products: raw.map(stripHeavyFields), total: data.total ?? raw.length };
}

export async function fetchCategories(): Promise<Array<{ name: string; slug: string; url: string }>> {
  const res = await fetch(`${BASE_URL}/products/categories`);
  if (!res.ok) throw new Error(`DummyJSON ${res.status}`);
  return res.json();
}
