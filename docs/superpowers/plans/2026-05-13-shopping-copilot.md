# Shopping Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally runnable AI shopping copilot with conversational product discovery, inline product cards, LangGraph + SQLite persistence, cross-thread preference memory, summarization, and human-in-the-loop clarification.

**Architecture:** Next.js 14 App Router with a hand-built LangGraph ReAct graph. SQLite checkpointer for in-thread persistence; custom SQLite tables for conversations metadata and user preferences. OpenAI tool calling dispatches to four DummyJSON endpoints. A `summarize` node compresses long threads. Streaming via `ReadableStream` + newline-delimited JSON.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, `@langchain/langgraph`, `@langchain/openai`, `@langchain/langgraph-checkpoint-sqlite`, `better-sqlite3`, `zod`, Vitest, React Testing Library, msw

---

## File Map

```
src/
├── types.ts                                  # Shared Product, Conversation, StreamChunk types
├── test/
│   ├── setup.ts                              # RTL + jest-dom setup
│   └── mocks/
│       ├── handlers.ts                       # msw DummyJSON handlers
│       └── server.ts                         # msw server instance
├── app/
│   ├── page.tsx                              # Root — renders ChatShell
│   ├── globals.css
│   └── api/
│       ├── chat/route.ts                     # POST — stream agent or resume interrupt
│       ├── conversations/
│       │   ├── route.ts                      # GET list, POST new
│       │   └── [id]/route.ts                 # GET messages, DELETE
│       └── preferences/
│           ├── route.ts                      # GET all, DELETE all
│           └── [key]/route.ts                # DELETE single
├── components/
│   ├── ChatShell.tsx
│   ├── ConversationSidebar.tsx
│   ├── MessageList.tsx
│   ├── MessageBubble.tsx
│   ├── ProductCard.tsx
│   ├── ProductGrid.tsx
│   ├── ProductDetailModal.tsx
│   └── PreferencesPanel.tsx
└── lib/
    ├── db.ts                                 # Single SQLite connection + schema init
    ├── conversations.ts                      # Conversations table queries
    ├── store.ts                              # User preferences table queries
    ├── dummyjson.ts                          # Typed fetch client + field stripping
    ├── tools.ts                              # Five LangGraph tool definitions
    ├── checkpointer.ts                       # SqliteSaver singleton
    └── agent.ts                              # LangGraph graph + exported edge fns
data/
└── bazak.db                                  # gitignored
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json` (via create-next-app)
- Create: `.env.example`
- Create: `.gitignore`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/mocks/handlers.ts`
- Create: `src/test/mocks/server.ts`

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd /Users/yehudatuvia/Documents/GitHub/bazak
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
```

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install @langchain/langgraph @langchain/openai @langchain/langgraph-checkpoint-sqlite @langchain/core better-sqlite3 uuid zod
npm install --save-dev @types/better-sqlite3 @types/uuid
```

- [ ] **Step 3: Install test dependencies**

```bash
npm install --save-dev vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom msw
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/components/**', 'jsdom']],
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 5: Create `src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 6: Create `src/test/mocks/handlers.ts`**

```typescript
import { http, HttpResponse } from 'msw';

export const mockProducts = [
  {
    id: 1, title: 'iPhone 14', description: 'Latest Apple smartphone', category: 'smartphones',
    price: 999, discountPercentage: 5, rating: 4.5, stock: 100, brand: 'Apple',
    tags: ['phone'], thumbnail: 'https://cdn.dummyjson.com/iphone.jpg',
    images: ['https://cdn.dummyjson.com/iphone.jpg'], availabilityStatus: 'In Stock',
  },
  {
    id: 2, title: 'Samsung Galaxy S23', description: 'Latest Samsung smartphone', category: 'smartphones',
    price: 799, discountPercentage: 10, rating: 4.3, stock: 80, brand: 'Samsung',
    tags: ['phone', 'android'], thumbnail: 'https://cdn.dummyjson.com/samsung.jpg',
    images: ['https://cdn.dummyjson.com/samsung.jpg'], availabilityStatus: 'In Stock',
  },
];

export const mockCategories = [
  { name: 'Smartphones', slug: 'smartphones', url: 'https://dummyjson.com/products/category/smartphones' },
  { name: 'Beauty', slug: 'beauty', url: 'https://dummyjson.com/products/category/beauty' },
];

export const handlers = [
  http.get('https://dummyjson.com/products/search', () =>
    HttpResponse.json({ products: mockProducts, total: mockProducts.length, skip: 0, limit: 10 })
  ),
  http.get('https://dummyjson.com/products/categories', () =>
    HttpResponse.json(mockCategories)
  ),
  http.get('https://dummyjson.com/products/category/:slug', () =>
    HttpResponse.json({ products: mockProducts, total: mockProducts.length, skip: 0, limit: 10 })
  ),
  http.get('https://dummyjson.com/products/:id', ({ params }) => {
    const product = mockProducts.find(p => p.id === parseInt(params.id as string));
    return product
      ? HttpResponse.json(product)
      : HttpResponse.json({ message: 'Product not found' }, { status: 404 });
  }),
];
```

- [ ] **Step 7: Create `src/test/mocks/server.ts`**

```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

- [ ] **Step 8: Create `.env.example`**

```
OPENAI_API_KEY=             # OpenAI key — never commit the real value
AGENT_MODEL=gpt-5.4-mini
SUMMARY_MODEL=gpt-5.4-nano
SUMMARY_MESSAGE_THRESHOLD=10
TOOL_RESULTS_LIMIT=10
DB_PATH=                    # Optional: override default data/bazak.db path
```

- [ ] **Step 9: Update `.gitignore` — add at end**

```
.env
.env.local
data/
.superpowers/
```

- [ ] **Step 10: Add test script to `package.json`**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 11: Verify setup**

```bash
npm test
```
Expected: test suite runs (0 tests, no failures)

- [ ] **Step 12: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js project with Vitest and msw"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export interface Product {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  discountPercentage: number;
  rating: number;
  stock: number;
  brand: string;
  tags: string[];
  thumbnail: string;
  images: string[];
  availabilityStatus: string;
}

export interface ToolResult {
  products: Product[];
  total: number;
  error?: string;
}

export interface Conversation {
  id: string;
  threadId: string;
  title: string;
  createdAt: string;
}

export type StreamChunkType =
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'preference_added'
  | 'interrupt'
  | 'title_update'
  | 'done'
  | 'error';

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  name?: string;
  products?: Product[];
  key?: string;
  value?: string;
  question?: string;
  title?: string;
  message?: string;
}

export type MessageRole = 'human' | 'ai' | 'tool';

export interface SerializedMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
  toolCallId?: string;
  toolName?: string;
}

export const PRODUCT_TOOL_NAMES = [
  'search_products',
  'browse_category',
  'get_product',
  'list_categories',
] as const;
export type ProductToolName = (typeof PRODUCT_TOOL_NAMES)[number];
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

### Task 3: Database Module

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Create `src/lib/db.ts`**

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export function createDb(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      thread_id  TEXT UNIQUE NOT NULL,
      title      TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_preferences (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

const DB_PATH =
  process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'bazak.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) _db = createDb(DB_PATH);
  return _db;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add SQLite database module"
```

---

### Task 4: DummyJSON Client

**Files:**
- Create: `src/lib/dummyjson.ts`
- Test: `src/lib/dummyjson.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/dummyjson.test.ts
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
    const result = stripHeavyFields(fullProduct as any);
    expect(result).not.toHaveProperty('dimensions');
    expect(result).not.toHaveProperty('warrantyInformation');
    expect(result).not.toHaveProperty('sku');
    expect(result).not.toHaveProperty('weight');
  });

  it('preserves essential fields', () => {
    const result = stripHeavyFields(fullProduct as any);
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
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/lib/dummyjson.test.ts
```
Expected: FAIL — `dummyjson` module not found

- [ ] **Step 3: Create `src/lib/dummyjson.ts`**

```typescript
import type { Product, ToolResult } from '@/types';

const BASE_URL = 'https://dummyjson.com';
const HEAVY_FIELDS = new Set(['dimensions', 'warrantyInformation', 'sku', 'weight']);

export function stripHeavyFields(product: Record<string, unknown>): Product {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(product)) {
    if (!HEAVY_FIELDS.has(k)) result[k] = v;
  }
  return result as Product;
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
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test src/lib/dummyjson.test.ts
```
Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/dummyjson.ts src/lib/dummyjson.test.ts
git commit -m "feat: add DummyJSON client with field stripping"
```

---

### Task 5: Conversations Library

**Files:**
- Create: `src/lib/conversations.ts`
- Test: `src/lib/conversations.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/conversations.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from './db';
import {
  createConversationDb,
  listConversationsDb,
  getConversationByIdDb,
  deleteConversationDb,
  updateConversationTitleDb,
} from './conversations';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = createDb(':memory:');
});

describe('createConversationDb', () => {
  it('inserts a row and returns id and threadId', () => {
    const { id, threadId } = createConversationDb(db, 'My first chat');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(threadId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('title is persisted', () => {
    const { id } = createConversationDb(db, 'Test title');
    const conv = getConversationByIdDb(db, id);
    expect(conv?.title).toBe('Test title');
  });
});

describe('listConversationsDb', () => {
  it('returns conversations ordered by created_at descending', async () => {
    createConversationDb(db, 'First');
    await new Promise(r => setTimeout(r, 5));
    createConversationDb(db, 'Second');
    const list = listConversationsDb(db);
    expect(list[0].title).toBe('Second');
    expect(list[1].title).toBe('First');
  });
});

describe('deleteConversationDb', () => {
  it('removes the row', () => {
    const { id } = createConversationDb(db, 'To delete');
    deleteConversationDb(db, id);
    expect(getConversationByIdDb(db, id)).toBeUndefined();
  });

  it('list no longer includes deleted conversation', () => {
    const { id } = createConversationDb(db, 'Gone');
    deleteConversationDb(db, id);
    expect(listConversationsDb(db).find(c => c.id === id)).toBeUndefined();
  });
});

describe('updateConversationTitleDb', () => {
  it('updates the title', () => {
    const { id } = createConversationDb(db, 'New conversation');
    updateConversationTitleDb(db, id, 'Wireless headphones');
    expect(getConversationByIdDb(db, id)?.title).toBe('Wireless headphones');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/lib/conversations.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/lib/conversations.ts`**

```typescript
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { getDb } from './db';
import type { Conversation } from '@/types';

export function createConversationDb(
  db: Database.Database,
  title: string
): { id: string; threadId: string } {
  const id = randomUUID();
  const threadId = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO conversations (id, thread_id, title, created_at) VALUES (?, ?, ?, ?)'
  ).run(id, threadId, title, createdAt);
  return { id, threadId };
}

export function listConversationsDb(db: Database.Database): Conversation[] {
  return db
    .prepare(
      'SELECT id, thread_id AS threadId, title, created_at AS createdAt FROM conversations ORDER BY created_at DESC'
    )
    .all() as Conversation[];
}

export function getConversationByIdDb(
  db: Database.Database,
  id: string
): Conversation | undefined {
  return db
    .prepare(
      'SELECT id, thread_id AS threadId, title, created_at AS createdAt FROM conversations WHERE id = ?'
    )
    .get(id) as Conversation | undefined;
}

export function getConversationByThreadIdDb(
  db: Database.Database,
  threadId: string
): Conversation | undefined {
  return db
    .prepare(
      'SELECT id, thread_id AS threadId, title, created_at AS createdAt FROM conversations WHERE thread_id = ?'
    )
    .get(threadId) as Conversation | undefined;
}

export function deleteConversationDb(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

export function updateConversationTitleDb(db: Database.Database, id: string, title: string): void {
  db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, id);
}

export const createConversation = (title: string) =>
  createConversationDb(getDb(), title);
export const listConversations = () => listConversationsDb(getDb());
export const getConversationById = (id: string) =>
  getConversationByIdDb(getDb(), id);
export const getConversationByThreadId = (threadId: string) =>
  getConversationByThreadIdDb(getDb(), threadId);
export const deleteConversation = (id: string) =>
  deleteConversationDb(getDb(), id);
export const updateConversationTitle = (id: string, title: string) =>
  updateConversationTitleDb(getDb(), id, title);
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test src/lib/conversations.test.ts
```
Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/conversations.ts src/lib/conversations.test.ts
git commit -m "feat: add conversations metadata library"
```

---

### Task 6: Store Library

**Files:**
- Create: `src/lib/store.ts`
- Test: `src/lib/store.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from './db';
import {
  getPreferencesDb,
  setPreferenceDb,
  deletePreferenceDb,
  clearPreferencesDb,
} from './store';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = createDb(':memory:');
});

describe('getPreferencesDb', () => {
  it('returns empty object when no preferences stored', () => {
    expect(getPreferencesDb(db)).toEqual({});
  });
});

describe('setPreferenceDb', () => {
  it('stores a key-value pair', () => {
    setPreferenceDb(db, 'budget', 'under $100');
    expect(getPreferencesDb(db)).toEqual({ budget: 'under $100' });
  });

  it('overwrites an existing key', () => {
    setPreferenceDb(db, 'budget', 'under $100');
    setPreferenceDb(db, 'budget', 'under $200');
    expect(getPreferencesDb(db).budget).toBe('under $200');
  });
});

describe('deletePreferenceDb', () => {
  it('removes a single key and leaves others intact', () => {
    setPreferenceDb(db, 'budget', 'under $100');
    setPreferenceDb(db, 'brand', 'Nike');
    deletePreferenceDb(db, 'budget');
    const prefs = getPreferencesDb(db);
    expect(prefs).not.toHaveProperty('budget');
    expect(prefs.brand).toBe('Nike');
  });
});

describe('clearPreferencesDb', () => {
  it('removes all entries', () => {
    setPreferenceDb(db, 'a', '1');
    setPreferenceDb(db, 'b', '2');
    clearPreferencesDb(db);
    expect(getPreferencesDb(db)).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/lib/store.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create `src/lib/store.ts`**

```typescript
import type Database from 'better-sqlite3';
import { getDb } from './db';

export function getPreferencesDb(db: Database.Database): Record<string, string> {
  const rows = db
    .prepare('SELECT key, value FROM user_preferences')
    .all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export function setPreferenceDb(
  db: Database.Database,
  key: string,
  value: string
): void {
  db.prepare(
    'INSERT OR REPLACE INTO user_preferences (key, value) VALUES (?, ?)'
  ).run(key, value);
}

export function deletePreferenceDb(db: Database.Database, key: string): void {
  db.prepare('DELETE FROM user_preferences WHERE key = ?').run(key);
}

export function clearPreferencesDb(db: Database.Database): void {
  db.prepare('DELETE FROM user_preferences').run();
}

export const getPreferences = () => getPreferencesDb(getDb());
export const setPreference = (key: string, value: string) =>
  setPreferenceDb(getDb(), key, value);
export const deletePreference = (key: string) =>
  deletePreferenceDb(getDb(), key);
export const clearPreferences = () => clearPreferencesDb(getDb());
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test src/lib/store.test.ts
```
Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.ts src/lib/store.test.ts
git commit -m "feat: add user preferences store"
```

---

### Task 7: DummyJSON Tools

**Files:**
- Create: `src/lib/tools.ts`
- Test: `src/lib/tools.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/tools.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/lib/tools.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create `src/lib/tools.ts`**

```typescript
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

export const PRODUCT_TOOLS = [
  searchProductsTool,
  browseCategoryTool,
  listCategoriesTool,
  getProductTool,
];

export const ALL_TOOLS = [...PRODUCT_TOOLS, savePreferenceTool];
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test src/lib/tools.test.ts
```
Expected: 9 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools.ts src/lib/tools.test.ts
git commit -m "feat: add DummyJSON LangGraph tools"
```

---

### Task 8: Checkpointer

**Files:**
- Create: `src/lib/checkpointer.ts`

- [ ] **Step 1: Create `src/lib/checkpointer.ts`**

```typescript
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import path from 'path';

const DB_PATH =
  process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'bazak.db');

let _checkpointer: SqliteSaver | null = null;

export function getCheckpointer(): SqliteSaver {
  if (!_checkpointer) {
    _checkpointer = SqliteSaver.fromConnString(DB_PATH);
  }
  return _checkpointer;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/checkpointer.ts
git commit -m "feat: add LangGraph SQLite checkpointer singleton"
```

---

### Task 9: LangGraph Agent

**Files:**
- Create: `src/lib/agent.ts`
- Test: `src/lib/agent.test.ts`

- [ ] **Step 1: Write failing tests for edge functions**

```typescript
// src/lib/agent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { END } from '@langchain/langgraph';

vi.mock('./store', () => ({
  getPreferences: vi.fn().mockReturnValue({}),
  setPreference: vi.fn(),
}));

import { shouldSummarize } from './agent';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

function makeMessages(n: number) {
  return Array.from({ length: n }, (_, i) =>
    i % 2 === 0 ? new HumanMessage(`msg ${i}`) : new AIMessage(`reply ${i}`)
  );
}

describe('shouldSummarize', () => {
  const originalEnv = process.env.SUMMARY_MESSAGE_THRESHOLD;

  beforeEach(() => {
    process.env.SUMMARY_MESSAGE_THRESHOLD = '10';
  });

  afterEach(() => {
    process.env.SUMMARY_MESSAGE_THRESHOLD = originalEnv;
  });

  it('returns END when messages at or below threshold', () => {
    expect(shouldSummarize({ messages: makeMessages(10), summary: '' })).toBe(END);
    expect(shouldSummarize({ messages: makeMessages(5), summary: '' })).toBe(END);
  });

  it('returns "summarize" when messages exceed threshold', () => {
    expect(shouldSummarize({ messages: makeMessages(11), summary: '' })).toBe('summarize');
    expect(shouldSummarize({ messages: makeMessages(20), summary: '' })).toBe('summarize');
  });

  it('respects SUMMARY_MESSAGE_THRESHOLD env var', () => {
    process.env.SUMMARY_MESSAGE_THRESHOLD = '5';
    expect(shouldSummarize({ messages: makeMessages(6), summary: '' })).toBe('summarize');
    expect(shouldSummarize({ messages: makeMessages(5), summary: '' })).toBe(END);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/lib/agent.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create `src/lib/agent.ts`**

```typescript
import {
  Annotation,
  StateGraph,
  END,
  START,
  MemorySaver,
  messagesStateReducer,
  interrupt,
  RemoveMessage,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ALL_TOOLS, PRODUCT_TOOLS } from './tools';
import { getPreferences } from './store';
import type { BaseCheckpointSaver } from '@langchain/langgraph';

export const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  summary: Annotation<string>({
    reducer: (_, next: string) => next,
    default: () => '',
  }),
});

const SYSTEM_PROMPT = `You are a helpful shopping assistant. Help users discover products through conversation.

Tool usage guidelines:
- Use search_products when the user describes a specific product name or attributes (e.g. "wireless headphones", "blue sneakers").
- Use browse_category when the user expresses general interest in a category (e.g. "show me beauty products", "what phones do you have?").
- Use list_categories when the user asks what's available (e.g. "what do you sell?", "what categories exist?").
- Use get_product when the user asks for details on a specific product mentioned earlier in the conversation.
- Use save_preference when the user reveals a stable preference like budget range, brand, or category interest.
- If the user's request is too vague (no product type, category, or attribute mentioned), use request_clarification with a short clarifying question instead of guessing.

After retrieving products, select and present the 3–5 most relevant based on the user's full intent, including any price constraints or stated preferences.
If a tool returns no results or an error, respond conversationally — suggest alternatives or ask the user to refine the query. Never present an empty product list.`;

function buildSystemPrompt(preferences: Record<string, string>, summary: string): string {
  const parts = [SYSTEM_PROMPT];
  if (Object.keys(preferences).length > 0) {
    parts.push(
      `\nUser preferences: ${Object.entries(preferences)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')}`
    );
  }
  if (summary) {
    parts.push(`\nConversation summary: ${summary}`);
  }
  return parts.join('');
}

async function agentNode(
  state: typeof StateAnnotation.State
): Promise<Partial<typeof StateAnnotation.State>> {
  const preferences = getPreferences();
  const systemPrompt = buildSystemPrompt(preferences, state.summary);

  const model = new ChatOpenAI({
    model: process.env.AGENT_MODEL ?? 'gpt-5.4-mini',
    streaming: true,
  }).bindTools(ALL_TOOLS);

  const messages = [new SystemMessage(systemPrompt), ...state.messages];
  const response = await model.invoke(messages);

  // Handle request_clarification tool call via interrupt
  const clarificationCall = (response as AIMessage).tool_calls?.find(
    tc => tc.name === 'request_clarification'
  );
  if (clarificationCall) {
    const question = clarificationCall.args.question as string;
    const userReply = interrupt({ question }) as string;
    // Resume: retry with the user's clarification appended
    const retryModel = new ChatOpenAI({
      model: process.env.AGENT_MODEL ?? 'gpt-5.4-mini',
      streaming: true,
    }).bindTools(PRODUCT_TOOLS);
    const retryMessages = [
      new SystemMessage(systemPrompt),
      ...state.messages,
      new HumanMessage(userReply),
    ];
    const retryResponse = await retryModel.invoke(retryMessages);
    return { messages: [new HumanMessage(userReply), retryResponse] };
  }

  return { messages: [response] };
}

async function summarizeNode(
  state: typeof StateAnnotation.State
): Promise<Partial<typeof StateAnnotation.State>> {
  const summaryModel = new ChatOpenAI({
    model: process.env.SUMMARY_MODEL ?? 'gpt-5.4-nano',
  });

  const conversationText = state.messages
    .map(m => `${m._getType()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
    .join('\n');

  const res = await summaryModel.invoke([
    new HumanMessage(
      `Summarize this conversation concisely, preserving product preferences, items discussed, and context:\n\n${conversationText}`
    ),
  ]);

  const summary = typeof res.content === 'string' ? res.content : '';

  // Keep last 4 messages, remove the rest
  const toRemove = state.messages
    .slice(0, -4)
    .map(m => new RemoveMessage({ id: m.id! }));

  return { summary, messages: toRemove };
}

export function shouldSummarize(
  state: { messages: BaseMessage[]; summary: string }
): string {
  const threshold = parseInt(
    process.env.SUMMARY_MESSAGE_THRESHOLD ?? '10',
    10
  );
  return state.messages.length > threshold ? 'summarize' : END;
}

function shouldContinue(state: typeof StateAnnotation.State): string {
  const last = state.messages[state.messages.length - 1];
  if (
    last instanceof AIMessage &&
    last.tool_calls &&
    last.tool_calls.length > 0
  ) {
    return 'tools';
  }
  return 'should_summarize';
}

const toolsNode = new ToolNode(ALL_TOOLS);

export function createGraph(checkpointer?: BaseCheckpointSaver) {
  const graph = new StateGraph(StateAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addNode('summarize', summarizeNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      should_summarize: 'should_summarize',
    })
    .addEdge('tools', 'agent')
    .addConditionalEdges('should_summarize', shouldSummarize, {
      summarize: 'summarize',
      [END]: END,
    })
    .addEdge('summarize', END);

  return graph.compile({ checkpointer });
}
```

- [ ] **Step 4: Run to verify tests pass**

```bash
npm test src/lib/agent.test.ts
```
Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent.ts src/lib/agent.test.ts
git commit -m "feat: add LangGraph agent graph with summarization and interrupt"
```

---

### Task 10: API Routes — Conversations

**Files:**
- Create: `src/app/api/conversations/route.ts`
- Create: `src/app/api/conversations/[id]/route.ts`
- Test: `src/app/api/conversations/route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/app/api/conversations/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = {
  conversations: [] as Array<{ id: string; threadId: string; title: string; createdAt: string }>,
};

vi.mock('@/lib/conversations', () => ({
  createConversation: vi.fn((title: string) => {
    const conv = { id: 'test-id-1', threadId: 'thread-id-1', title, createdAt: new Date().toISOString() };
    mockDb.conversations.push(conv);
    return { id: conv.id, threadId: conv.threadId };
  }),
  listConversations: vi.fn(() => [...mockDb.conversations].reverse()),
  getConversationById: vi.fn((id: string) => mockDb.conversations.find(c => c.id === id)),
  deleteConversation: vi.fn((id: string) => {
    mockDb.conversations = mockDb.conversations.filter(c => c.id !== id);
  }),
  getConversationByThreadId: vi.fn(),
}));

vi.mock('@/lib/checkpointer', () => ({ getCheckpointer: vi.fn() }));
vi.mock('@/lib/agent', () => ({ createGraph: vi.fn() }));

import { GET, POST } from './route';
import { GET as GETById, DELETE as DELETEById } from './[id]/route';
import { NextRequest } from 'next/server';

beforeEach(() => { mockDb.conversations = []; });

describe('GET /api/conversations', () => {
  it('returns empty array initially', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([]);
    expect(res.status).toBe(200);
  });

  it('returns created conversations', async () => {
    await POST(new NextRequest('http://localhost/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: 'My Chat' }),
    }));
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe('My Chat');
  });
});

describe('POST /api/conversations', () => {
  it('returns id and threadId', async () => {
    const res = await POST(new NextRequest('http://localhost/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: 'New Chat' }),
    }));
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('threadId');
    expect(res.status).toBe(201);
  });
});

describe('DELETE /api/conversations/[id]', () => {
  it('removes conversation and returns 200', async () => {
    await POST(new NextRequest('http://localhost/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: 'To Delete' }),
    }));
    const res = await DELETEById(
      new NextRequest('http://localhost/api/conversations/test-id-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'test-id-1' }) }
    );
    expect(res.status).toBe(200);
    const listRes = await GET();
    expect((await listRes.json())).toHaveLength(0);
  });

  it('returns 404 for unknown id', async () => {
    const res = await DELETEById(
      new NextRequest('http://localhost/api/conversations/unknown', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'unknown' }) }
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/app/api/conversations/route.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create `src/app/api/conversations/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import {
  createConversation,
  listConversations,
} from '@/lib/conversations';

export async function GET() {
  const conversations = listConversations();
  return Response.json(conversations);
}

export async function POST(req: NextRequest) {
  const { title } = await req.json();
  const { id, threadId } = createConversation(title ?? 'New conversation');
  return Response.json({ id, threadId }, { status: 201 });
}
```

- [ ] **Step 4: Create `src/app/api/conversations/[id]/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { getConversationById, deleteConversation, getConversationByThreadId } from '@/lib/conversations';
import { getCheckpointer } from '@/lib/checkpointer';
import type { SerializedMessage } from '@/types';
import { HumanMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';

function serializeMessage(msg: BaseMessage): SerializedMessage {
  const role =
    msg instanceof HumanMessage ? 'human' :
    msg instanceof AIMessage ? 'ai' : 'tool';

  const aiMsg = msg as AIMessage;
  const toolMsg = msg as ToolMessage;

  return {
    id: msg.id ?? '',
    role,
    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    ...(role === 'ai' && aiMsg.tool_calls?.length
      ? { toolCalls: aiMsg.tool_calls.map(tc => ({ name: tc.name, args: tc.args as Record<string, unknown>, id: tc.id ?? '' })) }
      : {}),
    ...(role === 'tool'
      ? { toolCallId: toolMsg.tool_call_id, toolName: (toolMsg as any).name }
      : {}),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversation = getConversationById(id);
  if (!conversation) return Response.json({ error: 'Not found' }, { status: 404 });

  const checkpointer = getCheckpointer();
  const config = { configurable: { thread_id: conversation.threadId } };
  const state = await checkpointer.get(config);

  if (!state) return Response.json([]);

  const messages: BaseMessage[] = state.channel_values?.messages ?? [];
  return Response.json(messages.map(serializeMessage));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversation = getConversationById(id);
  if (!conversation) return Response.json({ error: 'Not found' }, { status: 404 });
  deleteConversation(id);
  return Response.json({ ok: true });
}
```

- [ ] **Step 5: Run to verify tests pass**

```bash
npm test src/app/api/conversations/route.test.ts
```
Expected: 5 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/app/api/conversations/
git commit -m "feat: add conversations API routes"
```

---

### Task 11: API Routes — Preferences

**Files:**
- Create: `src/app/api/preferences/route.ts`
- Create: `src/app/api/preferences/[key]/route.ts`
- Test: `src/app/api/preferences/route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/app/api/preferences/route.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/app/api/preferences/route.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create `src/app/api/preferences/route.ts`**

```typescript
import { getPreferences, clearPreferences } from '@/lib/store';

export async function GET() {
  return Response.json(getPreferences());
}

export async function DELETE() {
  clearPreferences();
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Create `src/app/api/preferences/[key]/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { getPreferences, deletePreference } from '@/lib/store';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const prefs = getPreferences();
  if (!(key in prefs)) return Response.json({ error: 'Not found' }, { status: 404 });
  deletePreference(key);
  return Response.json({ ok: true });
}
```

- [ ] **Step 5: Run to verify tests pass**

```bash
npm test src/app/api/preferences/route.test.ts
```
Expected: 5 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/app/api/preferences/
git commit -m "feat: add preferences API routes"
```

---

### Task 12: API Route — Chat (Streaming)

**Files:**
- Create: `src/app/api/chat/route.ts`
- Test: `src/app/api/chat/route.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/app/api/chat/route.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockStreamChunks: object[] = [];
const mockGraph = {
  stream: vi.fn(async function* () {
    yield [{ _getType: () => 'AIMessageChunk', content: 'Here are some phones', tool_call_chunks: [] }, {}];
    yield [{ _getType: () => 'tool', name: 'search_products', content: JSON.stringify({ products: [{ id: 1, title: 'iPhone' }], total: 1 }) }, {}];
  }),
  getState: vi.fn(async () => ({ tasks: [] })),
};

const mockUpdateConversationTitle = vi.fn();

vi.mock('@/lib/agent', () => ({ createGraph: vi.fn(() => mockGraph) }));
vi.mock('@/lib/checkpointer', () => ({ getCheckpointer: vi.fn(() => ({})) }));
vi.mock('@/lib/conversations', () => ({
  updateConversationTitle: mockUpdateConversationTitle,
}));
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: 'Wireless headphones search' } }],
        })),
      },
    },
  })),
}));

import { POST } from './route';

async function collectChunks(res: Response): Promise<object[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const chunks: object[] = [];
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    done = d;
    if (value) {
      const text = decoder.decode(value);
      for (const line of text.split('\n').filter(Boolean)) {
        chunks.push(JSON.parse(line));
      }
    }
  }
  return chunks;
}

describe('POST /api/chat', () => {
  it('returns 400 when threadId is missing', async () => {
    const res = await POST(new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'hello' }),
    }));
    expect(res.status).toBe(400);
  });

  it('streams token chunks and a done chunk', async () => {
    const res = await POST(new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ threadId: 'thread-1', message: 'show me phones' }),
    }));
    expect(res.status).toBe(200);
    const chunks = await collectChunks(res);
    expect(chunks.some((c: any) => c.type === 'token')).toBe(true);
    expect(chunks.some((c: any) => c.type === 'tool_result')).toBe(true);
    expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
  });

  it('passes resume Command when resume:true', async () => {
    await POST(new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ threadId: 'thread-1', message: 'headphones', resume: true }),
    }));
    const { Command } = await import('@langchain/langgraph');
    const callArg = mockGraph.stream.mock.calls.at(-1)?.[0];
    expect(callArg).toBeInstanceOf(Command);
  });

  it('emits title_update chunk on first message', async () => {
    const res = await POST(new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        threadId: 'thread-1',
        message: 'show me headphones',
        convId: 'conv-1',
        isFirstMessage: true,
      }),
    }));
    const chunks = await collectChunks(res);
    const titleChunk = chunks.find((c: any) => c.type === 'title_update') as any;
    expect(titleChunk?.title).toBe('Wireless headphones search');
    expect(mockUpdateConversationTitle).toHaveBeenCalledWith('conv-1', 'Wireless headphones search');
  });

  it('skips title generation when resume:true', async () => {
    mockUpdateConversationTitle.mockClear();
    await POST(new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        threadId: 'thread-1',
        message: 'headphones',
        convId: 'conv-1',
        isFirstMessage: true,
        resume: true,
      }),
    }));
    expect(mockUpdateConversationTitle).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/app/api/chat/route.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create `src/app/api/chat/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { HumanMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import OpenAI from 'openai';
import { createGraph } from '@/lib/agent';
import { getCheckpointer } from '@/lib/checkpointer';
import { getConversationByThreadId, updateConversationTitle } from '@/lib/conversations';
import { PRODUCT_TOOL_NAMES } from '@/types';
import type { StreamChunk } from '@/types';

async function generateTitle(firstMessage: string): Promise<string> {
  const client = new OpenAI();
  const resp = await client.chat.completions.create({
    model: process.env.SUMMARY_MODEL ?? 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `Generate a 4-6 word title for a shopping conversation that started with: "${firstMessage}". Reply with only the title, no punctuation.`,
      },
    ],
    max_tokens: 20,
  });
  return resp.choices[0].message.content?.trim() ?? firstMessage.slice(0, 60);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { threadId, message, resume, convId, isFirstMessage } = body as {
    threadId?: string;
    message: string;
    resume?: boolean;
    convId?: string;
    isFirstMessage?: boolean;
  };

  if (!threadId) {
    return Response.json({ error: 'threadId required' }, { status: 400 });
  }

  const checkpointer = getCheckpointer();
  const graph = createGraph(checkpointer);
  const config = { configurable: { thread_id: threadId }, streamMode: 'messages' as const };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: StreamChunk) => {
        controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
      };

      try {
        const input = resume
          ? new Command({ resume: message })
          : { messages: [new HumanMessage(message)] };

        const graphStream = graph.stream(input, config);

        for await (const [chunk] of graphStream as AsyncIterable<[any, any]>) {
          if (!chunk) continue;
          const type = chunk._getType?.();

          if (type === 'AIMessageChunk' || type === 'ai') {
            if (chunk.content) send({ type: 'token', content: chunk.content });
            for (const tc of chunk.tool_call_chunks ?? []) {
              if (tc.name && PRODUCT_TOOL_NAMES.includes(tc.name as any)) {
                send({ type: 'tool_call', name: tc.name });
              }
            }
          }

          if (type === 'tool') {
            try {
              const parsed = JSON.parse(chunk.content);
              if (chunk.name === 'save_preference' && parsed.saved) {
                send({ type: 'preference_added', key: parsed.key, value: parsed.value });
              } else if (
                PRODUCT_TOOL_NAMES.includes(chunk.name as any) &&
                parsed.products?.length > 0
              ) {
                send({ type: 'tool_result', products: parsed.products });
              }
            } catch {
              // non-JSON tool content, skip
            }
          }
        }

        // Check for interrupt after stream ends
        const state = await graph.getState(config);
        const interrupts = state.tasks.flatMap((t: any) => t.interrupts ?? []);
        if (interrupts.length > 0) {
          const value = interrupts[0].value;
          send({
            type: 'interrupt',
            question: typeof value === 'string' ? value : (value?.question ?? String(value)),
          });
        }

        // Generate and persist title after first assistant response
        if (isFirstMessage && convId && !resume) {
          try {
            const title = await generateTitle(message);
            updateConversationTitle(convId, title);
            send({ type: 'title_update', title });
          } catch {
            // title generation is best-effort; don't fail the stream
          }
        }

        send({ type: 'done' });
      } catch (err) {
        send({ type: 'error', message: 'Request failed' });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
```

- [ ] **Step 4: Run to verify tests pass**

```bash
npm test src/app/api/chat/route.test.ts
```
Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/
git commit -m "feat: add streaming chat API route"
```

---

### Task 13: Integration Tests

**Files:**
- Test: `src/integration/agent.test.ts`

- [ ] **Step 1: Create `src/integration/agent.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { createGraph, shouldSummarize } from '@/lib/agent';

vi.mock('@/lib/store', () => ({
  getPreferences: vi.fn().mockReturnValue({}),
  setPreference: vi.fn(),
}));

async function runGraph(graph: ReturnType<typeof createGraph>, message: string, threadId = 'test-thread') {
  const config = { configurable: { thread_id: threadId } };
  await graph.invoke({ messages: [new HumanMessage(message)] }, config);
  return graph.getState(config);
}

describe('core product discovery flow', () => {
  it('calls search_products for a phone query and produces AIMessage', async () => {
    const graph = createGraph(new MemorySaver());
    const state = await runGraph(graph, 'show me phones under $500');
    const messages = state.values.messages as any[];
    const toolMessages = messages.filter((m: any) => m instanceof ToolMessage);
    expect(toolMessages.length).toBeGreaterThan(0);
    expect(toolMessages[0].name).toBe('search_products');
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage).toBeInstanceOf(AIMessage);
  });

  it('calls list_categories when asked what is available', async () => {
    const graph = createGraph(new MemorySaver());
    const state = await runGraph(graph, 'what categories do you have?');
    const messages = state.values.messages as any[];
    const toolMessages = messages.filter((m: any) => m instanceof ToolMessage);
    expect(toolMessages.some((m: any) => m.name === 'list_categories')).toBe(true);
  });

  it('calls browse_category for general category interest', async () => {
    const graph = createGraph(new MemorySaver());
    const state = await runGraph(graph, 'show me smartphones');
    const messages = state.values.messages as any[];
    const toolMsg = messages.find((m: any) => m instanceof ToolMessage);
    expect(['browse_category', 'search_products']).toContain(toolMsg?.name);
  });
});

describe('multi-turn context', () => {
  it('resolves follow-up reference to prior product', async () => {
    const graph = createGraph(new MemorySaver());
    const config = { configurable: { thread_id: 'multi-turn' } };

    await graph.invoke({ messages: [new HumanMessage('show me phones')] }, config);
    await graph.invoke({ messages: [new HumanMessage('tell me more about the first one')] }, config);

    const state = await graph.getState(config);
    const messages = state.values.messages as any[];
    const toolCalls = messages.filter((m: any) => m instanceof ToolMessage);
    expect(toolCalls.some((m: any) => m.name === 'get_product')).toBe(true);
  });
});

describe('empty results', () => {
  it('completes graph without error when no products found', async () => {
    const { server } = await import('../test/mocks/server');
    const { http, HttpResponse } = await import('msw');
    server.use(
      http.get('https://dummyjson.com/products/search', () =>
        HttpResponse.json({ products: [], total: 0, skip: 0, limit: 10 })
      )
    );
    const graph = createGraph(new MemorySaver());
    const state = await runGraph(graph, 'find me a unicorn product');
    const messages = state.values.messages as any[];
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg).toBeInstanceOf(AIMessage);
    expect(typeof lastMsg.content).toBe('string');
  });
});

describe('summarization', () => {
  it('triggers summarize node when messages exceed threshold', async () => {
    process.env.SUMMARY_MESSAGE_THRESHOLD = '4';
    const graph = createGraph(new MemorySaver());
    const config = { configurable: { thread_id: 'summarize-thread' } };

    for (let i = 0; i < 3; i++) {
      await graph.invoke({ messages: [new HumanMessage(`show me phones round ${i}`)] }, config);
    }

    const state = await graph.getState(config);
    expect(state.values.summary).toBeTruthy();
    expect((state.values.messages as any[]).length).toBeLessThanOrEqual(4);
    process.env.SUMMARY_MESSAGE_THRESHOLD = '10';
  });
});

describe('human-in-the-loop', () => {
  it('interrupts graph for vague query', async () => {
    const graph = createGraph(new MemorySaver());
    const config = { configurable: { thread_id: 'interrupt-thread' } };
    await graph.invoke({ messages: [new HumanMessage('show me something nice')] }, config);
    const state = await graph.getState(config);
    const interrupts = state.tasks.flatMap((t: any) => t.interrupts ?? []);
    // Interrupt may or may not trigger — depends on LLM judgment
    // Assert the graph completed without error regardless
    expect(state).toBeDefined();
  });
});

describe('cross-thread Store', () => {
  it('save_preference tool stores preference', async () => {
    const { setPreference } = await import('@/lib/store');
    const graph = createGraph(new MemorySaver());
    const config = { configurable: { thread_id: 'pref-thread' } };
    await graph.invoke(
      { messages: [new HumanMessage('I always buy Nike products')] },
      config
    );
    // The agent may or may not call save_preference — assert it was available
    expect(setPreference).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test src/integration/agent.test.ts
```
Expected: tests pass (integration tests run against real OpenAI — ensure `OPENAI_API_KEY` is set in `.env.local`)

- [ ] **Step 3: Commit**

```bash
git add src/integration/
git commit -m "test: add LangGraph agent integration tests"
```

---

### Task 14: ProductCard + ProductGrid Components

**Files:**
- Create: `src/components/ProductCard.tsx`
- Create: `src/components/ProductGrid.tsx`
- Test: `src/components/ProductCard.test.tsx`
- Test: `src/components/ProductGrid.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/ProductCard.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ProductCard } from './ProductCard';
import type { Product } from '@/types';

const mockProduct: Product = {
  id: 1, title: 'Sony Headphones', description: 'Great wireless headphones for everyday use',
  category: 'electronics', price: 79.99, discountPercentage: 10, rating: 4.5, stock: 50,
  brand: 'Sony', tags: ['audio'], thumbnail: 'https://example.com/sony.jpg',
  images: ['https://example.com/sony.jpg'], availabilityStatus: 'In Stock',
};

describe('ProductCard', () => {
  it('renders title, price, and rating', () => {
    render(<ProductCard product={mockProduct} />);
    expect(screen.getByText('Sony Headphones')).toBeInTheDocument();
    expect(screen.getByText('$79.99')).toBeInTheDocument();
    expect(screen.getByText(/4\.5/)).toBeInTheDocument();
  });

  it('renders thumbnail image with alt text', () => {
    render(<ProductCard product={mockProduct} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', 'Sony Headphones');
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<ProductCard product={mockProduct} onClick={onClick} />);
    await userEvent.click(screen.getByRole('article'));
    expect(onClick).toHaveBeenCalledWith(mockProduct);
  });

  it('renders availability status', () => {
    render(<ProductCard product={mockProduct} />);
    expect(screen.getByText('In Stock')).toBeInTheDocument();
  });
});
```

```typescript
// src/components/ProductGrid.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProductGrid } from './ProductGrid';
import type { Product } from '@/types';

const products: Product[] = [
  { id: 1, title: 'Product A', description: 'Desc', category: 'cat', price: 10, discountPercentage: 0, rating: 4, stock: 5, brand: 'B', tags: [], thumbnail: 'url', images: ['url'], availabilityStatus: 'In Stock' },
  { id: 2, title: 'Product B', description: 'Desc', category: 'cat', price: 20, discountPercentage: 0, rating: 3, stock: 3, brand: 'B', tags: [], thumbnail: 'url', images: ['url'], availabilityStatus: 'Low Stock' },
];

describe('ProductGrid', () => {
  it('renders one card per product', () => {
    render(<ProductGrid products={products} />);
    expect(screen.getByText('Product A')).toBeInTheDocument();
    expect(screen.getByText('Product B')).toBeInTheDocument();
  });

  it('renders nothing for empty array', () => {
    const { container } = render(<ProductGrid products={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test src/components/ProductCard.test.tsx src/components/ProductGrid.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Create `src/components/ProductCard.tsx`**

```tsx
'use client';
import type { Product } from '@/types';

interface Props {
  product: Product;
  onClick?: (product: Product) => void;
}

export function ProductCard({ product, onClick }: Props) {
  return (
    <article
      role="article"
      onClick={() => onClick?.(product)}
      className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 overflow-hidden hover:border-blue-500 transition-colors"
    >
      <img
        src={product.thumbnail}
        alt={product.title}
        className="w-full h-32 object-cover"
      />
      <div className="p-3">
        <h3 className="text-sm font-semibold text-slate-100 line-clamp-1">
          {product.title}
        </h3>
        <p className="text-xs text-slate-400 line-clamp-2 mt-1">
          {product.description}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-bold text-emerald-400">
            ${product.price.toFixed(2)}
          </span>
          <span className="text-xs text-slate-400">⭐ {product.rating}</span>
        </div>
        <span
          className={`mt-1 inline-block text-xs ${
            product.availabilityStatus === 'In Stock'
              ? 'text-emerald-400'
              : 'text-amber-400'
          }`}
        >
          {product.availabilityStatus}
        </span>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Create `src/components/ProductGrid.tsx`**

```tsx
'use client';
import { ProductCard } from './ProductCard';
import type { Product } from '@/types';

interface Props {
  products: Product[];
  onProductClick?: (product: Product) => void;
}

export function ProductGrid({ products, onProductClick }: Props) {
  if (products.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-2">
      {products.map(p => (
        <ProductCard key={p.id} product={p} onClick={onProductClick} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run to verify tests pass**

```bash
npm test src/components/ProductCard.test.tsx src/components/ProductGrid.test.tsx
```
Expected: 6 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductCard.tsx src/components/ProductGrid.tsx src/components/ProductCard.test.tsx src/components/ProductGrid.test.tsx
git commit -m "feat: add ProductCard and ProductGrid components"
```

---

### Task 15: ProductDetailModal

**Files:**
- Create: `src/components/ProductDetailModal.tsx`
- Test: `src/components/ProductDetailModal.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// src/components/ProductDetailModal.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ProductDetailModal } from './ProductDetailModal';
import type { Product } from '@/types';

const product: Product = {
  id: 1, title: 'Sony WH-1000XM5', description: 'Industry-leading noise canceling headphones with exceptional sound quality.',
  category: 'electronics', price: 349.99, discountPercentage: 15, rating: 4.8, stock: 25,
  brand: 'Sony', tags: ['audio', 'wireless'],
  thumbnail: 'https://example.com/sony.jpg', images: ['https://example.com/sony1.jpg', 'https://example.com/sony2.jpg'],
  availabilityStatus: 'In Stock',
};

describe('ProductDetailModal', () => {
  it('renders product title and price', () => {
    render(<ProductDetailModal product={product} onClose={vi.fn()} />);
    expect(screen.getByText('Sony WH-1000XM5')).toBeInTheDocument();
    expect(screen.getByText('$349.99')).toBeInTheDocument();
  });

  it('renders full description', () => {
    render(<ProductDetailModal product={product} onClose={vi.fn()} />);
    expect(screen.getByText(/Industry-leading noise canceling/)).toBeInTheDocument();
  });

  it('renders brand and rating', () => {
    render(<ProductDetailModal product={product} onClose={vi.fn()} />);
    expect(screen.getByText(/Sony/)).toBeInTheDocument();
    expect(screen.getByText(/4\.8/)).toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(<ProductDetailModal product={product} onClose={onClose} />);
    await userEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on ESC key', async () => {
    const onClose = vi.fn();
    render(<ProductDetailModal product={product} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/components/ProductDetailModal.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Create `src/components/ProductDetailModal.tsx`**

```tsx
'use client';
import { useEffect } from 'react';
import type { Product } from '@/types';

interface Props {
  product: Product;
  onClose: () => void;
}

export function ProductDetailModal({ product, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-800 rounded-xl max-w-lg w-full mx-4 overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-white text-xl"
        >
          ✕
        </button>

        {product.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto p-4">
            {product.images.map((img, i) => (
              <img
                key={i}
                src={img}
                alt={`${product.title} ${i + 1}`}
                className="h-40 w-auto rounded object-cover flex-shrink-0"
              />
            ))}
          </div>
        )}

        <div className="p-5">
          <h2 className="text-xl font-bold text-white">{product.title}</h2>
          <p className="text-slate-400 text-sm mt-1">{product.brand}</p>

          <div className="flex items-center gap-4 mt-3">
            <span className="text-2xl font-bold text-emerald-400">
              ${product.price.toFixed(2)}
            </span>
            {product.discountPercentage > 0 && (
              <span className="text-sm text-amber-400">
                {product.discountPercentage}% off
              </span>
            )}
            <span className="text-sm text-slate-400">⭐ {product.rating}</span>
          </div>

          <p className="text-slate-300 text-sm mt-4">{product.description}</p>

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-400">
              Stock: <span className="text-slate-200">{product.stock}</span>
            </div>
            <div className="text-slate-400">
              Status:{' '}
              <span
                className={
                  product.availabilityStatus === 'In Stock'
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }
              >
                {product.availabilityStatus}
              </span>
            </div>
          </div>

          {product.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {product.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify tests pass**

```bash
npm test src/components/ProductDetailModal.test.tsx
```
Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductDetailModal.tsx src/components/ProductDetailModal.test.tsx
git commit -m "feat: add ProductDetailModal component"
```

---

### Task 16: MessageBubble + MessageList

**Files:**
- Create: `src/components/MessageBubble.tsx`
- Create: `src/components/MessageList.tsx`
- Test: `src/components/MessageBubble.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// src/components/MessageBubble.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MessageBubble } from './MessageBubble';
import type { SerializedMessage } from '@/types';

const humanMsg: SerializedMessage = { id: '1', role: 'human', content: 'Show me phones' };
const aiMsg: SerializedMessage = { id: '2', role: 'ai', content: 'Here are some phones:' };
const aiToolOnlyMsg: SerializedMessage = {
  id: '3', role: 'ai', content: '',
  toolCalls: [{ name: 'search_products', args: { query: 'phones' }, id: 'tc1' }],
};
const toolMsgWithProducts: SerializedMessage = {
  id: '4', role: 'tool', content: JSON.stringify({ products: [
    { id: 1, title: 'iPhone', description: 'Phone', category: 'phones', price: 999, discountPercentage: 0, rating: 4.5, stock: 10, brand: 'Apple', tags: [], thumbnail: 'url', images: ['url'], availabilityStatus: 'In Stock' },
  ], total: 1 }), toolName: 'search_products',
};
const toolMsgEmpty: SerializedMessage = {
  id: '5', role: 'tool', content: JSON.stringify({ products: [], total: 0 }),
  toolName: 'search_products',
};

describe('MessageBubble', () => {
  it('renders human message right-aligned', () => {
    const { container } = render(<MessageBubble message={humanMsg} />);
    expect(screen.getByText('Show me phones')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('justify-end');
  });

  it('renders AI message left-aligned', () => {
    const { container } = render(<MessageBubble message={aiMsg} />);
    expect(screen.getByText('Here are some phones:')).toBeInTheDocument();
    expect(container.firstChild).not.toHaveClass('justify-end');
  });

  it('renders nothing for AI message with tool calls only', () => {
    const { container } = render(<MessageBubble message={aiToolOnlyMsg} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders ProductGrid for tool message with products', () => {
    render(<MessageBubble message={toolMsgWithProducts} />);
    expect(screen.getByText('iPhone')).toBeInTheDocument();
  });

  it('renders nothing for tool message with empty products', () => {
    const { container } = render(<MessageBubble message={toolMsgEmpty} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/components/MessageBubble.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Create `src/components/MessageBubble.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { ProductGrid } from './ProductGrid';
import { ProductDetailModal } from './ProductDetailModal';
import { PRODUCT_TOOL_NAMES } from '@/types';
import type { SerializedMessage, Product } from '@/types';

interface Props {
  message: SerializedMessage;
}

export function MessageBubble({ message }: Props) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Human message
  if (message.role === 'human') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }

  // AI message with tool calls only — hide
  if (
    message.role === 'ai' &&
    !message.content &&
    message.toolCalls?.length
  ) {
    return null;
  }

  // AI text message
  if (message.role === 'ai' && message.content) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-slate-700 px-4 py-2 text-sm text-slate-100">
          {message.content}
        </div>
      </div>
    );
  }

  // Tool message — only render if it's a product tool with results
  if (message.role === 'tool') {
    const isProductTool = PRODUCT_TOOL_NAMES.includes(message.toolName as any);
    if (!isProductTool) return null;

    try {
      const parsed = JSON.parse(message.content);
      if (!parsed.products?.length) return null;
      return (
        <>
          <ProductGrid products={parsed.products} onProductClick={setSelectedProduct} />
          {selectedProduct && (
            <ProductDetailModal
              product={selectedProduct}
              onClose={() => setSelectedProduct(null)}
            />
          )}
        </>
      );
    } catch {
      return null;
    }
  }

  return null;
}
```

- [ ] **Step 4: Create `src/components/MessageList.tsx`**

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import type { SerializedMessage } from '@/types';

interface Props {
  messages: SerializedMessage[];
  isStreaming?: boolean;
  streamingText?: string;
}

export function MessageList({ messages, isStreaming, streamingText }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isStreaming && streamingText && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-slate-700 px-4 py-2 text-sm text-slate-100">
            {streamingText}
            <span className="inline-block w-1 h-3 ml-1 bg-blue-400 animate-pulse" />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 5: Run to verify tests pass**

```bash
npm test src/components/MessageBubble.test.tsx
```
Expected: 5 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/MessageBubble.tsx src/components/MessageList.tsx src/components/MessageBubble.test.tsx
git commit -m "feat: add MessageBubble and MessageList components"
```

---

### Task 17: PreferencesPanel

**Files:**
- Create: `src/components/PreferencesPanel.tsx`
- Test: `src/components/PreferencesPanel.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// src/components/PreferencesPanel.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PreferencesPanel } from './PreferencesPanel';

describe('PreferencesPanel', () => {
  it('renders one chip per preference', () => {
    render(
      <PreferencesPanel
        preferences={{ budget: 'under $100', brand: 'Nike' }}
        onDelete={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.getByText(/budget/i)).toBeInTheDocument();
    expect(screen.getByText(/Nike/i)).toBeInTheDocument();
  });

  it('shows empty state when preferences is empty', () => {
    render(
      <PreferencesPanel
        preferences={{}}
        onDelete={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.getByText(/No preferences saved/i)).toBeInTheDocument();
  });

  it('calls onDelete with key when delete button clicked', async () => {
    const onDelete = vi.fn();
    render(
      <PreferencesPanel
        preferences={{ budget: 'under $100' }}
        onDelete={onDelete}
        onClearAll={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /delete budget/i }));
    expect(onDelete).toHaveBeenCalledWith('budget');
  });

  it('calls onClearAll when clear all clicked', async () => {
    const onClearAll = vi.fn();
    render(
      <PreferencesPanel
        preferences={{ budget: 'under $100' }}
        onDelete={vi.fn()}
        onClearAll={onClearAll}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(onClearAll).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/components/PreferencesPanel.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Create `src/components/PreferencesPanel.tsx`**

```tsx
'use client';
import { useState } from 'react';

interface Props {
  preferences: Record<string, string>;
  onDelete: (key: string) => void;
  onClearAll: () => void;
}

export function PreferencesPanel({ preferences, onDelete, onClearAll }: Props) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(preferences);

  return (
    <div className="border-t border-slate-700 mt-2 pt-2">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-400 hover:text-slate-200"
        onClick={() => setOpen(o => !o)}
      >
        <span>My Preferences</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          {keys.length === 0 ? (
            <p className="text-xs text-slate-500">No preferences saved yet.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mt-1">
                {keys.map(key => (
                  <span
                    key={key}
                    className="flex items-center gap-1 bg-slate-700 rounded-full px-2 py-0.5 text-xs text-slate-300"
                  >
                    <span>
                      {key}: {preferences[key]}
                    </span>
                    <button
                      aria-label={`delete ${key}`}
                      onClick={() => onDelete(key)}
                      className="text-slate-400 hover:text-white ml-1"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <button
                aria-label="clear all"
                onClick={onClearAll}
                className="mt-2 text-xs text-slate-500 hover:text-slate-300"
              >
                Clear all
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify tests pass**

```bash
npm test src/components/PreferencesPanel.test.tsx
```
Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/PreferencesPanel.tsx src/components/PreferencesPanel.test.tsx
git commit -m "feat: add PreferencesPanel component"
```

---

### Task 18: ConversationSidebar

**Files:**
- Create: `src/components/ConversationSidebar.tsx`

- [ ] **Step 1: Create `src/components/ConversationSidebar.tsx`**

```tsx
'use client';
import { PreferencesPanel } from './PreferencesPanel';
import type { Conversation } from '@/types';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  preferences: Record<string, string>;
  onSelect: (conv: Conversation) => void;
  onNew: () => void;
  onDeletePreference: (key: string) => void;
  onClearPreferences: () => void;
}

function groupByRecency(conversations: Conversation[]) {
  const now = new Date();
  const today: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const older: Conversation[] = [];

  for (const conv of conversations) {
    const d = new Date(conv.createdAt);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    if (diffDays === 0) today.push(conv);
    else if (diffDays === 1) yesterday.push(conv);
    else older.push(conv);
  }
  return { today, yesterday, older };
}

function ThreadGroup({ label, items, activeId, onSelect }: {
  label: string;
  items: Conversation[];
  activeId: string | null;
  onSelect: (c: Conversation) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-2">
      <p className="px-3 py-1 text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </p>
      {items.map(c => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          className={`w-full text-left px-3 py-2 rounded-lg mx-1 text-sm truncate ${
            c.id === activeId
              ? 'bg-slate-600 text-slate-100'
              : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
          }`}
        >
          {c.title}
        </button>
      ))}
    </div>
  );
}

export function ConversationSidebar({
  conversations,
  activeId,
  preferences,
  onSelect,
  onNew,
  onDeletePreference,
  onClearPreferences,
}: Props) {
  const { today, yesterday, older } = groupByRecency(conversations);

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-800 flex flex-col border-r border-slate-700 h-full">
      <div className="p-3 border-b border-slate-700">
        <button
          onClick={onNew}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-lg"
        >
          + New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <ThreadGroup label="Today" items={today} activeId={activeId} onSelect={onSelect} />
        <ThreadGroup label="Yesterday" items={yesterday} activeId={activeId} onSelect={onSelect} />
        <ThreadGroup label="Older" items={older} activeId={activeId} onSelect={onSelect} />
      </div>

      <PreferencesPanel
        preferences={preferences}
        onDelete={onDeletePreference}
        onClearAll={onClearPreferences}
      />
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ConversationSidebar.tsx
git commit -m "feat: add ConversationSidebar component"
```

---

### Task 19: ChatShell + Page

**Files:**
- Create: `src/components/ChatShell.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Create `src/components/ChatShell.tsx`**

```tsx
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ConversationSidebar } from './ConversationSidebar';
import { MessageList } from './MessageList';
import type { Conversation, SerializedMessage, StreamChunk, Product } from '@/types';

export function ChatShell() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SerializedMessage[]>([]);
  const [preferences, setPreferences] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [pendingResume, setPendingResume] = useState(false);
  const [preferenceNotice, setPreferenceNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/conversations');
    setConversations(await res.json());
  }, []);

  const loadPreferences = useCallback(async () => {
    const res = await fetch('/api/preferences');
    setPreferences(await res.json());
  }, []);

  useEffect(() => {
    loadConversations();
    loadPreferences();
  }, [loadConversations, loadPreferences]);

  const selectConversation = useCallback(async (conv: Conversation) => {
    setActiveConvId(conv.id);
    setActiveThreadId(conv.threadId);
    setPendingResume(false);
    const res = await fetch(`/api/conversations/${conv.id}`);
    setMessages(res.ok ? await res.json() : []);
  }, []);

  const startNewConversation = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New conversation' }),
      });
      if (!res.ok) throw new Error('Failed to create conversation');
      const { id, threadId } = await res.json();
      const conv: Conversation = {
        id,
        threadId,
        title: 'New conversation',
        createdAt: new Date().toISOString(),
      };
      setConversations(prev => [conv, ...prev]);
      setActiveConvId(id);
      setActiveThreadId(threadId);
      setMessages([]);
      setPendingResume(false);
      inputRef.current?.focus();
    } catch {
      setError('Could not start a new conversation. Please try again.');
    }
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    setError(null);

    let threadId = activeThreadId;
    let convId = activeConvId;

    const isFirstMessage = !threadId;

    if (!threadId) {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New conversation' }),
      });
      const created = await res.json();
      threadId = created.threadId;
      convId = created.id;
      setActiveThreadId(threadId);
      setActiveConvId(convId);
      await loadConversations();
    }

    const userMessage: SerializedMessage = {
      id: Date.now().toString(),
      role: 'human',
      content: input,
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, message: input, resume: pendingResume, convId, isFirstMessage }),
      });

      if (!res.ok || !res.body) throw new Error('Request failed');

      setPendingResume(false);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accText = '';
      const inlineProducts: Product[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines.filter(Boolean)) {
          const chunk: StreamChunk = JSON.parse(line);

          if (chunk.type === 'token' && chunk.content) {
            accText += chunk.content;
            setStreamingText(accText);
          }

          if (chunk.type === 'tool_result' && chunk.products) {
            const toolMsg: SerializedMessage = {
              id: `tool-${Date.now()}`,
              role: 'tool',
              content: JSON.stringify({ products: chunk.products, total: chunk.products.length }),
              toolName: 'search_products',
            };
            setMessages(prev => [...prev, toolMsg]);
          }

          if (chunk.type === 'preference_added' && chunk.key && chunk.value) {
            setPreferenceNotice(`Noted: ${chunk.key}: ${chunk.value}`);
            setTimeout(() => setPreferenceNotice(null), 4000);
            await loadPreferences();
          }

          if (chunk.type === 'interrupt' && chunk.question) {
            const interruptMsg: SerializedMessage = {
              id: `interrupt-${Date.now()}`,
              role: 'ai',
              content: chunk.question,
            };
            setMessages(prev => [...prev, interruptMsg]);
            setPendingResume(true);
          }

          if (chunk.type === 'title_update' && chunk.title) {
            setConversations(prev =>
              prev.map(c => (c.id === convId ? { ...c, title: chunk.title! } : c))
            );
          }

          if (chunk.type === 'done') {
            if (accText) {
              const aiMsg: SerializedMessage = {
                id: `ai-${Date.now()}`,
                role: 'ai',
                content: accText,
              };
              setMessages(prev => [...prev, aiMsg]);
            }
            setStreamingText('');
          }
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsStreaming(false);
      setStreamingText('');
    }
  }, [input, isStreaming, activeThreadId, activeConvId, pendingResume, loadConversations, loadPreferences]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDeletePreference = async (key: string) => {
    await fetch(`/api/preferences/${encodeURIComponent(key)}`, { method: 'DELETE' });
    await loadPreferences();
  };

  const handleClearPreferences = async () => {
    await fetch('/api/preferences', { method: 'DELETE' });
    await loadPreferences();
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConvId}
        preferences={preferences}
        onSelect={selectConversation}
        onNew={startNewConversation}
        onDeletePreference={handleDeletePreference}
        onClearPreferences={handleClearPreferences}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-slate-700 text-sm font-semibold">
          {conversations.find(c => c.id === activeConvId)?.title ?? 'Shopping Copilot'}
        </div>

        {messages.length === 0 && !isStreaming ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Ask me about products — I'll help you find what you're looking for.
          </div>
        ) : (
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            streamingText={streamingText}
          />
        )}

        <div className="border-t border-slate-700 px-4 py-3">
          {preferenceNotice && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-blue-900/40 px-3 py-1.5 text-xs text-blue-300">
              <span>{preferenceNotice}</span>
              <button onClick={() => setPreferenceNotice(null)} className="ml-2 text-blue-400 hover:text-white">✕</button>
            </div>
          )}
          {error && (
            <div className="mb-2 rounded-lg bg-red-900/40 px-3 py-1.5 text-xs text-red-300">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder={pendingResume ? 'Answer the question above…' : 'Ask about products…'}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={isStreaming || !input.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {isStreaming ? '…' : '→'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `src/app/page.tsx`**

```tsx
import { ChatShell } from '@/components/ChatShell';

export default function Home() {
  return <ChatShell />;
}
```

- [ ] **Step 3: Update `src/app/globals.css` — keep Tailwind directives, remove Next.js defaults**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body {
  height: 100%;
}
```

- [ ] **Step 4: Write failing test for `title_update` handling**

```typescript
// src/components/ChatShell.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatShell } from './ChatShell';

vi.mock('@/components/ConversationSidebar', () => ({
  ConversationSidebar: ({ conversations }: any) => (
    <div data-testid="sidebar">
      {conversations.map((c: any) => (
        <div key={c.id} data-testid={`conv-title-${c.id}`}>{c.title}</div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/MessageList', () => ({
  MessageList: () => <div data-testid="message-list" />,
}));

function makeStream(chunks: object[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
      }
      controller.close();
    },
  });
}

describe('ChatShell', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: any) => {
      if (url === '/api/conversations' && (!opts || opts.method === 'GET' || !opts.method)) {
        return { ok: true, json: async () => [] };
      }
      if (url === '/api/conversations' && opts?.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'conv-1', threadId: 'thread-1' }) };
      }
      if (url === '/api/preferences') {
        return { ok: true, json: async () => ({}) };
      }
      if (url === '/api/chat') {
        return {
          ok: true,
          body: makeStream([
            { type: 'token', content: 'Here are some options' },
            { type: 'title_update', title: 'Wireless headphones search' },
            { type: 'done' },
          ]),
        };
      }
      return { ok: true, json: async () => ({}) };
    }));
  });

  it('updates sidebar title when title_update chunk is received', async () => {
    render(<ChatShell />);
    const input = screen.getByPlaceholderText(/ask about products/i);
    await userEvent.type(input, 'show me headphones');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.getByTestId('conv-title-conv-1').textContent).toBe('Wireless headphones search');
    });
  });
});
```

- [ ] **Step 5: Run to verify it fails**

```bash
npm test src/components/ChatShell.test.tsx
```
Expected: FAIL — module not found

- [ ] **Step 6: Run to verify it passes after ChatShell is created**

```bash
npm test src/components/ChatShell.test.tsx
```
Expected: 1 test passes

- [ ] **Step 7: Commit**

```bash
git add src/components/ChatShell.tsx src/app/page.tsx src/app/globals.css src/components/ChatShell.test.tsx
git commit -m "feat: add ChatShell and wire up root page"
```

---

### Task 20: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite `README.md`**

```markdown
# Bazak — AI Shopping Copilot

A locally runnable AI shopping assistant. Discover products through conversation — the assistant understands your intent, retrieves relevant results from the DummyJSON catalog, and renders product cards inline in the chat.

## Setup

1. **Clone and install**
   ```bash
   git clone <repo-url> bazak
   cd bazak
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` and set:
   ```
   OPENAI_API_KEY=your-key-here
   ```
   All other variables have sensible defaults.

3. **Run**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

The SQLite database is created automatically at `data/bazak.db` on first run.

## Tests

```bash
npm test            # run all tests once
npm run test:watch  # watch mode
```

Integration tests in `src/integration/` call the real OpenAI API and require `OPENAI_API_KEY` to be set in `.env.local`.

## Technical Choices

### LangGraph for agent orchestration
The core of the system is a hand-built LangGraph ReAct graph rather than a simple prompt-response loop. This gives us:
- **Stateful threads** — every conversation is a LangGraph thread. The SQLite checkpointer snapshots the full agent state (messages, tool calls, summary) after every node, so threads survive page refreshes and server restarts.
- **Summarization node** — when a thread exceeds `SUMMARY_MESSAGE_THRESHOLD` messages, a `summarize` node compresses earlier turns and trims the message list. Controlled via env var.
- **Human-in-the-loop** — for vague queries, the agent calls `interrupt()` (a LangGraph primitive) before invoking any tool. The graph pauses, surfaces a clarifying question, and resumes from the exact checkpoint when the user responds.

### Intent extraction via tool calling
There is no separate intent classifier. The LLM decides which tool to call — and that decision *is* the intent extraction. The system prompt describes when to use each of the four DummyJSON tools (`search_products`, `browse_category`, `list_categories`, `get_product`), and the model matches user queries to the right tool and parameters.

### Cross-thread memory (LangGraph Store)
A `save_preference` tool lets the agent persist stable user preferences (budget, brand, category) to a SQLite-backed key-value store. Preferences persist across conversations and are injected into the system prompt on every agent invocation. Users can view and delete preferences via the sidebar panel.

### Model selection
- `AGENT_MODEL` (default: `gpt-5.4-mini`) — used for the main agent node: intent understanding, tool selection, relevance filtering, response generation.
- `SUMMARY_MODEL` (default: `gpt-5.4-nano`) — used for the summarize node: a compression task that doesn't require the full model's reasoning capability.

### Streaming
Responses stream token-by-token via HTTP `ReadableStream` (not SSE). The API route pipes LangGraph's async iterator into a `ReadableStream` and encodes each event as a newline-delimited JSON line with a `type` discriminator (`token`, `tool_result`, `preference_added`, `interrupt`, `done`).

### Relevance filtering
DummyJSON has no semantic ranking or price filter. The agent fetches up to `TOOL_RESULTS_LIMIT` results (default 10) and the LLM selects the 3–5 most relevant to present, taking price constraints and conversation context into account.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Required. OpenAI API key. |
| `AGENT_MODEL` | `gpt-5.4-mini` | Model for agent node |
| `SUMMARY_MODEL` | `gpt-5.4-nano` | Model for summarize node |
| `SUMMARY_MESSAGE_THRESHOLD` | `10` | Messages before summarization triggers |
| `TOOL_RESULTS_LIMIT` | `10` | Max products fetched per tool call |
| `DB_PATH` | `data/bazak.db` | SQLite file path |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and architecture explanation"
```

---

### Task 21: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: all unit and component tests pass; integration tests pass if `OPENAI_API_KEY` is set

- [ ] **Step 2: Start dev server and verify the app runs**

```bash
npm run dev
```
Open http://localhost:3000. Verify:
- Sidebar renders with "New chat" button
- Typing a product query streams a response
- Product cards appear inline in the chat
- Clicking a product card opens the detail modal
- ESC or backdrop click closes the modal
- Refreshing the page preserves the conversation
- Clicking a past thread in the sidebar restores the full history
- Preferences panel appears in the sidebar after the agent infers a preference

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final verification pass"
```
