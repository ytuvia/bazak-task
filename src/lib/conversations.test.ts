import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from './db';
import {
  createConversationDb,
  listConversationsDb,
  getConversationByIdDb,
  getConversationByThreadIdDb,
  deleteConversationDb,
  updateConversationTitleDb,
} from './conversations';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = createDb(':memory:');
});

describe('createConversationDb', () => {
  it('inserts a row and returns id and threadId', () => {
    const { id, threadId } = createConversationDb(db, 'My first chat');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(threadId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('title is persisted', () => {
    const { id } = createConversationDb(db, 'Test title');
    const conv = getConversationByIdDb(db, id);
    expect(conv?.title).toBe('Test title');
  });
});

describe('listConversationsDb', () => {
  it('returns conversations ordered by created_at descending', async () => {
    createConversationDb(db, 'First');
    await new Promise(r => setTimeout(r, 5));
    createConversationDb(db, 'Second');
    const list = listConversationsDb(db);
    expect(list[0].title).toBe('Second');
    expect(list[1].title).toBe('First');
  });
});

describe('deleteConversationDb', () => {
  it('removes the row', () => {
    const { id } = createConversationDb(db, 'To delete');
    deleteConversationDb(db, id);
    expect(getConversationByIdDb(db, id)).toBeUndefined();
  });
  it('list no longer includes deleted conversation', () => {
    const { id } = createConversationDb(db, 'Gone');
    deleteConversationDb(db, id);
    expect(listConversationsDb(db).find(c => c.id === id)).toBeUndefined();
  });
});

describe('getConversationByThreadIdDb', () => {
  it('finds a conversation by its threadId', () => {
    const { id, threadId } = createConversationDb(db, 'Thread lookup');
    const conv = getConversationByThreadIdDb(db, threadId);
    expect(conv?.id).toBe(id);
    expect(conv?.threadId).toBe(threadId);
  });
});

describe('updateConversationTitleDb', () => {
  it('updates the title', () => {
    const { id } = createConversationDb(db, 'New conversation');
    updateConversationTitleDb(db, id, 'Wireless headphones');
    expect(getConversationByIdDb(db, id)?.title).toBe('Wireless headphones');
  });
});
