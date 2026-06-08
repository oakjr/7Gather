import { MAX_AVATARS } from '@shared/constants';

const AVATAR_STORAGE_KEY = 'avatar_id';

/**
 * Validates whether a given value is a valid avatar ID (1-20).
 */
export function isAvatarValid(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  return Number.isInteger(num) && num >= 1 && num <= MAX_AVATARS;
}

/**
 * Retrieves the avatar ID from LocalStorage.
 * Returns null if the value is absent, non-numeric, or outside range 1-20.
 */
export function getAvatarId(): number | null {
  const stored = localStorage.getItem(AVATAR_STORAGE_KEY);
  if (stored === null) return null;
  const num = Number(stored);
  if (!Number.isInteger(num) || num < 1 || num > MAX_AVATARS) return null;
  return num;
}

/**
 * Stores the avatar ID in LocalStorage after validating the range.
 * Throws if the ID is outside valid range 1-20.
 */
export function setAvatarId(id: number): void {
  if (!Number.isInteger(id) || id < 1 || id > MAX_AVATARS) {
    throw new RangeError(`Avatar ID must be an integer between 1 and ${MAX_AVATARS}, got: ${id}`);
  }
  localStorage.setItem(AVATAR_STORAGE_KEY, String(id));
}

/**
 * Clears the avatar ID from LocalStorage.
 */
export function clearAvatarId(): void {
  localStorage.removeItem(AVATAR_STORAGE_KEY);
}
