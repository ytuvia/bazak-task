import { NextRequest } from 'next/server';
import { HumanMessage, AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import OpenAI from 'openai';
import { createGraph } from '@/lib/agent';
import { getCheckpointer } from '@/lib/checkpointer';
import { updateConversationTitle } from '@/lib/conversations';
import { PRODUCT_TOOL_NAMES } from '@/types';
import type { AgentState } from '@/lib/agent';
import type { StreamChunk } from '@/types';

function isProductToolName(name: string): boolean {
  return (PRODUCT_TOOL_NAMES as readonly string[]).includes(name);
}

async function generateTitle(userMessage: string, aiResponse: string): Promise<string> {
  const client = new OpenAI();
  const context = aiResponse
    ? `User: "${userMessage}"\nAssistant: "${aiResponse.slice(0, 300)}"`
    : `User: "${userMessage}"`;
  const resp = await client.chat.completions.create({
    model: process.env.SUMMARY_MODEL ?? 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `Generate a 4-6 word title for a shopping conversation. Use the context below to capture what the conversation is actually about, not just the opening greeting.\n\n${context}\n\nReply with only the title, no punctuation.`,
      },
    ],
    max_completion_tokens: 20,
  });
  return resp.choices[0].message.content?.trim() ?? userMessage.slice(0, 60);
}

export async function POST(req: NextRequest) {
  let body: { threadId?: string; message: string; convId?: string; isFirstMessage?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { threadId, message, convId, isFirstMessage } = body;

  if (!threadId) {
    return Response.json({ error: 'threadId required' }, { status: 400 });
  }

  if (!message || typeof message !== 'string') {
    return Response.json({ error: 'message required' }, { status: 400 });
  }

  const checkpointer = getCheckpointer();
  const graph = createGraph(checkpointer);
  const config = { configurable: { thread_id: threadId }, streamMode: 'messages' as const };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: StreamChunk) => {
        controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
      };

      try {
        const input = { messages: [new HumanMessage(message)] };

        const graphStream = await graph.stream(input, config);

        let tokensSent = false;

        for await (const [chunk] of graphStream as unknown as AsyncIterable<[AIMessageChunk | ToolMessage]>) {
          if (!chunk) continue;

          if (chunk instanceof AIMessageChunk) {
            if (chunk.content) {
              send({ type: 'token', content: typeof chunk.content === 'string' ? chunk.content : '' });
              tokensSent = true;
            }
            for (const tc of chunk.tool_call_chunks ?? []) {
              if (tc.name && isProductToolName(tc.name)) {
                send({ type: 'tool_call', name: tc.name });
              }
            }
          }

          if (chunk instanceof ToolMessage) {
            try {
              const parsed = JSON.parse(typeof chunk.content === 'string' ? chunk.content : '{}') as Record<string, unknown>;
              if (chunk.name === 'save_preference' && parsed.saved) {
                send({ type: 'preference_added', key: parsed.key as string, value: parsed.value as string });
              } else if (chunk.name && isProductToolName(chunk.name) && Array.isArray(parsed.products) && parsed.products.length > 0) {
                send({ type: 'tool_result', products: parsed.products as StreamChunk['products'] });
              }
            } catch (err) {
              console.error('[chat] failed to parse tool message content:', err);
            }
          }
        }

        // Fallback: if no tokens streamed, pull the final AI message from state
        if (!tokensSent) {
          const state = await graph.getState(config);
          const msgs = (state.values as AgentState).messages ?? [];
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg instanceof AIMessage && typeof lastMsg.content === 'string' && lastMsg.content) {
            send({ type: 'token', content: lastMsg.content });
          }
        }

        // Generate title after first assistant response
        if (isFirstMessage && convId) {
          try {
            const state = await graph.getState(config);
            const allMsgs = (state.values as AgentState).messages ?? [];
            const lastAI = [...allMsgs].reverse().find(
              (m): m is AIMessage => m instanceof AIMessage && typeof m.content === 'string' && !!m.content
            );
            const aiResponse = typeof lastAI?.content === 'string' ? lastAI.content : '';
            const title = await generateTitle(message, aiResponse);
            updateConversationTitle(convId, title);
            send({ type: 'title_update', title });
          } catch (err) {
            console.error('[chat] title generation failed:', err);
          }
        }

        send({ type: 'done' });
      } catch (err) {
        console.error('[chat] stream handler failed:', err);
        send({ type: 'error', message: 'Request failed' });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
