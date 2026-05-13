import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGraph, mockUpdateConversationTitle, MockOpenAI } = vi.hoisted(() => {
  const mockUpdateConversationTitle = vi.fn();
  const mockGraph = {
    stream: vi.fn(async function* () {
      yield [{ _getType: () => 'AIMessageChunk', content: 'Here are some phones', tool_call_chunks: [] }, {}];
      yield [{ _getType: () => 'tool', name: 'search_products', content: JSON.stringify({ products: [{ id: 1, title: 'iPhone' }], total: 1 }) }, {}];
    }),
    getState: vi.fn(async () => ({ tasks: [] })),
  };
  const MockOpenAI = vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: 'Wireless headphones search' } }],
          })),
        },
      },
    };
  });
  return { mockGraph, mockUpdateConversationTitle, MockOpenAI };
});

vi.mock('@/lib/agent', () => ({ createGraph: vi.fn(() => mockGraph) }));
vi.mock('@/lib/checkpointer', () => ({ getCheckpointer: vi.fn(() => ({})) }));
vi.mock('@/lib/conversations', () => ({
  updateConversationTitle: mockUpdateConversationTitle,
}));
vi.mock('openai', () => ({ default: MockOpenAI }));

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
