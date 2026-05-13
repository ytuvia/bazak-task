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
  let title: string;
  try {
    const body = await req.json();
    title = typeof body.title === 'string' ? body.title : 'New conversation';
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { id, threadId } = createConversation(title);
  return Response.json({ id, threadId }, { status: 201 });
}
