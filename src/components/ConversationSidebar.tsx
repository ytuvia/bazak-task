'use client';
import { PreferencesPanel } from './PreferencesPanel';
import type { Conversation } from '@/types';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  preferences: Record<string, string>;
  onSelect: (conv: Conversation) => void;
  onNew: () => void;
  onDeletePreference: (key: string) => void;
  onClearPreferences: () => void;
}

function toDateString(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function groupByRecency(conversations: Conversation[]) {
  const now = new Date();
  const todayStr = toDateString(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toDateString(yesterday);

  const today: Conversation[] = [];
  const yesterdayGroup: Conversation[] = [];
  const older: Conversation[] = [];

  for (const conv of conversations) {
    const str = toDateString(new Date(conv.createdAt));
    if (str === todayStr) today.push(conv);
    else if (str === yesterdayStr) yesterdayGroup.push(conv);
    else older.push(conv);
  }
  return { today, yesterday: yesterdayGroup, older };
}

function ThreadGroup({ label, items, activeId, onSelect }: {
  label: string;
  items: Conversation[];
  activeId: string | null;
  onSelect: (c: Conversation) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-2">
      <p className="px-3 py-1 text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </p>
      {items.map(c => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          className={`w-full text-left px-3 py-2 rounded-lg mx-1 text-sm truncate ${
            c.id === activeId
              ? 'bg-slate-600 text-slate-100'
              : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
          }`}
        >
          {c.title}
        </button>
      ))}
    </div>
  );
}

export function ConversationSidebar({
  conversations,
  activeId,
  preferences,
  onSelect,
  onNew,
  onDeletePreference,
  onClearPreferences,
}: Props) {
  const { today, yesterday, older } = groupByRecency(conversations);

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-800 flex flex-col border-r border-slate-700 h-full">
      <div className="p-3 border-b border-slate-700">
        <button
          onClick={onNew}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-lg"
        >
          + New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <ThreadGroup label="Today" items={today} activeId={activeId} onSelect={onSelect} />
        <ThreadGroup label="Yesterday" items={yesterday} activeId={activeId} onSelect={onSelect} />
        <ThreadGroup label="Older" items={older} activeId={activeId} onSelect={onSelect} />
      </div>

      <PreferencesPanel
        preferences={preferences}
        onDelete={onDeletePreference}
        onClearAll={onClearPreferences}
      />
    </aside>
  );
}
