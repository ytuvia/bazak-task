import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { getDb } from './db';
import type { Conversation } from '@/types';

export function createConversationDb(db: Database.Database, title: string): { id: string; threadId: string } {
  const id = randomUUID();
  const threadId = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO conversations (id, thread_id, title, created_at) VALUES (?, ?, ?, ?)').run(id, threadId, title, createdAt);
  return { id, threadId };
}

export function listConversationsDb(db: Database.Database): Conversation[] {
  return db.prepare('SELECT id, thread_id AS threadId, title, created_at AS createdAt FROM conversations ORDER BY created_at DESC').all() as Conversation[];
}

export function getConversationByIdDb(db: Database.Database, id: string): Conversation | undefined {
  return db.prepare('SELECT id, thread_id AS threadId, title, created_at AS createdAt FROM conversations WHERE id = ?').get(id) as Conversation | undefined;
}

export function getConversationByThreadIdDb(db: Database.Database, threadId: string): Conversation | undefined {
  return db.prepare('SELECT id, thread_id AS threadId, title, created_at AS createdAt FROM conversations WHERE thread_id = ?').get(threadId) as Conversation | undefined;
}

export function deleteConversationDb(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

export function updateConversationTitleDb(db: Database.Database, id: string, title: string): void {
  db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, id);
}

export const createConversation = (title: string) => createConversationDb(getDb(), title);
export const listConversations = () => listConversationsDb(getDb());
export const getConversationById = (id: string) => getConversationByIdDb(getDb(), id);
export const getConversationByThreadId = (threadId: string) => getConversationByThreadIdDb(getDb(), threadId);
export const deleteConversation = (id: string) => deleteConversationDb(getDb(), id);
export const updateConversationTitle = (id: string, title: string) => updateConversationTitleDb(getDb(), id, title);
