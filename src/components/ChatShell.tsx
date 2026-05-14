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
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [streamingText, setStreamingText] = useState('');
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
    setMessages([]);
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/conversations/${conv.id}`);
      setMessages(res.ok ? await res.json() : []);
    } finally {
      setIsLoadingHistory(false);
    }
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

    const isFirstMessage = messages.length === 0;

    if (!threadId) {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New conversation' }),
      });
      if (!res.ok) {
        setError('Could not start a new conversation. Please try again.');
        return;
      }
      const created = await res.json();
      threadId = created.threadId;
      convId = created.id;
      setActiveThreadId(threadId);
      setActiveConvId(convId);
      await loadConversations();
    }

    const userMessage: SerializedMessage = {
      id: crypto.randomUUID(),
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
        body: JSON.stringify({ threadId, message: input, convId, isFirstMessage }),
      });

      if (!res.ok || !res.body) throw new Error('Request failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accText = '';

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
              id: crypto.randomUUID(),
              role: 'tool',
              content: JSON.stringify({ products: chunk.products, total: chunk.products.length }),
              toolName: chunk.name ?? 'search_products',
            };
            setMessages(prev => [...prev, toolMsg]);
          }

          if (chunk.type === 'preference_added' && chunk.key && chunk.value) {
            setPreferenceNotice(`Noted: ${chunk.key}: ${chunk.value}`);
            setTimeout(() => setPreferenceNotice(null), 4000);
            await loadPreferences();
          }

          if (chunk.type === 'title_update' && chunk.title) {
            setConversations(prev =>
              prev.map(c => (c.id === convId ? { ...c, title: chunk.title! } : c))
            );
          }

          if (chunk.type === 'done') {
            if (accText) {
              const aiMsg: SerializedMessage = {
                id: crypto.randomUUID(),
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
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [input, isStreaming, activeThreadId, activeConvId, messages, loadConversations, loadPreferences]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDeletePreference = async (key: string) => {
    try {
      await fetch(`/api/preferences/${encodeURIComponent(key)}`, { method: 'DELETE' });
      await loadPreferences();
    } catch {
      setError('Could not delete preference. Please try again.');
    }
  };

  const handleClearPreferences = async () => {
    try {
      await fetch('/api/preferences', { method: 'DELETE' });
      await loadPreferences();
    } catch {
      setError('Could not clear preferences. Please try again.');
    }
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

        {isLoadingHistory ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Loading…
          </div>
        ) : messages.length === 0 && !isStreaming ? (
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
              placeholder="Ask about products…"
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
