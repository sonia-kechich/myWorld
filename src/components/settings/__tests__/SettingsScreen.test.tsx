import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsScreen from '../SettingsScreen';

const { vault } = vi.hoisted(() => ({
  vault: {
    autoLockMinutes: 5,
    saveAutoLockMinutes: vi.fn(async () => undefined),
    lock: vi.fn(),
    exportPortable: vi.fn(),
    prepareImport: vi.fn(),
    applyImport: vi.fn(),
    undoLastImport: vi.fn(),
    hasLegacyCopy: vi.fn(async () => false),
    eraseLegacyCopy: vi.fn(),
    resetVault: vi.fn(),
  },
}));

vi.mock('../../../auth/VaultProvider', () => ({
  useVault: () => vault,
}));

describe('the vault settings', () => {
  it('says when the auto lock time could not be saved', async () => {
    const user = userEvent.setup();
    vault.saveAutoLockMinutes.mockRejectedValueOnce(new Error('the disk is full'));

    render(<SettingsScreen onBack={() => undefined} />);

    await user.selectOptions(screen.getByLabelText('Auto lock'), '15');

    expect(
      await screen.findByText('The auto lock time could not be saved.'),
    ).toBeInTheDocument();
  });

  it('has one button to close the session', () => {
    render(<SettingsScreen onBack={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Lock now' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });
});
