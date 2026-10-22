import type { RecordKind, UnreadableRecord } from '../storage/records';
import {
  MAX_TEXT_LENGTH,
  PortableBackupError,
  type PortablePlainRecord,
} from './portableBackup';

export interface ImportPlanRecord {
  id: string;
  kind: RecordKind;
  createdAt: number;
  updatedAt: number;
  /** A short, plain text line for the preview. Never rendered as markup. */
  summary: string;
  value: unknown;
}

export interface ImportKindCount {
  kind: RecordKind;
  count: number;
}

export interface ImportPlan {
  createdAt: number;
  recordCount: number;
  kinds: ImportKindCount[];
  records: ImportPlanRecord[];
  /** How many records the vault holds right now. */
  existingCount: number;
  /** Ids that exist in the vault already. */
  conflictingIds: string[];
  /**
   * Records of the vault that cannot be read. They are part of
   * `existingCount`, a replace would remove them.
   */
  unreadable: UnreadableRecord[];
}

export type ImportMode = 'merge' | 'replace';

/** Internal kinds that are never part of a portable backup. */
export const INTERNAL_KINDS: RecordKind[] = ['legacy', 'backup'];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkText(value: unknown, field: string, problems: string[]): void {
  if (typeof value !== 'string') {
    problems.push(`${field} is not text`);
    return;
  }

  if (value.length > MAX_TEXT_LENGTH) {
    problems.push(`${field} is too long`);
  }
}

function checkObject(value: unknown, field: string, problems: string[]): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push(`${field} is missing`);
    return false;
  }

  return true;
}

/**
 * Checks the content of one record. Every problem is collected so the user
 * gets a complete list instead of one problem at a time.
 */
export function validateRecordValue(
  kind: RecordKind,
  value: unknown,
  problems: string[],
): void {
  switch (kind) {
    case 'settings': {
      if (!checkObject(value, 'settings', problems)) return;
      const settings = value as Record<string, unknown>;
      if (!isFiniteNumber(settings.schemaVersion)) {
        problems.push('settings has no schema version');
      }
      if (
        !isFiniteNumber(settings.autoLockMinutes) ||
        settings.autoLockMinutes < 0 ||
        settings.autoLockMinutes > 1440
      ) {
        problems.push('settings has an invalid auto lock time');
      }
      return;
    }

    case 'progress': {
      if (!checkObject(value, 'progress', problems)) return;
      const progress = value as Record<string, unknown>;
      if (!isFiniteNumber(progress.xp) || progress.xp < 0) {
        problems.push('progress has an invalid xp value');
      }
      return;
    }

    case 'game': {
      if (!checkObject(value, 'game', problems)) return;
      const game = value as Record<string, unknown>;
      if (!isFiniteNumber(game.doneCount) || game.doneCount < 0) {
        problems.push('game has an invalid reflection count');
      }
      return;
    }

    case 'quote': {
      if (!checkObject(value, 'quote', problems)) return;
      const quote = value as Record<string, unknown>;
      if (!isFiniteNumber(quote.id)) {
        problems.push('quote has no id');
      }
      checkText(quote.text, 'quote text', problems);

      if (quote.reminder !== null && quote.reminder !== undefined) {
        if (!checkObject(quote.reminder, 'quote reminder', problems)) return;
        const reminder = quote.reminder as Record<string, unknown>;
        checkText(reminder.time, 'reminder time', problems);
        checkText(reminder.repeat, 'reminder repeat', problems);
      }

      if (typeof quote.active !== 'boolean') {
        problems.push('quote has no valid reminder state');
      }
      return;
    }

    case 'reflect': {
      if (!checkObject(value, 'reflect', problems)) return;
      const reflect = value as Record<string, unknown>;
      if (reflect.mode !== 'pos' && reflect.mode !== 'neg') {
        problems.push('reflect has an invalid mode');
      }
      if (!isFiniteNumber(reflect.posCount) || !isFiniteNumber(reflect.totalCount)) {
        problems.push('reflect has invalid mood counters');
      }
      if (!Array.isArray(reflect.messages)) {
        problems.push('reflect has no messages');
        return;
      }
      reflect.messages.forEach((message, index) => {
        if (!checkObject(message, `reflect message ${index + 1}`, problems)) return;
        const entry = message as Record<string, unknown>;
        if (!isFiniteNumber(entry.id)) {
          problems.push(`reflect message ${index + 1} has no id`);
        }
        checkText(entry.text, `reflect message ${index + 1}`, problems);
        if (entry.mode !== 'pos' && entry.mode !== 'neg') {
          problems.push(`reflect message ${index + 1} has an invalid mode`);
        }
      });
      return;
    }

    case 'entry': {
      // Entries come from the legacy version and are kept as they are.
      checkObject(value, 'entry', problems);
      return;
    }

    default:
      problems.push(`records of kind "${kind}" are not supported`);
  }
}

function truncate(text: string, length = 60): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > length ? `${clean.slice(0, length)}…` : clean;
}

/** A short, harmless description of a record for the restore preview. */
export function summarizeRecord(kind: RecordKind, value: unknown): string {
  if (typeof value !== 'object' || value === null) return 'empty record';

  switch (kind) {
    case 'quote': {
      const quote = value as { text?: unknown };
      return typeof quote.text === 'string' && quote.text
        ? `“${truncate(quote.text)}”`
        : 'empty quote';
    }

    case 'reflect': {
      const reflect = value as { messages?: unknown };
      const messages = Array.isArray(reflect.messages) ? reflect.messages : [];
      const last = messages[messages.length - 1] as { text?: unknown } | undefined;
      const text = last && typeof last.text === 'string' ? last.text : '';
      return `${messages.length} message${messages.length === 1 ? '' : 's'}${
        text ? `, last: “${truncate(text, 40)}”` : ''
      }`;
    }

    case 'progress': {
      const progress = value as { xp?: unknown };
      return typeof progress.xp === 'number' ? `${progress.xp} xp` : 'progress';
    }

    case 'game': {
      const game = value as { doneCount?: unknown };
      return typeof game.doneCount === 'number'
        ? `${game.doneCount} reflection${game.doneCount === 1 ? '' : 's'}`
        : 'mind game';
    }

    case 'settings': {
      const settings = value as { autoLockMinutes?: unknown };
      return typeof settings.autoLockMinutes === 'number'
        ? `auto lock after ${settings.autoLockMinutes} minute(s)`
        : 'settings';
    }

    default:
      return 'entry';
  }
}

/**
 * Turns the decrypted records into a plan the user can look at. Everything
 * that does not add up is reported before a single record is written.
 */
export function buildImportPlan(
  records: PortablePlainRecord[],
  options: {
    createdAt: number;
    existingIds: string[];
    existingCount: number;
    unreadable?: UnreadableRecord[];
    now?: number;
  },
): ImportPlan {
  const now = options.now ?? Date.now();
  const problems: string[] = [];
  const usable: ImportPlanRecord[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    if (INTERNAL_KINDS.includes(record.kind)) continue;

    if (seen.has(record.id)) {
      problems.push(`the record "${record.id}" appears more than once`);
      continue;
    }
    seen.add(record.id);

    const tooEarly = !isFiniteNumber(record.createdAt) || record.createdAt < 0;
    const tooLate = !isFiniteNumber(record.updatedAt) || record.updatedAt > now + 86_400_000;

    if (tooEarly || tooLate) {
      problems.push(`the record "${record.id}" has an invalid timestamp`);
      continue;
    }

    const recordProblems: string[] = [];
    validateRecordValue(record.kind, record.value, recordProblems);

    if (recordProblems.length > 0) {
      problems.push(`the record "${record.id}" is not valid: ${recordProblems.join(', ')}`);
      continue;
    }

    usable.push({
      id: record.id,
      kind: record.kind,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      summary: summarizeRecord(record.kind, record.value),
      value: record.value,
    });
  }

  if (problems.length > 0) {
    throw new PortableBackupError(
      'invalid-record',
      'That backup holds records that myWorld cannot restore.',
      problems.slice(0, 10),
    );
  }

  const counts = new Map<RecordKind, number>();
  for (const record of usable) {
    counts.set(record.kind, (counts.get(record.kind) ?? 0) + 1);
  }

  const existing = new Set(options.existingIds);

  return {
    createdAt: options.createdAt,
    recordCount: usable.length,
    kinds: Array.from(counts.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => a.kind.localeCompare(b.kind)),
    records: usable,
    existingCount: options.existingCount,
    conflictingIds: usable
      .filter((record) => existing.has(record.id))
      .map((record) => record.id),
    unreadable: options.unreadable ?? [],
  };
}

export const KIND_LABELS: Record<RecordKind, string> = {
  settings: 'Settings',
  progress: 'Progress',
  reflect: 'Reflect',
  game: 'Mind Game',
  quote: 'My Quotes',
  entry: 'Journal entries',
  legacy: 'Legacy copy',
  backup: 'Recovery copy',
};
