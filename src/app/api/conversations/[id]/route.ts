import { NextRequest } from 'next/server';
import { getConversationById, deleteConversation } from '@/lib/conversations';
import { getCheckpointer } from '@/lib/checkpointer';
import type { SerializedMessage } from '@/types';
import { HumanMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';

function serializeMessage(msg: BaseMessage): SerializedMessage {
  const role =
    msg instanceof HumanMessage ? 'human' :
    msg instanceof AIMessage ? 'ai' : 'tool';

  const aiMsg = msg as AIMessage;
  const toolMsg = msg as ToolMessage;

  return {
    id: msg.id ?? '',
    role,
    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    ...(role === 'ai' && aiMsg.tool_calls?.length
      ? { toolCalls: aiMsg.tool_calls.map(tc => ({ name: tc.name, args: tc.args as Record<string, unknown>, id: tc.id ?? '' })) }
      : {}),
    ...(role === 'tool'
      ? { toolCallId: toolMsg.tool_call_id, toolName: (toolMsg as any).name }
      : {}),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversation = getConversationById(id);
  if (!conversation) return Response.json({ error: 'Not found' }, { status: 404 });

  const checkpointer = getCheckpointer();
  const config = { configurable: { thread_id: conversation.threadId } };
  const state = await checkpointer.get(config);

  if (!state) return Response.json([]);

  const messages: BaseMessage[] = state.channel_values?.messages ?? [];
  return Response.json(messages.map(serializeMessage));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversation = getConversationById(id);
  if (!conversation) return Response.json({ error: 'Not found' }, { status: 404 });
  deleteConversation(id);
  return Response.json({ ok: true });
}
