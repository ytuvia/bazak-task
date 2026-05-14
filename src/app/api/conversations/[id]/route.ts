import { NextRequest } from 'next/server';
import { getConversationById, deleteConversation } from '@/lib/conversations';
import { getCheckpointer, deleteCheckpointsByThreadId } from '@/lib/checkpointer';
import { createGraph } from '@/lib/agent';
import type { AgentState } from '@/lib/agent';
import type { SerializedMessage } from '@/types';
import { HumanMessage, AIMessage, AIMessageChunk, ToolMessage, BaseMessage } from '@langchain/core/messages';

function serializeMessage(msg: BaseMessage): SerializedMessage {
  const role =
    msg instanceof HumanMessage ? 'human' :
    (msg instanceof AIMessage || msg instanceof AIMessageChunk) ? 'ai' : 'tool';

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
      ? { toolCallId: toolMsg.tool_call_id, toolName: toolMsg.name }
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
  const state = await createGraph(checkpointer).getState(config);

  if (!state?.values) return Response.json([]);

  const messages: BaseMessage[] = (state.values as AgentState).messages ?? [];
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
  deleteCheckpointsByThreadId(conversation.threadId);
  return Response.json({ ok: true });
}
