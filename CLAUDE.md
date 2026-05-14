# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start Next.js dev server (http://localhost:3000)
npm test             # run all tests once (vitest)
npm run test:watch   # watch mode
npm run lint         # ESLint
npm run build        # production build
```

Run a single test file:
```bash
npx vitest run src/lib/agent.test.ts
```

Run tests matching a name pattern:
```bash
npx vitest run --reporter=verbose -t "search_products"
```

Integration tests in `src/integration/` call the real OpenAI API and only run when `OPENAI_API_KEY` is set in the environment.

## Architecture

### Request flow

User message → `POST /api/chat` → LangGraph graph (`src/lib/agent.ts`) → tools → streamed NDJSON response

The API route streams NDJSON lines with a `type` discriminator: `token`, `tool_call`, `tool_result`, `preference_added`, `title_update`, `done`, `error`. Only tokens from the `agent` graph node are forwarded — the `summarize` node's LLM output is filtered by checking `metadata.langgraph_node` on each stream tuple.

### LangGraph graph (`src/lib/agent.ts`)

Three nodes wired as a ReAct loop:

- **`agent`** — calls `ChatOpenAI` with tools bound. Streaming enabled. Returns an `AIMessage` or `AIMessageChunk`.
- **`tools`** — `ToolNode` executes whichever tool the agent chose.
- **`summarize`** — fires when `state.messages.length > SUMMARY_MESSAGE_THRESHOLD`. Compresses the conversation into `state.summary` (not into `state.messages`). The summary is injected into the system prompt on every agent invocation via `[Internal context — do not mention…]`.

Edge routing (`shouldContinue`): after `agent`, go to `tools` if tool calls are present, else check `shouldSummarize` which goes to `summarize` or `END`. After `tools`, always back to `agent`.

Message windowing: only the last `AGENT_MESSAGE_WINDOW` (default 20) messages are passed to the LLM per turn.

### Persistence (`src/lib/db.ts`, `src/lib/checkpointer.ts`, `src/lib/store.ts`)

Single SQLite file (`data/bazak.db`) serves two purposes:

1. **LangGraph checkpointer** (`SqliteSaver`) — snapshots full graph state (messages + summary) per thread after every node. Threads survive restarts.
2. **App tables** — `conversations` (maps UUID conv IDs to LangGraph thread IDs + titles) and `user_preferences` (key/value store). Accessed via `better-sqlite3` directly.

`DB_PATH=:memory:` is set in `src/test/setup.ts` so all tests use an isolated in-memory DB.

### Tools (`src/lib/tools.ts`)

Five tools: `search_products`, `browse_category`, `list_categories`, `get_product` (all hit DummyJSON), and `save_preference` (writes to SQLite). `PRODUCT_TOOL_NAMES` in `src/types.ts` is the canonical list used by the route to decide which tool results to stream as product cards.

### Frontend (`src/components/ChatShell.tsx`)

Single client component holding all state. Reads NDJSON stream and:
- appends `token` chunks to streaming text
- renders product cards on `tool_result`
- shows a preference toast on `preference_added`
- updates conversation title on `title_update`

No global state library — state lives in `ChatShell` and is passed down as props.

### Testing

Vitest with two projects (see `vitest.config.ts`): `node` (lib + API + integration) and `jsdom` (components). MSW mocks DummyJSON endpoints with `onUnhandledRequest: 'bypass'` so integration tests can reach the real OpenAI API. `testTimeout` is 30 000 ms to accommodate live API latency.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Required |
| `AGENT_MODEL` | `gpt-5.4-mini` | Agent node model |
| `SUMMARY_MODEL` | `gpt-5.4-nano` | Summarize node + title generation |
| `SUMMARY_MESSAGE_THRESHOLD` | `10` | Messages before summarization |
| `AGENT_MESSAGE_WINDOW` | `20` | Recent messages passed to LLM per turn |
| `TOOL_RESULTS_LIMIT` | `10` | Max products per tool call |
| `DB_PATH` | `data/bazak.db` | SQLite path (`:memory:` in tests) |
| `DUMMYJSON_FETCH_TIMEOUT_MS` | `8000` | Timeout for DummyJSON API calls (ms) |
