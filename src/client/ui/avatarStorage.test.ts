import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAvatarId, setAvatarId, isAvatarValid, clearAvatarId } from './avatarStorage';

describe('avatarStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('isAvatarValid', () => {
    it('returns true for valid avatar IDs (1-20)', () => {
      expect(isAvatarValid(1)).toBe(true);
      expect(isAvatarValid(10)).toBe(true);
      expect(isAvatarValid(20)).toBe(true);
    });

    it('returns true for valid string avatar IDs', () => {
      expect(isAvatarValid('1')).toBe(true);
      expect(isAvatarValid('20')).toBe(true);
    });

    it('returns false for out-of-range values', () => {
      expect(isAvatarValid(0)).toBe(false);
      expect(isAvatarValid(21)).toBe(false);
      expect(isAvatarValid(-1)).toBe(false);
      expect(isAvatarValid(100)).toBe(false);
    });

    it('returns false for non-numeric values', () => {
      expect(isAvatarValid('abc')).toBe(false);
      expect(isAvatarValid('')).toBe(false);
      expect(isAvatarValid(null)).toBe(false);
      expect(isAvatarValid(undefined)).toBe(false);
    });

    it('returns false for floating point values', () => {
      expect(isAvatarValid(1.5)).toBe(false);
      expect(isAvatarValid(10.9)).toBe(false);
    });
  });

  describe('getAvatarId', () => {
    it('returns null when no value is stored', () => {
      expect(getAvatarId()).toBeNull();
    });

    it('returns the stored avatar ID as a number', () => {
      localStorage.setItem('avatar_id', '5');
      expect(getAvatarId()).toBe(5);
    });

    it('returns null for non-numeric stored value', () => {
      localStorage.setItem('avatar_id', 'hello');
      expect(getAvatarId()).toBeNull();
    });

    it('returns null for out-of-range stored value', () => {
      localStorage.setItem('avatar_id', '0');
      expect(getAvatarId()).toBeNull();

      localStorage.setItem('avatar_id', '21');
      expect(getAvatarId()).toBeNull();
    });

    it('returns null for floating point stored value', () => {
      localStorage.setItem('avatar_id', '5.5');
      expect(getAvatarId()).toBeNull();
    });
  });

  describe('setAvatarId', () => {
    it('stores the avatar ID in localStorage', () => {
      setAvatarId(7);
      expect(localStorage.getItem('avatar_id')).toBe('7');
    });

    it('throws RangeError for ID below 1', () => {
      expect(() => setAvatarId(0)).toThrow(RangeError);
    });

    it('throws RangeError for ID above 20', () => {
      expect(() => setAvatarId(21)).toThrow(RangeError);
    });

    it('throws RangeError for non-integer values', () => {
      expect(() => setAvatarId(1.5)).toThrow(RangeError);
    });

    it('overwrites previous value', () => {
      setAvatarId(3);
      setAvatarId(15);
      expect(localStorage.getItem('avatar_id')).toBe('15');
    });
  });

  describe('clearAvatarId', () => {
    it('removes the avatar_id from localStorage', () => {
      setAvatarId(10);
      clearAvatarId();
      expect(getAvatarId()).toBeNull();
    });
  });
});
