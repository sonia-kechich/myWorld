import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { portableBackupFileName, serializePortableBackup, type PortableBackup } from './portableBackup';

const BACKUP_PREFIX = 'myworld-backup-';

/**
 * The name the backup gets on Android.
 *
 * The web build keeps the `.myworld` name, but Android only knows how to
 * recognise `.json` files, both when it hands the file to another app and when
 * the user picks a file to restore. The content is the same either way.
 */
export function nativeBackupFileName(exportedAt: number = Date.now()): string {
  return `${portableBackupFileName(exportedAt).replace(/\.myworld$/, '')}.json`;
}

/**
 * Saves the backup on the device and hands it to the share sheet, so the user
 * can put it wherever they want it. The file is written to the app's own
 * cache folder, which only the app can read, and it is removed again the next
 * time a backup is saved.
 */
export async function saveNativeBackup(backup: PortableBackup): Promise<string> {
  const name = nativeBackupFileName(backup.createdAt);

  await removeOldBackups();

  const { uri } = await Filesystem.writeFile({
    path: name,
    data: serializePortableBackup(backup),
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  await Share.share({
    title: 'myWorld backup',
    text: name,
    url: uri,
    dialogTitle: 'Save your myWorld backup',
  });

  return name;
}

async function removeOldBackups(): Promise<void> {
  try {
    const listing = await Filesystem.readdir({ path: '', directory: Directory.Cache });

    await Promise.all(
      listing.files
        .filter((file) => file.name.startsWith(BACKUP_PREFIX))
        .map((file) =>
          Filesystem.deleteFile({ path: file.name, directory: Directory.Cache }).catch(() => {
            // A file that cannot be removed is not worth failing the backup over.
          }),
        ),
    );
  } catch {
    // A missing cache folder is not a problem either.
  }
}
