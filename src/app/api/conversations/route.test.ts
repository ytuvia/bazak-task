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
