'use client';

interface Props {
  preferences: Record<string, string>;
  onDelete: (key: string) => void;
  onClearAll: () => void;
}

export function PreferencesPanel({ preferences, onDelete, onClearAll }: Props) {
  const keys = Object.keys(preferences);

  return (
    <div className="border-t border-slate-700 px-3 py-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">My Preferences</p>
      {keys.length === 0 ? (
        <p className="text-xs text-slate-500">No preferences saved</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {keys.map(key => (
              <span
                key={key}
                className="flex items-center gap-1 bg-slate-700 rounded-full px-2 py-0.5 text-xs text-slate-300"
              >
                <span>{key}: {preferences[key]}</span>
                <button
                  aria-label={`delete ${key}`}
                  onClick={() => onDelete(key)}
                  className="text-slate-400 hover:text-white ml-1"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <button
            aria-label="clear all"
            onClick={onClearAll}
            className="mt-2 text-xs text-slate-500 hover:text-slate-300"
          >
            Clear all
          </button>
        </>
      )}
    </div>
  );
}
