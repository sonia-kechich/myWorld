import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { deleteDatabase } from '../storage/db';
import {
  buildPortableBackup,
  serializePortableBackup,
} from '../backup/portableBackup';
import { generateCode, resetVaultState } from '../test/helpers';

const PASSWORD = 'a very long test password';
const BACKUP_PASSWORD = 'the backup password of the journey';

beforeEach(async () => {
  await resetVaultState();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await deleteDatabase();
  vi.restoreAllMocks();
});

async function createVault(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Create your vault');

  await user.type(screen.getByLabelText('Password'), PASSWORD);
  await user.type(screen.getByLabelText('Repeat password'), PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  const key = await screen.findByText(/^[A-Z2-7]{32}$/);
  const secret = key.textContent ?? '';

  await user.click(screen.getByRole('button', { name: 'I have added it' }));
  await user.type(screen.getByLabelText('6-digit code'), await generateCode(secret));
  await user.click(screen.getByRole('button', { name: 'Create my vault' }));

  await screen.findByText('a private space just for you');

  return secret;
}

describe('the whole journey', () => {
  it('goes from the first run to a backup and back again', async () => {
    const user = userEvent.setup();

    let exported: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      exported = value as Blob;
      return 'blob:myworld/journey';
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<App />);

    // 1. the first run asks for a vault
    await screen.findByText('Create your vault');

    // 2. a password and a code are asked for
    const secret = await createVault(user);

    // 3. the app is open
    expect(screen.getByText('a private space just for you')).toBeInTheDocument();

    // 4. something is written down
    await user.click(screen.getByRole('button', { name: /My Quotes/ }));
    await user.type(
      screen.getByPlaceholderText('Write a quote that means something to you...'),
      'a quote that has to survive the whole journey',
    );
    await user.click(screen.getByRole('button', { name: 'Save ❝' }));

    await screen.findByText(/a quote that has to survive the whole journey/);

    // 5. the settings are opened
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Vault settings' }));

    await screen.findByText('Save a backup');

    // 6. a backup is made with its own password
    await user.type(screen.getByLabelText('Backup password'), BACKUP_PASSWORD);
    await user.type(screen.getByLabelText('Repeat backup password'), BACKUP_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Save encrypted backup' }));

    await screen.findByText(/Backup saved as myworld-backup-.*\.myworld/);

    await waitFor(() => {
      expect(exported).not.toBeNull();
    });

    // 7. the vault locks itself and is opened again
    await user.click(screen.getByRole('button', { name: 'Lock now' }));

    await screen.findByText('Locked. Your words are still encrypted.');

    expect(screen.queryByText('a private space just for you')).toBeNull();

    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.type(screen.getByLabelText('6-digit code'), await generateCode(secret));
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await screen.findByText('a private space just for you');

    // 8. the quote is still there
    await user.click(screen.getByRole('button', { name: /My Quotes/ }));

    await waitFor(() => {
      expect(
        screen.getByText(/a quote that has to survive the whole journey/),
      ).toBeInTheDocument();
    });

    // 9. the backup is restored into the same vault
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Vault settings' }));

    const file = new File([await (exported as unknown as Blob).text()], 'myworld-backup.myworld', {
      type: 'application/json',
    });

    await user.upload(screen.getByLabelText('Backup file'), file);

    await user.type(screen.getByLabelText('Password of that backup'), BACKUP_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Open backup' }));

    await screen.findByText(/record(s)? in this backup/);

    // 10. the preview is shown before anything is written
    expect(screen.getByText(/a quote that has to survive the whole journey/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Merge into the vault' }));

    await screen.findByText(/Merged \d+ records into the vault/);

    // 11. the same backup is used to replace everything
    await user.upload(screen.getByLabelText('Backup file'), file);
    await user.type(screen.getByLabelText('Password of that backup'), BACKUP_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Open backup' }));

    await screen.findByText(/record(s)? in this backup/);

    await user.click(screen.getByRole('radio', { name: /Replace everything/ }));
    await user.click(screen.getByRole('button', { name: 'I understand, replace everything' }));
    await user.click(screen.getByRole('button', { name: 'Replace the vault' }));

    await screen.findByText(/Restored \d+ records/);

    // 12. the copy taken before the restore can be put back
    await user.click(screen.getByRole('button', { name: 'Put back the copy from the last restore' }));

    await screen.findByText(/Put back \d+ records from before the last restore/);
  }, 120_000);

  it('does not open a backup with the wrong password', async () => {
    const user = userEvent.setup();

    let exported: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      exported = value as Blob;
      return 'blob:myworld/journey';
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<App />);

    await createVault(user);

    await user.click(screen.getByRole('button', { name: 'Vault settings' }));
    await user.type(screen.getByLabelText('Backup password'), BACKUP_PASSWORD);
    await user.type(screen.getByLabelText('Repeat backup password'), BACKUP_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Save encrypted backup' }));

    await screen.findByText(/Backup saved as myworld-backup-/);

    const file = new File([await (exported as unknown as Blob).text()], 'myworld-backup.myworld', {
      type: 'application/json',
    });

    await user.upload(screen.getByLabelText('Backup file'), file);
    await user.type(screen.getByLabelText('Password of that backup'), 'not the right one');
    await user.click(screen.getByRole('button', { name: 'Open backup' }));

    await screen.findByText(/password is not right/i);
    expect(screen.queryByText(/record(s)? in this backup/)).toBeNull();
  }, 120_000);

  it('refuses a file that is not a backup', async () => {
    const user = userEvent.setup();

    render(<App />);

    await createVault(user);

    await user.click(screen.getByRole('button', { name: 'Vault settings' }));

    const file = new File(['this is not a backup'], 'notes.myworld', {
      type: 'application/json',
    });
    await user.upload(screen.getByLabelText('Backup file'), file);

    await screen.findByText(/not a myWorld backup/i);
  }, 120_000);

  it('shows the content of a backup as text and never as markup', async () => {
    const user = userEvent.setup();

    render(<App />);

    await createVault(user);

    await user.click(screen.getByRole('button', { name: 'Vault settings' }));

    const backup = await buildPortableBackup(
      [
        {
          id: 'quote:1',
          kind: 'quote',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          value: {
            id: 1,
            text: '<img src=x onerror="window.__hacked = true">',
            reminder: null,
            active: false,
            createdAt: 1_700_000_000_000,
          },
        },
      ],
      BACKUP_PASSWORD,
      { iterations: 1_000 },
    );

    const file = new File([serializePortableBackup(backup)], 'myworld-backup.myworld', {
      type: 'application/json',
    });

    await user.upload(screen.getByLabelText('Backup file'), file);
    await user.type(screen.getByLabelText('Password of that backup'), BACKUP_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Open backup' }));

    await screen.findByText(/record(s)? in this backup/);

    const preview = document.querySelector('.set-preview');

    expect(preview?.textContent).toContain('<img src=x onerror="window.__hacked = true">');
    expect(preview?.querySelector('img')).toBeNull();
    expect((window as unknown as { __hacked?: boolean }).__hacked).toBeUndefined();
  }, 120_000);

  it('says which record of a backup is broken and changes nothing', async () => {
    const user = userEvent.setup();

    render(<App />);

    await createVault(user);

    await user.click(screen.getByRole('button', { name: 'Vault settings' }));

    const backup = await buildPortableBackup(
      [
        {
          id: 'progress',
          kind: 'progress',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          value: { xp: 'a lot' },
        },
      ],
      BACKUP_PASSWORD,
      { iterations: 1_000 },
    );

    const file = new File([serializePortableBackup(backup)], 'myworld-backup.myworld', {
      type: 'application/json',
    });

    await user.upload(screen.getByLabelText('Backup file'), file);
    await user.type(screen.getByLabelText('Password of that backup'), BACKUP_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Open backup' }));

    await screen.findByText(/cannot restore/i);

    const list = document.querySelector('.set-error-list');
    expect(list?.textContent).toContain('progress');
    expect(screen.queryByText(/record(s)? in this backup/)).toBeNull();
  }, 120_000);

  it('keeps the vault open when a backup carries the id of another kind', async () => {
    const user = userEvent.setup();

    render(<App />);

    await createVault(user);

    await user.click(screen.getByRole('button', { name: 'Vault settings' }));

    // A quote that carries the id of the settings. It must not be able to
    // take the place of the settings and lock the vault out for good.
    const backup = await buildPortableBackup(
      [
        {
          id: 'settings',
          kind: 'quote',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          value: {
            id: 1,
            text: 'a quote that carries the id of the settings',
            reminder: null,
            active: false,
          },
        },
      ],
      BACKUP_PASSWORD,
      { iterations: 1_000 },
    );

    const file = new File([serializePortableBackup(backup)], 'myworld-backup.myworld', {
      type: 'application/json',
    });

    await user.upload(screen.getByLabelText('Backup file'), file);
    await user.type(screen.getByLabelText('Password of that backup'), BACKUP_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Open backup' }));

    await screen.findByText(/record(s)? in this backup/);

    await user.click(screen.getByRole('button', { name: 'Merge into the vault' }));

    await screen.findByText(/Merged \d+ records into the vault/);

    // The vault is still open and the settings are still the ones of the
    // user, the quote did not take their place.
    expect(screen.queryByText('Locked. Your words are still encrypted.')).toBeNull();
    expect(screen.getByLabelText('Auto lock')).toHaveValue('5');
  }, 120_000);
});
