import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import path from 'path';
import { getDb } from './db';

const DB_PATH =
  process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'bazak.db');

let _checkpointer: SqliteSaver | null = null;

export function getCheckpointer(): SqliteSaver {
  if (!_checkpointer) {
    _checkpointer = SqliteSaver.fromConnString(DB_PATH);
  }
  return _checkpointer;
}

export function deleteCheckpointsByThreadId(threadId: string): void {
  const db = getDb();
  for (const table of ['checkpoint_writes', 'checkpoint_blobs', 'checkpoints']) {
    try {
      db.prepare(`DELETE FROM ${table} WHERE thread_id = ?`).run(threadId);
    } catch {
      // table may not exist yet if no checkpoints have been written
    }
  }
}
