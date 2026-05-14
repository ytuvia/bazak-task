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
      {isStreaming && !streamingText && (
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-bl-sm bg-slate-700 px-4 py-3">
            <div className="flex gap-1 items-center">
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
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
