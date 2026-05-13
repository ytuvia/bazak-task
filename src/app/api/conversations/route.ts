import { NextRequest } from 'next/server';
import {
  createConversation,
  listConversations,
} from '@/lib/conversations';

export async function GET() {
  const conversations = listConversations();
  return Response.json(conversations);
}

export async function POST(req: NextRequest) {
  const { title } = await req.json();
  const { id, threadId } = createConversation(title ?? 'New conversation');
  return Response.json({ id, threadId }, { status: 201 });
}
