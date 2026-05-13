import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import path from 'path';

const DB_PATH =
  process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'bazak.db');

let _checkpointer: SqliteSaver | null = null;

export function getCheckpointer(): SqliteSaver {
  if (!_checkpointer) {
    _checkpointer = SqliteSaver.fromConnString(DB_PATH);
  }
  return _checkpointer;
}
