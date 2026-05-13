import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { END } from '@langchain/langgraph';

vi.mock('./store', () => ({
  getPreferences: vi.fn().mockReturnValue({}),
  setPreference: vi.fn(),
}));

import { shouldSummarize } from './agent';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

function makeMessages(n: number) {
  return Array.from({ length: n }, (_, i) =>
    i % 2 === 0 ? new HumanMessage(`msg ${i}`) : new AIMessage(`reply ${i}`)
  );
}

describe('shouldSummarize', () => {
  const originalEnv = process.env.SUMMARY_MESSAGE_THRESHOLD;

  beforeEach(() => {
    process.env.SUMMARY_MESSAGE_THRESHOLD = '10';
  });

  afterEach(() => {
    process.env.SUMMARY_MESSAGE_THRESHOLD = originalEnv;
  });

  it('returns END when messages at or below threshold', () => {
    expect(shouldSummarize({ messages: makeMessages(10), summary: '' })).toBe(END);
    expect(shouldSummarize({ messages: makeMessages(5), summary: '' })).toBe(END);
  });

  it('returns "summarize" when messages exceed threshold', () => {
    expect(shouldSummarize({ messages: makeMessages(11), summary: '' })).toBe('summarize');
    expect(shouldSummarize({ messages: makeMessages(20), summary: '' })).toBe('summarize');
  });

  it('respects SUMMARY_MESSAGE_THRESHOLD env var', () => {
    process.env.SUMMARY_MESSAGE_THRESHOLD = '5';
    expect(shouldSummarize({ messages: makeMessages(6), summary: '' })).toBe('summarize');
    expect(shouldSummarize({ messages: makeMessages(5), summary: '' })).toBe(END);
  });
});
