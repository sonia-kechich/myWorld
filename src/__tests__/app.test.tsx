import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { deleteDatabase } from '../storage/db';
import { generateCode, resetVaultState } from '../test/helpers';

const PASSWORD = 'a very long test password';

beforeEach(async () => {
  await resetVaultState();
});

afterEach(async () => {
  // Unmount first, then let the writes that are still in flight settle, so a
  // record from this test cannot land in the next one.
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

describe('the vault gate', () => {
  it('shows nothing of the app before a vault exists', async () => {
    render(<App />);

    await screen.findByText('Create your vault');

    expect(screen.queryByText('a private space just for you')).toBeNull();
    expect(screen.queryByText('Reflect')).toBeNull();
    expect(screen.queryByText('My Quotes')).toBeNull();
    expect(screen.queryByText('Mind Game')).toBeNull();
  });

  it('opens the app once the vault is created', async () => {
    const user = userEvent.setup();
    render(<App />);

    await createVault(user);

    expect(screen.getByText('a private space just for you')).toBeInTheDocument();
    expect(screen.getByText('Reflect')).toBeInTheDocument();
    expect(screen.getByText('My Quotes')).toBeInTheDocument();
    expect(screen.getByText('Mind Game')).toBeInTheDocument();
  });

  it('draws the authenticator code on the device', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('Create your vault');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.type(screen.getByLabelText('Repeat password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await screen.findByText(/^[A-Z2-7]{32}$/);

    const qr = document.querySelector('.qr-frame svg');
    expect(qr).not.toBeNull();
  });

  it('never talks to the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const beaconSpy =
      typeof navigator.sendBeacon === 'function'
        ? vi.spyOn(navigator, 'sendBeacon')
        : undefined;

    const user = userEvent.setup();
    render(<App />);

    await createVault(user);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(beaconSpy?.mock.calls.length ?? 0).toBe(0);
  });
});

describe('locking again', () => {
  it('hides the app and asks for the password', async () => {
    const user = userEvent.setup();
    render(<App />);

    const secret = await createVault(user);

    await user.click(screen.getByRole('button', { name: 'Vault settings' }));
    await user.click(screen.getByRole('button', { name: 'Lock now' }));

    await screen.findByText('Locked. Your words are still encrypted.');

    expect(screen.queryByText('a private space just for you')).toBeNull();
    expect(screen.queryByText('Reflect')).toBeNull();

    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.type(screen.getByLabelText('6-digit code'), await generateCode(secret));
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await screen.findByText('a private space just for you');
  });

  it('keeps the quotes across a lock', async () => {
    const user = userEvent.setup();
    render(<App />);

    const secret = await createVault(user);

    await user.click(screen.getByRole('button', { name: /My Quotes/ }));
    await user.type(
      screen.getByPlaceholderText('Write a quote that means something to you...'),
      'a quote that should survive a lock',
    );
    await user.click(screen.getByRole('button', { name: 'Save ❝' }));

    await screen.findByText(/a quote that should survive a lock/);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Vault settings' }));
    await user.click(screen.getByRole('button', { name: 'Lock now' }));

    await screen.findByText('Locked. Your words are still encrypted.');

    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.type(screen.getByLabelText('6-digit code'), await generateCode(secret));
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await screen.findByText('a private space just for you');

    await user.click(screen.getByRole('button', { name: /My Quotes/ }));

    await waitFor(() => {
      expect(
        screen.getByText(/a quote that should survive a lock/),
      ).toBeInTheDocument();
    });
  });
});
