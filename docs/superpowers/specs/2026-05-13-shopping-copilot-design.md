# Shopping Copilot — Design Spec

**Date:** 2026-05-13
**Status:** Approved

---

## Overview

A locally runnable AI shopping copilot. Users discover products through conversation. The system understands intent via LangGraph tool calling, retrieves products from the DummyJSON API, and renders results as inline product cards inside the chat. Conversation history persists via LangGraph's SQLite checkpointer and survives page refreshes.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS |
| AI orchestration | LangGraph.js (`@langchain/langgraph`) |
| LLM provider | OpenAI via `@langchain/openai` |
| In-thread persistence | LangGraph SQLite checkpointer (`@langchain/langgraph-checkpoint-sqlite`) |
| Cross-thread memory | LangGraph Store (SQLite-backed via `@langchain/langgraph-checkpoint-sqlite`) |
| Product API | DummyJSON Products API |
| Testing | Vitest, React Testing Library, msw |

**Models:**
- `gpt-5.4-mini` — agent node (intent, tool selection, response generation)
- `gpt-5.4-nano` — summarize node (conversation compression)

Rationale: the agent node requires nuanced reasoning across multi-turn context; the summarize node is a compression task where a lighter model is fully sufficient. Using different models per task demonstrates intentional cost/capability tradeoffs.

**Security:** All API keys are loaded from environment variables. No key values appear in source code or committed files. `.env` is listed in `.gitignore`.

Required env vars:
```
OPENAI_API_KEY=              # OpenAI key — never commit this value
AGENT_MODEL=                 # Model for the agent node (default: gpt-5.4-mini)
SUMMARY_MODEL=               # Model for the summarize node and title generation (default: gpt-5.4-nano)
SUMMARY_MESSAGE_THRESHOLD=   # Number of messages before summarization triggers (default: 10)
TOOL_RESULTS_LIMIT=          # Max products fetched per tool call (default: 10)
DB_PATH=                     # Optional: override default data/bazak.db path
```

---

## Architecture

### File structure

```
src/
├── app/
│   ├── page.tsx                          # Root — renders ChatShell
│   └── api/
│       ├── chat/route.ts                 # POST — invokes LangGraph agent, returns streaming HTTP response (ReadableStream)
│       ├── conversations/
│       │   ├── route.ts                  # GET list, POST new (creates thread_id)
│       │   └── [id]/
│       │       └── route.ts             # GET thread messages from checkpointer, DELETE conversation
│       └── preferences/
│           ├── route.ts                  # GET all preferences, DELETE all
│           └── [key]/
│               └── route.ts             # DELETE single preference
├── components/
│   ├── ChatShell.tsx                     # Layout: sidebar + chat column
│   ├── ConversationSidebar.tsx           # Thread list + New chat button
│   ├── MessageList.tsx                   # Renders full message history
│   ├── MessageBubble.tsx                 # Text bubble or ProductGrid switch
│   ├── ProductCard.tsx                   # Single product widget (clickable)
│   ├── ProductGrid.tsx                   # Inline grid of ProductCards
│   ├── ProductDetailModal.tsx            # Modal overlay with full product details
│   └── PreferencesPanel.tsx             # Sidebar section — inferred preferences with delete controls
├── lib/
│   ├── agent.ts                          # LangGraph graph definition
│   ├── checkpointer.ts                   # SqliteSaver singleton (checkpointer + Store)
│   ├── store.ts                          # LangGraph Store — cross-thread user preferences
│   ├── tools.ts                          # Four DummyJSON tool definitions
│   ├── dummyjson.ts                      # Typed fetch client for DummyJSON API
│   └── conversations.ts                  # Metadata table queries (title, thread_id)
data/
└── bazak.db                              # SQLite file (gitignored)
```

### Storage — three concerns, same SQLite file

**LangGraph checkpointer** owns all agent state per thread: messages, tool calls, intermediate steps, and the conversation summary. Never touched directly by application code.

**LangGraph Store** owns cross-thread user preferences (e.g. budget range, preferred brands, categories browsed). Stored under a fixed namespace `("user", "preferences")`. The agent node reads from the Store on every invocation and injects relevant preferences into the system prompt. The agent writes to the Store when it infers a new stable preference from the conversation (e.g. "user mentioned they prefer Nike" or "user consistently filters under $100"). Preferences are exposed to the client via `/api/preferences` and can be individually deleted or cleared entirely.

**Conversations metadata table** (managed by `lib/conversations.ts`) owns only `(id, thread_id, title, created_at)` — enough to populate the sidebar. Application code only reads/writes this table.

```sql
CREATE TABLE conversations (
  id         TEXT PRIMARY KEY,   -- UUID
  thread_id  TEXT UNIQUE NOT NULL,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

---

## LangGraph Graph

### State shape

```typescript
const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  summary: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
});
```

### Nodes

**`agent` node**
- Reads user preferences from the LangGraph Store and injects them into the system prompt alongside `state.summary`
- Calls `AGENT_MODEL` (default: `gpt-5.4-mini`) with the four tools bound
- Returns the LLM response (text or one or more tool calls)
- After responding, writes any newly inferred stable preferences back to the Store

**`tools` node**
- Receives all tool calls from the agent's last `AIMessage`
- Executes them in parallel via `Promise.all` — if the agent called `search_products` and `browse_category` in a single turn, both DummyJSON requests fire simultaneously
- Strips heavy fields from each API response (`dimensions`, `warrantyInformation`, `sku`, `weight`) before returning
- Serializes each result into a consistent JSON shape before storing in `ToolMessage.content`:
  ```json
  { "products": [...], "total": 6 }
  ```
  On error or empty result:
  ```json
  { "products": [], "total": 0, "error": "Could not reach product catalog" }
  ```
- Returns one `ToolMessage` per tool call

**`summarize` node**
- Called only when message count exceeds `SUMMARY_MESSAGE_THRESHOLD` (default: 10)
- Calls `SUMMARY_MODEL` (default: `gpt-5.4-nano`) to summarize the conversation so far
- Stores result in `state.summary`
- Trims `state.messages` to the last 4 messages
- The summary is injected into every subsequent agent call via `SystemMessage`

### Graph edges

```
START → agent
agent → tools              (if LLM returned one or more tool calls)
agent → should_summarize   (if no tool call — turn is complete)
tools → agent              (all parallel tool calls complete before agent resumes)
should_summarize → summarize   (if message count > SUMMARY_MESSAGE_THRESHOLD)
should_summarize → END         (otherwise)
summarize → END
```

`should_summarize` is a conditional edge routing function, not a node. It inspects `state.messages.length` and returns either `"summarize"` or `END`.

Parallel tool execution is handled inside the `tools` node via `Promise.all` — LangGraph's `ToolNode` runs all tool calls from the preceding `AIMessage` concurrently and collects their `ToolMessage` results before returning control to the agent.

### Checkpointing

`SqliteSaver` is configured as the graph's checkpointer. After every node execution, LangGraph snapshots the full state (including `summary`) to `data/bazak.db`. Resuming a thread requires only the `thread_id` — LangGraph replays from the last checkpoint automatically.

### Streaming

The graph is invoked with `streamMode: "messages"`:

- **`"messages"`** — emits `AIMessageChunk` objects token-by-token as the LLM generates them, plus complete `ToolMessage` objects when a tool node finishes. Each stream event is a `[message, metadata]` tuple; the route destructures the first element. This drives the chat UI's real-time rendering.

The API route pipes the async iterator into a `ReadableStream`, serializing each chunk as a newline-delimited JSON line with a `type` discriminator:

| Chunk type | Payload | Frontend action |
|---|---|---|
| `token` | `{ content: string }` | Append to streaming text bubble |
| `tool_call` | `{ name: string }` | Show `"Searching..."` indicator |
| `tool_result` | `{ products: Product[] }` | Render `ProductGrid` |
| `preference_added` | `{ key: string, value: string }` | Show dismissible chip, refresh `PreferencesPanel` |
| `title_update` | `{ title: string }` | Update conversation title in sidebar |
| `done` | — | Finalize message, stop spinner |

The client reads `response.body` via `ReadableStream.getReader()`, parses each newline-delimited chunk, and dispatches to the appropriate UI update.

---

## Tools

All tools default to `limit: TOOL_RESULTS_LIMIT` (default: 10). The agent is instructed via system prompt to present only the 3–5 most relevant results to the user.

### `search_products`
Maps to `GET /products/search?q={query}&limit={limit}`

Used when the user describes a product by name or attributes ("wireless headphones", "blue sneakers").

### `browse_category`
Maps to `GET /products/category/{slug}?limit={limit}&sortBy=rating&order=desc`

Used when the user expresses a general category interest ("show me beauty products", "what phones do you have?"). Sorted by rating descending so the best-rated items are retrieved first.

### `list_categories`
Maps to `GET /products/categories`

Used when the user asks what's available ("what do you sell?", "what categories do you have?"). Returns category names and slugs.

### `get_product`
Maps to `GET /products/{id}`

Used when the user asks for details on a specific product ("tell me more about the second one"). The agent resolves the product ID from the conversation history.

---

## Intent Extraction

Intent extraction is not a separate pipeline step. The LLM is the intent extractor. On each agent node invocation, the model receives the system prompt, conversation history (or summary + recent messages), and the new user message. It decides whether to respond directly or call a tool — and that decision is the intent extraction.

The system prompt describes each tool's purpose precisely enough that the LLM matches intent to tool:

> *"Use `browse_category` when the user expresses a general interest in a product type. Use `search_products` when the user describes specific product attributes or a product name. Use `list_categories` when the user asks what's available."*

Multi-turn references ("the second one", "something cheaper") resolve correctly because prior tool results remain in `state.messages`.

---

## Relevance Filtering

The DummyJSON API has no semantic ranking or price filtering. Relevance is handled in two layers:

1. **Retrieve reasonably:** Tools fetch at most `TOOL_RESULTS_LIMIT` results (default: 10). `browse_category` uses `sortBy=rating&order=desc` so the best-rated products arrive first.
2. **LLM filters:** The agent node's LLM call is the rerank step. The system prompt instructs the model to select and present only the 3–5 most relevant products given the user's full intent (including price constraints, stated preferences, and conversation context).

Heavy product fields (`dimensions`, `warrantyInformation`, `sku`, `weight`) are stripped from tool results before the LLM sees them to reduce token usage and keep the signal clean.

---

## Product State & Rendering

### How products are stored in state

Products are not a separate field in `StateAnnotation`. They live inside `ToolMessage.content` within `state.messages`, serialized as JSON. After a product tool call, the message sequence in state is:

```
HumanMessage       "show me headphones"
AIMessage          tool_calls: [{ name: "search_products", args: { query: "headphones" } }]
ToolMessage        name: "search_products", content: '{ "products": [...], "total": 6 }'
AIMessage          "Here are the top 3 options for you:"
```

The consistent `{ products, total, error? }` shape is set by the tools node for all four product tools. This gives the LLM clear signal (non-empty vs empty vs error) and gives the frontend a reliable structure to parse without tool-specific logic.

### Two rendering paths

**During active streaming** — the API route parses each `ToolMessage` from the LangGraph stream and emits a `tool_result` chunk containing the products array. The frontend renders `ProductGrid` immediately from the stream without waiting for the full response.

**When resuming a thread** — the frontend loads the full message list from the checkpoint via `GET /api/conversations/[id]`. `MessageBubble` inspects each message and applies the rendering rules below to reconstruct the full conversation, including any `ProductGrid` instances.

### `MessageBubble` rendering rules

| Message type | Condition | Renders |
|---|---|---|
| `HumanMessage` | — | User text bubble (right-aligned) |
| `AIMessage` | has text content | Assistant text bubble (left-aligned) |
| `AIMessage` | tool calls only, no text | Hidden — implementation detail, not shown |
| `ToolMessage` | `name` in product tools, `products.length > 0` | `ProductGrid` |
| `ToolMessage` | `products.length === 0` or `error` present | Nothing rendered — agent's following `AIMessage` handles the UX |

Product tools are: `search_products`, `browse_category`, `get_product`, `list_categories`.

---

## Memory Management

### Surfacing preferences
`GET /api/preferences` reads the LangGraph Store under the fixed `("user", "preferences")` namespace and returns the full preference map. Called on initial load to populate `PreferencesPanel` and after each `preference_added` stream chunk.

### Preference display
`PreferencesPanel` renders each preference as a labelled chip (e.g. *"Budget: under $100"*, *"Brand: Nike"*). Since preferences are LLM-inferred free-form strings, they are displayed as-is — no structured form fields. The panel is collapsible and sits below the thread list in the sidebar.

### Managing preferences
- **Delete one:** `DELETE /api/preferences/[key]` — removes a single entry from the Store. The corresponding chip is removed from `PreferencesPanel` optimistically on the client.
- **Clear all:** `DELETE /api/preferences` — wipes the entire preference namespace. `PreferencesPanel` renders empty state: *"No preferences saved yet."*

Neither delete operation involves the LLM. Both are direct Store writes from the API route.

### Tradeoff
Preferences are inferred, not explicitly set by the user. The panel makes the agent's inferences transparent and correctable, but the user cannot add preferences manually — only remove them.

---

## Error Handling

### Empty results
When a tool call returns `{ products: [], total: 0 }`, the `ToolMessage` is passed to the agent with the empty array intact. The LLM is explicitly instructed via system prompt to respond conversationally in this case — suggesting the user try different search terms, broaden their query, or offering to list available categories. The frontend renders no `ProductGrid` when the products array is empty.

### API failure
Each tool wraps its DummyJSON fetch in a try/catch. On any network error, non-2xx response, or timeout, the tool returns a structured error result rather than throwing:

```typescript
{ error: "Could not reach product catalog", products: [] }
```

This ensures the graph always receives a valid `ToolMessage` and completes normally. The agent responds gracefully — informing the user the catalog is temporarily unavailable and inviting them to try again. No graph crash, no unhandled rejection, no retry loop.

### System prompt instruction
The agent is explicitly instructed: *"If a tool returns no results or an error, respond conversationally. Suggest alternatives, offer to search with different terms, or ask the user to clarify their request. Never render an empty product list — always provide a helpful next step."*

### Chat input errors
If the `/api/chat` route itself fails (e.g. the LLM API is unreachable), the frontend displays an inline error message in the chat column and re-enables the input so the user can retry. The failed message is not persisted to the thread.

---

## UI Layout

Single-column chat with a persistent left sidebar on desktop.

**Sidebar (`ConversationSidebar`):**
- "New chat" button at the top
- Thread list grouped by recency (Today / Yesterday / Older)
- Active thread highlighted
- Clicking a past thread loads its messages via `GET /api/conversations/[id]`
- `PreferencesPanel` rendered below the thread list — collapsible section showing inferred preferences as chips with individual delete buttons and a "Clear all" option

**Chat column:**
- User messages right-aligned, assistant messages left-aligned
- When the assistant's response includes tool results, `MessageBubble` renders a `ProductGrid` instead of a text bubble
- Follow-up conversational responses (no tool calls) render as plain text bubbles
- Streaming: assistant text streams token-by-token via HTTP streaming (`ReadableStream` response, consumed via `fetch` + `response.body` reader on the client)
- When the agent infers a new preference during a turn, the stream includes a `preference_added` chunk — the frontend renders a dismissible chip above the input bar: *"Noted: you prefer items under $100"*. The `PreferencesPanel` refreshes automatically.

**`ProductCard` displays:** thumbnail image, title, truncated description (2 lines), price, rating, availability status. Clicking a card opens `ProductDetailModal`.

**`ProductDetailModal`:** fetches `GET /products/{id}` directly from the frontend (no agent involved). Displays the full product: all images (gallery), full description, price, discount percentage, rating, stock count, brand, tags, shipping information, and warranty information. Closes on backdrop click or ESC.

---

## Data Flow

### Sending a new message
1. Frontend POSTs `{ threadId, message }` to `/api/chat`
2. Route appends a `HumanMessage` and invokes the graph with `streamMode: ["messages", "updates"]` and `thread_id` config
3. Graph runs: agent reads Store preferences → LLM responds, calls tools → tools execute in parallel if called → agent resumes → summarize check → END
4. LangGraph checkpoints state and updates the Store after each node
5. Route pipes the LangGraph async iterator into a `ReadableStream`, encoding each chunk as newline-delimited JSON with a `type` field
6. Frontend dispatches: `token` → append text, `tool_call` → show "Searching…", `tool_result` → render `ProductGrid`, `done` → finalize

### Resuming a thread
1. User clicks a past thread in the sidebar
2. Frontend GETs `/api/conversations/[id]`
3. Route reads the checkpoint for `thread_id` from SQLite and returns the message list
4. Chat renders from history — no LLM invocation

### New conversation
1. Frontend POSTs to `/api/conversations`
2. Server generates a UUID `thread_id`, inserts a placeholder title (`"New conversation"`), returns `{ threadId, id }`
3. Frontend begins sending messages with that `thread_id`
4. After the first assistant response completes, the chat route calls `SUMMARY_MODEL` with the first user message to generate a 4–6 word title, updates the `conversations` table, and emits a `title_update` chunk
5. Frontend receives `title_update` and refreshes the sidebar — no page reload needed

`conversations.ts` exposes an `updateConversationTitle(id, title)` function for this.

---

## Testing

**Test stack additions:** `@testing-library/react`, `@testing-library/user-event` (component tests), `msw` (API and fetch mocking).

---

### Unit tests (Vitest)

**`lib/tools.test.ts`** — one `describe` block per tool, `fetch` mocked:
- Each tool constructs the correct DummyJSON URL with expected query params
- `search_products` includes `q` and `limit` params; respects `TOOL_RESULTS_LIMIT` env var
- `browse_category` includes `sortBy=rating&order=desc`
- `get_product` includes product ID in path
- On fetch failure, each tool returns `{ products: [], total: 0, error: "..." }` rather than throwing

**`lib/dummyjson.test.ts`** — field stripping:
- Heavy fields removed from response: `dimensions`, `warrantyInformation`, `sku`, `weight`
- Essential fields preserved: `id`, `title`, `description`, `price`, `rating`, `thumbnail`, `images`, `brand`, `tags`, `stock`, `availabilityStatus`, `discountPercentage`, `category`

**`lib/conversations.test.ts`** — in-memory SQLite:
- Insert creates a row with correct `id`, `thread_id`, `title`, `created_at`
- List returns rows ordered by `created_at` descending
- Delete removes the row; subsequent list does not include it

**`lib/store.test.ts`**:
- Read returns empty object when no preferences stored
- Write stores key/value under `("user", "preferences")` namespace
- Delete removes a single key; others remain
- Clear all removes every entry; subsequent read returns empty

**`lib/agent.test.ts`** — conditional edge functions only (no LLM calls):
- `should_summarize` returns `"summarize"` when `messages.length > SUMMARY_MESSAGE_THRESHOLD`
- `should_summarize` returns `END` when at or below threshold

---

### Integration tests (Vitest + MemorySaver + msw)

Instantiate the full LangGraph graph with `MemorySaver` (no SQLite) and `msw` intercepting all DummyJSON requests.

**Core product discovery flow:**
- `"show me phones under $500"` → `search_products` called with a query containing "phone"; final state contains `HumanMessage`, `AIMessage(tool_call)`, `ToolMessage(products)`, `AIMessage(text)`
- `"what categories do you have?"` → `list_categories` called; response lists category names
- `"show me items in electronics"` → `browse_category` called with an electronics-related slug

**Multi-turn context:**
- Send product search, then `"tell me more about the first one"` → `get_product` called with the ID from the prior `ToolMessage`

**Empty and error results:**
- DummyJSON returns `{ products: [], total: 0 }` → final `AIMessage` contains no product data; graph completes without error
- DummyJSON throws a network error → tool returns `{ products: [], error: "..." }`; graph completes; final `AIMessage` is a graceful fallback

**Parallel tool execution:**
- Agent emits two tool calls in a single `AIMessage` → both DummyJSON requests fire; state contains two `ToolMessage` entries before the next `AIMessage`

**Summarization:**
- Send `SUMMARY_MESSAGE_THRESHOLD + 2` messages → `summarize` node fires; `state.summary` is a non-empty string; `state.messages.length` equals 4

**Human-in-the-loop:**
**Cross-thread Store:**
- Send a message expressing a preference ("I always buy Nike") → Store entry written under `("user", "preferences")`
- Create a new thread with the same Store instance → agent system prompt for the new thread includes the stored preference

---

### API route tests (Vitest + msw)

`msw` intercepts all outbound DummyJSON fetches. Real Next.js route handlers invoked directly.

**`POST /api/chat`:**
- New message with valid `threadId` → streamed response body contains `tool_result` chunk followed by `token` chunks and `done` chunk
- Missing `threadId` → 400 response

**`GET /api/conversations`:** returns array ordered by `created_at` descending

**`POST /api/conversations`:** creates new thread; response contains `{ id, threadId }`; subsequent `GET /api/conversations` includes it

**`GET /api/conversations/[id]`:** returns message list from the messages table; unknown `id` → 404

**`DELETE /api/conversations/[id]`:** removes metadata row; subsequent `GET /api/conversations` excludes it

**`GET /api/preferences`:** returns current Store contents as key/value map

**`DELETE /api/preferences`:** clears all entries; subsequent GET returns empty object

**`DELETE /api/preferences/[key]`:** removes specific key; others remain; unknown key → 404

---

### Component tests (Vitest + React Testing Library)

**`MessageBubble`:**
- `HumanMessage` → renders user bubble (right-aligned)
- `AIMessage` with text content → renders assistant bubble
- `AIMessage` with tool calls only and no text → renders nothing
- `ToolMessage` from a product tool with non-empty `products` → renders `ProductGrid`
- `ToolMessage` with `products: []` → renders nothing

**`ProductGrid`:**
- Renders correct number of `ProductCard` children matching the products array length
- Empty array → renders nothing

**`ProductDetailModal`:**
- Opens when `ProductCard` is clicked
- Displays title, price, full description, rating, brand, and availability
- Closes on backdrop click
- Closes on ESC keypress

**`PreferencesPanel`:**
- Renders one chip per preference entry
- Clicking delete on a chip calls `DELETE /api/preferences/[key]` and removes the chip
- "Clear all" calls `DELETE /api/preferences` and renders empty state
- Empty state message shown when preference map is empty

---

## Future Features

### Human-in-the-Loop Clarification

When the user's request is too vague to retrieve meaningful products ("show me something nice", "I need a gift"), a future version of the agent could pause and ask a clarifying question before proceeding.

**Proposed mechanism:** LangGraph's `interrupt()` primitive pauses graph execution at any node and serializes the interrupted state to the checkpoint. The agent would detect a vague request (via a `request_clarification` pseudo-tool call), call `interrupt({ question })`, and halt. The API route would detect the interrupt and emit an `interrupt` chunk to the frontend. The frontend would render the question as an assistant bubble and, when the user responds, POST with `resume: true`, causing the route to call `graph.stream(new Command({ resume: userMessage }), config)` to resume from the saved checkpoint.

**Why deferred:** The interrupt/resume flow adds meaningful complexity — a two-mode API route, extra client state, and a separate message-persistence concern (interrupted questions live in `state.tasks`, not `state.messages`). The agent handles vague requests adequately today by responding conversationally and inviting the user to be more specific. Human-in-the-loop is a worthwhile investment once the core product discovery UX is stable.

---

## Tradeoffs & Limitations

- **Summary is lossy.** Once messages are summarized and trimmed, the exact wording of earlier turns is gone. For a shopping assistant this is acceptable — product IDs from tool results are still in the retained messages.
- **DummyJSON has no price filter.** Price constraints are handled by the LLM post-retrieval, not at the API level. If the catalog were larger, this would be a meaningful limitation.
- **No authentication.** The app is local-only; all conversations belong to a single user. The Store uses a fixed namespace — no user isolation needed.
- **Store preferences are LLM-inferred.** The agent writes preferences based on what it interprets from conversation context. Inferences can be wrong; there is no explicit user preference UI to correct them.
- **`gpt-5.4-mini` / `gpt-5.4-nano` model names** are as specified in the assignment. Substitute with the closest available OpenAI model if these identifiers are not available in the API at runtime.
