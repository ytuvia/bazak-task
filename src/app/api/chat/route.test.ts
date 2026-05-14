import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AIMessageChunk, ToolMessage } from '@langchain/core/messages';

const { mockGraph, mockUpdateConversationTitle, MockOpenAI } = vi.hoisted(() => {
  const mockUpdateConversationTitle = vi.fn();
  const mockGraph = {
    stream: vi.fn(async function* () {
      yield [new AIMessageChunk({ content: 'Here are some phones', tool_call_chunks: [] })];
      yield [new ToolMessage({ content: JSON.stringify({ products: [{ id: 1, title: 'iPhone' }], total: 1 }), tool_call_id: 'call-1', name: 'search_products' })];
    }),
    getState: vi.fn(async () => ({ values: { messages: [], summary: '' } })),
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

import type { StreamChunk } from '@/types';

async function collectChunks(res: Response): Promise<StreamChunk[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const chunks: StreamChunk[] = [];
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    done = d;
    if (value) {
      const text = decoder.decode(value);
      for (const line of text.split('\n').filter(Boolean)) {
        chunks.push(JSON.parse(line) as StreamChunk);
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
    expect(chunks.some(c => c.type === 'token')).toBe(true);
    expect(chunks.some(c => c.type === 'tool_result')).toBe(true);
    expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
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
    const titleChunk = chunks.find(c => c.type === 'title_update');
    expect(titleChunk?.title).toBe('Wireless headphones search');
    expect(mockUpdateConversationTitle).toHaveBeenCalledWith('conv-1', 'Wireless headphones search');
  });

});
