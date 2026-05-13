import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from './db';
import {
  getPreferencesDb,
  setPreferenceDb,
  deletePreferenceDb,
  clearPreferencesDb,
} from './store';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = createDb(':memory:');
});

describe('getPreferencesDb', () => {
  it('returns empty object when no preferences stored', () => {
    expect(getPreferencesDb(db)).toEqual({});
  });
});

describe('setPreferenceDb', () => {
  it('stores a key-value pair', () => {
    setPreferenceDb(db, 'budget', 'under $100');
    expect(getPreferencesDb(db)).toEqual({ budget: 'under $100' });
  });
  it('overwrites an existing key', () => {
    setPreferenceDb(db, 'budget', 'under $100');
    setPreferenceDb(db, 'budget', 'under $200');
    expect(getPreferencesDb(db).budget).toBe('under $200');
  });
});

describe('deletePreferenceDb', () => {
  it('removes a single key and leaves others intact', () => {
    setPreferenceDb(db, 'budget', 'under $100');
    setPreferenceDb(db, 'brand', 'Nike');
    deletePreferenceDb(db, 'budget');
    const prefs = getPreferencesDb(db);
    expect(prefs).not.toHaveProperty('budget');
    expect(prefs.brand).toBe('Nike');
  });
});

describe('clearPreferencesDb', () => {
  it('removes all entries', () => {
    setPreferenceDb(db, 'a', '1');
    setPreferenceDb(db, 'b', '2');
    clearPreferencesDb(db);
    expect(getPreferencesDb(db)).toEqual({});
  });
});
