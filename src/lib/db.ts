import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export function createDb(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      thread_id  TEXT UNIQUE NOT NULL,
      title      TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_preferences (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

const DB_PATH =
  process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'bazak.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) _db = createDb(DB_PATH);
  return _db;
}
