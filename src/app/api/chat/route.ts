import { NextRequest } from 'next/server';
import { HumanMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import OpenAI from 'openai';
import { createGraph } from '@/lib/agent';
import { getCheckpointer } from '@/lib/checkpointer';
import { updateConversationTitle } from '@/lib/conversations';
import { PRODUCT_TOOL_NAMES } from '@/types';
import type { StreamChunk } from '@/types';

async function generateTitle(firstMessage: string): Promise<string> {
  const client = new OpenAI();
  const resp = await client.chat.completions.create({
    model: process.env.SUMMARY_MODEL ?? 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `Generate a 4-6 word title for a shopping conversation that started with: "${firstMessage}". Reply with only the title, no punctuation.`,
      },
    ],
    max_tokens: 20,
  });
  return resp.choices[0].message.content?.trim() ?? firstMessage.slice(0, 60);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { threadId, message, resume, convId, isFirstMessage } = body as {
    threadId?: string;
    message: string;
    resume?: boolean;
    convId?: string;
    isFirstMessage?: boolean;
  };

  if (!threadId) {
    return Response.json({ error: 'threadId required' }, { status: 400 });
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

        const graphStream = graph.stream(input, config);

        for await (const [chunk] of graphStream as AsyncIterable<[any, any]>) {
          if (!chunk) continue;
          const type = chunk._getType?.();

          if (type === 'AIMessageChunk' || type === 'ai') {
            if (chunk.content) send({ type: 'token', content: chunk.content });
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
            const title = await generateTitle(message);
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
