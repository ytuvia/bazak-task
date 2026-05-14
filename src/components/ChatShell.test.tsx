import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatShell } from './ChatShell';
import type { Conversation } from '@/types';

vi.mock('@/components/ConversationSidebar', () => ({
  ConversationSidebar: ({ conversations, onNew }: { conversations: Conversation[]; onNew: () => void; [key: string]: unknown }) => (
    <div data-testid="sidebar">
      <button onClick={onNew} data-testid="new-chat">New chat</button>
      {conversations.map((c) => (
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
    let conversationCreated = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/conversations' && (!opts || opts.method === 'GET' || !opts.method)) {
        if (conversationCreated) {
          return { ok: true, json: async () => [{ id: 'conv-1', threadId: 'thread-1', title: 'New conversation', createdAt: new Date().toISOString() }] };
        }
        return { ok: true, json: async () => [] };
      }
      if (url === '/api/conversations' && opts?.method === 'POST') {
        conversationCreated = true;
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
