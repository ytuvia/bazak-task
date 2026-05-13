import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { fetchDummyJSON, fetchCategories } from './dummyjson';
import { setPreference } from './store';
import type { ToolResult } from '@/types';

const limit = (): number =>
  parseInt(process.env.TOOL_RESULTS_LIMIT ?? '10', 10);

async function safeResult(fn: () => Promise<ToolResult>): Promise<string> {
  try {
    return JSON.stringify(await fn());
  } catch {
    return JSON.stringify({
      products: [],
      total: 0,
      error: 'Could not reach product catalog',
    });
  }
}

export const searchProductsTool = tool(
  async ({ query }) =>
    safeResult(() =>
      fetchDummyJSON(
        `/products/search?q=${encodeURIComponent(query)}&limit=${limit()}`
      )
    ),
  {
    name: 'search_products',
    description:
      'Search for products by name or specific attributes. Use when the user describes a product name or attributes (e.g. "wireless headphones", "blue sneakers").',
    schema: z.object({ query: z.string().describe('Search terms') }),
  }
);

export const browseCategoryTool = tool(
  async ({ slug }) =>
    safeResult(() =>
      fetchDummyJSON(
        `/products/category/${encodeURIComponent(slug)}?limit=${limit()}&sortBy=rating&order=desc`
      )
    ),
  {
    name: 'browse_category',
    description:
      'Browse products in a category by slug. Use when the user expresses general interest in a product type (e.g. "show me beauty products").',
    schema: z.object({
      slug: z.string().describe('Category slug, e.g. "smartphones", "beauty"'),
    }),
  }
);

export const listCategoriesTool = tool(
  async () => {
    try {
      const categories = await fetchCategories();
      return JSON.stringify({ categories, products: [], total: 0 });
    } catch {
      return JSON.stringify({
        categories: [],
        products: [],
        total: 0,
        error: 'Could not reach product catalog',
      });
    }
  },
  {
    name: 'list_categories',
    description:
      "List all available product categories. Use when the user asks what's available or what categories exist.",
    schema: z.object({}),
  }
);

export const getProductTool = tool(
  async ({ id }) =>
    safeResult(() => fetchDummyJSON(`/products/${id}`)),
  {
    name: 'get_product',
    description:
      'Get details for a specific product by ID. Use when the user asks for more details about a product mentioned in the conversation.',
    schema: z.object({ id: z.number().describe('Product ID') }),
  }
);

export const savePreferenceTool = tool(
  async ({ key, value }) => {
    setPreference(key, value);
    return JSON.stringify({ saved: true, key, value });
  },
  {
    name: 'save_preference',
    description:
      'Save a stable user preference inferred from the conversation. Use when the user reveals a clear preference like budget range, brand, or category interest.',
    schema: z.object({
      key: z.string().describe('Short label, e.g. "budget", "brand", "category"'),
      value: z.string().describe('Preference value, e.g. "under $100", "Nike"'),
    }),
  }
);

export const requestClarificationTool = tool(
  async () => JSON.stringify({ ok: true }),
  {
    name: 'request_clarification',
    description:
      "Signal that the user's request is too vague to retrieve relevant products. Use when no product type, category, or meaningful attribute is mentioned. Provide a short clarifying question.",
    schema: z.object({
      question: z.string().describe('A short clarifying question to ask the user'),
    }),
  }
);

export const PRODUCT_TOOLS = [
  searchProductsTool,
  browseCategoryTool,
  listCategoriesTool,
  getProductTool,
];

export const ALL_TOOLS = [...PRODUCT_TOOLS, savePreferenceTool];

// Bound to the model but NOT processed by ToolNode — intercepted in agentNode via interrupt()
export const AGENT_TOOLS = [...ALL_TOOLS, requestClarificationTool];
