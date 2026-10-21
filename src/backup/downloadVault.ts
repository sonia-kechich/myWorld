import { parseVaultFile, serializeVaultFile, vaultFileName, type VaultFile } from './vaultFile';

export function downloadVaultFile(file: VaultFile): void {
  const blob = new Blob([serializeVaultFile(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = vaultFileName(file.exportedAt);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function readVaultFile(file: File): Promise<VaultFile> {
  return parseVaultFile(await file.text());
}
