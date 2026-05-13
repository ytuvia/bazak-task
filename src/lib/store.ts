import type Database from 'better-sqlite3';
import { getDb } from './db';

export function getPreferencesDb(db: Database.Database): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM user_preferences').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export function setPreferenceDb(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO user_preferences (key, value) VALUES (?, ?)').run(key, value);
}

export function deletePreferenceDb(db: Database.Database, key: string): void {
  db.prepare('DELETE FROM user_preferences WHERE key = ?').run(key);
}

export function clearPreferencesDb(db: Database.Database): void {
  db.prepare('DELETE FROM user_preferences').run();
}

export const getPreferences = () => getPreferencesDb(getDb());
export const setPreference = (key: string, value: string) => setPreferenceDb(getDb(), key, value);
export const deletePreference = (key: string) => deletePreferenceDb(getDb(), key);
export const clearPreferences = () => clearPreferencesDb(getDb());
