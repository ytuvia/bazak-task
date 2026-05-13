import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PreferencesPanel } from './PreferencesPanel';

describe('PreferencesPanel', () => {
  it('renders one chip per preference', () => {
    render(
      <PreferencesPanel
        preferences={{ budget: 'under $100', brand: 'Nike' }}
        onDelete={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.getByText(/budget/i)).toBeInTheDocument();
    expect(screen.getByText(/Nike/i)).toBeInTheDocument();
  });

  it('shows empty state when preferences is empty', () => {
    render(
      <PreferencesPanel
        preferences={{}}
        onDelete={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.getByText(/No preferences saved/i)).toBeInTheDocument();
  });

  it('calls onDelete with key when delete button clicked', async () => {
    const onDelete = vi.fn();
    render(
      <PreferencesPanel
        preferences={{ budget: 'under $100' }}
        onDelete={onDelete}
        onClearAll={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /delete budget/i }));
    expect(onDelete).toHaveBeenCalledWith('budget');
  });

  it('calls onClearAll when clear all clicked', async () => {
    const onClearAll = vi.fn();
    render(
      <PreferencesPanel
        preferences={{ budget: 'under $100' }}
        onDelete={vi.fn()}
        onClearAll={onClearAll}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(onClearAll).toHaveBeenCalled();
  });
});
