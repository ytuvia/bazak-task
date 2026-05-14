import { NextRequest } from 'next/server';
import { HumanMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import OpenAI from 'openai';
import { createGraph } from '@/lib/agent';
import { getCheckpointer } from '@/lib/checkpointer';
import { updateConversationTitle } from '@/lib/conversations';
import { PRODUCT_TOOL_NAMES } from '@/types';
import type { StreamChunk } from '@/types';

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
  let body: { threadId?: string; message: string; resume?: boolean; convId?: string; isFirstMessage?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { threadId, message, resume, convId, isFirstMessage } = body;

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
        const input = resume
          ? new Command({ resume: message })
          : { messages: [new HumanMessage(message)] };

        const graphStream = await graph.stream(input as any, config);

        let tokensSent = false;

        for await (const [chunk] of graphStream as unknown as AsyncIterable<[any, any]>) {
          if (!chunk) continue;
          const type = chunk._getType?.();
          if (type === 'AIMessageChunk' || type === 'ai') {
            if (chunk.content) {
              send({ type: 'token', content: chunk.content });
              tokensSent = true;
            }
            for (const tc of chunk.tool_call_chunks ?? []) {
              if (tc.name && PRODUCT_TOOL_NAMES.includes(tc.name as any)) {
                send({ type: 'tool_call', name: tc.name });
              }
            }
          }

          if (type === 'tool') {
            try {
              const parsed = JSON.parse(chunk.content);
              if (chunk.name === 'save_preference' && parsed.saved) {
                send({ type: 'preference_added', key: parsed.key, value: parsed.value });
              } else if (
                PRODUCT_TOOL_NAMES.includes(chunk.name as any) &&
                parsed.products?.length > 0
              ) {
                send({ type: 'tool_result', products: parsed.products });
              }
            } catch {
              // non-JSON tool content, skip
            }
          }
        }

        // Check for interrupt after stream ends
        const state = await graph.getState(config);

        // Fallback: if no tokens streamed, pull the final AI message from state
        if (!tokensSent) {
          const msgs: any[] = (state.values as any)?.messages ?? [];
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?._getType?.() === 'ai' && typeof lastMsg.content === 'string' && lastMsg.content) {
            send({ type: 'token', content: lastMsg.content });
          }
        }
        const interrupts = state.tasks.flatMap((t: any) => t.interrupts ?? []);
        if (interrupts.length > 0) {
          const value = interrupts[0].value;
          send({
            type: 'interrupt',
            question: typeof value === 'string' ? value : (value?.question ?? String(value)),
          });
        }

        // Generate and persist title after first assistant response
        if (isFirstMessage && convId && !resume) {
          try {
            const allMsgs: any[] = (state.values as any)?.messages ?? [];
            const lastAI = [...allMsgs].reverse().find(
              (m: any) => m._getType?.() === 'ai' && typeof m.content === 'string' && m.content
            );
            const aiResponse = lastAI?.content ?? '';
            const title = await generateTitle(message, aiResponse);
            updateConversationTitle(convId, title);
            send({ type: 'title_update', title });
          } catch {
            // title generation is best-effort
          }
        }

        send({ type: 'done' });
      } catch {
        send({ type: 'error', message: 'Request failed' });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
