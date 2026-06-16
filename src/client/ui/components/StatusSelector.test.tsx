import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusSelector } from './StatusSelector';

describe('StatusSelector', () => {
  let localStorageMock: Record<string, string>;
  let getItemSpy: ReturnType<typeof vi.spyOn>;
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorageMock = {};
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => localStorageMock[key] ?? null
    );
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => {
        localStorageMock[key] = value;
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders three status options', () => {
    const onChange = vi.fn();
    render(<StatusSelector onStatusChange={onChange} />);
    const buttons = screen.getAllByRole('radio');
    expect(buttons).toHaveLength(3);
  });

  it('reads persisted status from localStorage on mount', () => {
    localStorageMock['user_status'] = 'busy';
    const onChange = vi.fn();
    render(<StatusSelector onStatusChange={onChange} />);

    const busyButton = screen.getByText('Ocupado').closest('button');
    expect(busyButton?.getAttribute('aria-checked')).toBe('true');
  });

  it('defaults to "available" when localStorage has no value', () => {
    const onChange = vi.fn();
    render(<StatusSelector onStatusChange={onChange} />);

    const availableButton = screen.getByText('Disponível').closest('button');
    expect(availableButton?.getAttribute('aria-checked')).toBe('true');
    // Should also persist the default
    expect(localStorageMock['user_status']).toBe('available');
  });

  it('defaults to "available" when localStorage has an invalid value', () => {
    localStorageMock['user_status'] = 'invalid_status';
    const onChange = vi.fn();
    render(<StatusSelector onStatusChange={onChange} />);

    const availableButton = screen.getByText('Disponível').closest('button');
    expect(availableButton?.getAttribute('aria-checked')).toBe('true');
    // Should persist the default over the invalid value
    expect(localStorageMock['user_status']).toBe('available');
  });

  it('persists valid status "dnd" from localStorage', () => {
    localStorageMock['user_status'] = 'dnd';
    const onChange = vi.fn();
    render(<StatusSelector onStatusChange={onChange} />);

    const dndButton = screen.getByText('Não Perturbe').closest('button');
    expect(dndButton?.getAttribute('aria-checked')).toBe('true');
  });

  it('writes to localStorage on status change', () => {
    const onChange = vi.fn();
    render(<StatusSelector onStatusChange={onChange} />);

    const busyButton = screen.getByText('Ocupado').closest('button')!;
    fireEvent.click(busyButton);

    expect(localStorageMock['user_status']).toBe('busy');
  });

  it('calls onStatusChange prop when user changes status', () => {
    const onChange = vi.fn();
    render(<StatusSelector onStatusChange={onChange} />);

    const dndButton = screen.getByText('Não Perturbe').closest('button')!;
    fireEvent.click(dndButton);

    expect(onChange).toHaveBeenCalledWith('dnd');
  });

  it('silently catches localStorage write failures', () => {
    setItemSpy.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const onChange = vi.fn();
    render(<StatusSelector onStatusChange={onChange} />);

    const busyButton = screen.getByText('Ocupado').closest('button')!;
    // Should not throw
    expect(() => fireEvent.click(busyButton)).not.toThrow();
    // onStatusChange should still be called
    expect(onChange).toHaveBeenCalledWith('busy');
  });

  it('silently catches localStorage read failures and defaults to available', () => {
    getItemSpy.mockImplementation(() => {
      throw new Error('SecurityError');
    });
    // Also make setItem fail (localStorage completely unavailable)
    setItemSpy.mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const onChange = vi.fn();
    render(<StatusSelector onStatusChange={onChange} />);

    const availableButton = screen.getByText('Disponível').closest('button');
    expect(availableButton?.getAttribute('aria-checked')).toBe('true');
  });

  it('uses currentStatus prop when provided, overriding localStorage', () => {
    localStorageMock['user_status'] = 'dnd';
    const onChange = vi.fn();
    render(<StatusSelector currentStatus="busy" onStatusChange={onChange} />);

    const busyButton = screen.getByText('Ocupado').closest('button');
    expect(busyButton?.getAttribute('aria-checked')).toBe('true');
  });

  it('renders with proper radiogroup role and aria-label', () => {
    const onChange = vi.fn();
    render(<StatusSelector onStatusChange={onChange} />);

    const group = screen.getByRole('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('Selecionar status');
  });

  it('applies active class to the selected status button', () => {
    localStorageMock['user_status'] = 'busy';
    const onChange = vi.fn();
    render(<StatusSelector onStatusChange={onChange} />);

    const busyButton = screen.getByText('Ocupado').closest('button');
    expect(busyButton?.className).toContain('active');

    const availableButton = screen.getByText('Disponível').closest('button');
    expect(availableButton?.className).not.toContain('active');
  });
});
