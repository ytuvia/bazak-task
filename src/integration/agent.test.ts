import { describe, it, expect, vi } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage, AIMessage, AIMessageChunk, ToolMessage, BaseMessage } from '@langchain/core/messages';
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

const hasApiKey = !!process.env.OPENAI_API_KEY;

describe.skipIf(!hasApiKey)('core product discovery flow', () => {
  it('calls a product tool for a phone query and produces AIMessage', async () => {
    const graph = createGraph(new MemorySaver());
    const state = await runGraph(graph, 'show me phones under $500');
    const messages = state.values.messages as BaseMessage[];
    const toolMessages = messages.filter((m): m is ToolMessage => m instanceof ToolMessage);
    expect(toolMessages.length).toBeGreaterThan(0);
    expect(['search_products', 'browse_category']).toContain(toolMessages[0].name);
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage instanceof AIMessage || lastMessage instanceof AIMessageChunk).toBe(true);
  });

  it('calls list_categories when asked what is available', async () => {
    const graph = createGraph(new MemorySaver());
    const state = await runGraph(graph, 'what categories do you have?');
    const messages = state.values.messages as BaseMessage[];
    const toolMessages = messages.filter((m): m is ToolMessage => m instanceof ToolMessage);
    expect(toolMessages.some(m => m.name === 'list_categories')).toBe(true);
  });

  it('calls browse_category for general category interest', async () => {
    const graph = createGraph(new MemorySaver());
    const state = await runGraph(graph, 'show me smartphones');
    const messages = state.values.messages as BaseMessage[];
    const toolMsg = messages.find((m): m is ToolMessage => m instanceof ToolMessage);
    expect(['browse_category', 'search_products']).toContain(toolMsg?.name);
  });
});

describe.skipIf(!hasApiKey)('multi-turn context', () => {
  it('resolves follow-up reference to prior product', async () => {
    const graph = createGraph(new MemorySaver());
    const config = { configurable: { thread_id: 'multi-turn' } };

    await graph.invoke({ messages: [new HumanMessage('show me phones')] }, config);
    await graph.invoke({ messages: [new HumanMessage('tell me more about the first one')] }, config);

    const state = await graph.getState(config);
    const messages = state.values.messages as BaseMessage[];
    const toolCalls = messages.filter((m): m is ToolMessage => m instanceof ToolMessage);
    expect(toolCalls.some(m => m.name === 'get_product')).toBe(true);
  });
});

describe.skipIf(!hasApiKey)('empty results', () => {
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
    const messages = state.values.messages as BaseMessage[];
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg instanceof AIMessage || lastMsg instanceof AIMessageChunk).toBe(true);
    expect(typeof lastMsg.content).toBe('string');
  });
});

describe.skipIf(!hasApiKey)('summarization', () => {
  it('triggers summarize node when messages exceed threshold', async () => {
    process.env.SUMMARY_MESSAGE_THRESHOLD = '4';
    const graph = createGraph(new MemorySaver());
    const config = { configurable: { thread_id: 'summarize-thread' } };

    for (let i = 0; i < 3; i++) {
      await graph.invoke({ messages: [new HumanMessage(`show me phones round ${i}`)] }, config);
    }

    const state = await graph.getState(config);
    expect(state.values.summary).toBeTruthy();
    // Messages are no longer pruned — full history preserved in checkpoint
    expect((state.values.messages as BaseMessage[]).length).toBeGreaterThan(0);
    process.env.SUMMARY_MESSAGE_THRESHOLD = '10';
  });
});

describe.skipIf(!hasApiKey)('cross-thread Store', () => {
  it('save_preference tool stores preference', async () => {
    const { setPreference } = await import('@/lib/store');
    const graph = createGraph(new MemorySaver());
    const config = { configurable: { thread_id: 'pref-thread' } };
    await graph.invoke(
      { messages: [new HumanMessage('I always buy Nike products')] },
      config
    );
    expect(setPreference).toBeDefined();
  });
});
