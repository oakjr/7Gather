import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AvatarSelector } from './AvatarSelector';

describe('AvatarSelector', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders 20 avatar options', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(20);
  });

  it('renders category headings', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    expect(screen.getByText('Robôs')).toBeDefined();
    expect(screen.getByText('Drones')).toBeDefined();
    expect(screen.getByText('Soldados Espaciais')).toBeDefined();
    expect(screen.getByText('Aliens Pixelados')).toBeDefined();
  });

  it('marks selected avatar with aria-checked', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    const options = screen.getAllByRole('radio');
    fireEvent.click(options[2]); // Select avatar 3

    expect(options[2].getAttribute('aria-checked')).toBe('true');
    expect(options[0].getAttribute('aria-checked')).toBe('false');
  });

  it('saves avatar ID to LocalStorage on confirm', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    // Select avatar 5
    const options = screen.getAllByRole('radio');
    fireEvent.click(options[4]);

    // Click confirm
    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    expect(localStorage.getItem('avatar_id')).toBe('5');
    expect(onSelect).toHaveBeenCalledWith(5);
  });

  it('disables confirm button when no avatar is selected', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    const confirmBtn = screen.getByRole('button', { name: /selecione um avatar/i });
    expect(confirmBtn.getAttribute('aria-disabled')).toBe('true');
  });

  it('calls onSelect with the correct ID', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    const options = screen.getAllByRole('radio');
    fireEvent.click(options[14]); // Avatar 15

    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    expect(onSelect).toHaveBeenCalledWith(15);
  });

  it('supports keyboard selection with Enter key', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    const options = screen.getAllByRole('radio');
    fireEvent.keyDown(options[0], { key: 'Enter' });

    expect(options[0].getAttribute('aria-checked')).toBe('true');
  });

  it('supports keyboard selection with Space key', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    const options = screen.getAllByRole('radio');
    fireEvent.keyDown(options[7], { key: ' ' });

    expect(options[7].getAttribute('aria-checked')).toBe('true');
  });

  it('has proper ARIA dialog attributes', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe('avatar-selector-title');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('renders data-avatar-id attributes for each option', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    const options = screen.getAllByRole('radio');
    expect(options[0].getAttribute('data-avatar-id')).toBe('1');
    expect(options[19].getAttribute('data-avatar-id')).toBe('20');
  });
});
