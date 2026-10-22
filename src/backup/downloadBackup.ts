import { Capacitor } from '@capacitor/core';
import {
  MAX_BACKUP_BYTES,
  parsePortableBackup,
  portableBackupFileName,
  PortableBackupError,
  serializePortableBackup,
  type PortableBackup,
} from './portableBackup';
import { saveNativeBackup } from './nativeBackup';

/** The file the browser hands to the user. */
export function portableBackupBlob(backup: PortableBackup): Blob {
  return new Blob([serializePortableBackup(backup)], { type: 'application/json' });
}

/**
 * Hands the backup to the browser as a download. The file is built before the
 * download starts, so the user is only told it worked when the file really
 * exists.
 */
export function downloadPortableBackup(backup: PortableBackup): string {
  if (typeof URL.createObjectURL !== 'function') {
    throw new PortableBackupError(
      'malformed',
      'This browser cannot create the backup file, so nothing was saved.',
    );
  }

  const blob = portableBackupBlob(backup);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const name = portableBackupFileName(backup.createdAt);

  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);

  return name;
}

/**
 * Saves the backup where the user can keep it.
 *
 * In the browser the file is downloaded. In the Android app the file is
 * written to the app's own folder and handed to the share sheet, because the
 * WebView cannot download files by itself.
 */
export async function savePortableBackup(backup: PortableBackup): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    return saveNativeBackup(backup);
  }

  return downloadPortableBackup(backup);
}

/**
 * Reads a file the user picked. The size is checked before the file is read
 * into memory, so a huge file cannot exhaust the tab.
 */
export async function readBackupFile(file: File): Promise<PortableBackup> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new PortableBackupError(
      'too-large',
      'That file is too large to be a myWorld backup.',
    );
  }

  const text = await file.text();

  if (text.length > MAX_BACKUP_BYTES) {
    throw new PortableBackupError(
      'too-large',
      'That file is too large to be a myWorld backup.',
    );
  }

  return parsePortableBackup(text);
}
