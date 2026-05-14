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
- **Summarization node** — when a thread exceeds `SUMMARY_MESSAGE_THRESHOLD` messages, a `summarize` node compresses the conversation into a summary stored in graph state. The summary is injected into the system prompt on subsequent turns so context is preserved without growing the context window indefinitely.
- **Message windowing** — `AGENT_MESSAGE_WINDOW` (default: 20) caps how many recent messages are sent to the LLM per turn, keeping latency and cost predictable for long threads.

### Intent extraction via tool calling
There is no separate intent classifier. The LLM decides which tool to call — and that decision *is* the intent extraction. The system prompt describes when to use each of the four DummyJSON tools (`search_products`, `browse_category`, `list_categories`, `get_product`), and the model matches user queries to the right tool and parameters.

### Cross-thread memory (LangGraph Store)
A `save_preference` tool lets the agent persist stable user preferences (budget, brand, category) to a SQLite-backed key-value store. Preferences persist across conversations and are injected into the system prompt on every agent invocation. Users can view and delete preferences via the sidebar panel.

### Model selection
- `AGENT_MODEL` (default: `gpt-4o-mini`) — used for the main agent node: intent understanding, tool selection, relevance filtering, response generation.
- `SUMMARY_MODEL` (default: `gpt-4o-mini`) — used for the summarize node and title generation.

### Streaming
Responses stream token-by-token via HTTP `ReadableStream` (not SSE). The API route pipes LangGraph's async iterator into a `ReadableStream` and encodes each event as a newline-delimited JSON line with a `type` discriminator: `token`, `tool_call`, `tool_result`, `preference_added`, `title_update`, `done`, `error`. Only tokens from the `agent` node are forwarded — the `summarize` node's LLM output is filtered out so it never appears in the chat.

### Relevance filtering
DummyJSON has no semantic ranking or price filter. The agent fetches up to `TOOL_RESULTS_LIMIT` results (default 10) and the LLM selects the 3–5 most relevant to present, taking price constraints and conversation context into account.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Required. OpenAI API key. |
| `AGENT_MODEL` | `gpt-5.4-mini` | Model for agent node |
| `SUMMARY_MODEL` | `gpt-5.4-nano` | Model for summarize node and title generation |
| `SUMMARY_MESSAGE_THRESHOLD` | `10` | Messages before summarization triggers |
| `AGENT_MESSAGE_WINDOW` | `20` | Max recent messages passed to the LLM per turn |
| `TOOL_RESULTS_LIMIT` | `10` | Max products fetched per tool call |
| `DB_PATH` | `data/bazak.db` | SQLite file path |
| `DUMMYJSON_FETCH_TIMEOUT_MS` | `8000` | Timeout for DummyJSON API calls (ms) |
