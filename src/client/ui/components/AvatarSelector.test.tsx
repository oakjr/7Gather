import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AvatarSelector } from './AvatarSelector';

describe('AvatarSelector', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders 18 avatar options', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(18);
  });

  it('renders category headings', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    expect(screen.getByText('👨‍🚀 Tripulação')).toBeDefined();
    expect(screen.getByText('👾 Aliens & Robôs')).toBeDefined();
    expect(screen.getByText('🚀 Naves & Astros')).toBeDefined();
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

    // Type a name first (required for form validity)
    const nameInput = screen.getByLabelText(/seu nome/i);
    fireEvent.change(nameInput, { target: { value: 'TestUser' } });

    // Select avatar 5
    const options = screen.getAllByRole('radio');
    fireEvent.click(options[4]);

    // Click confirm - button label changes to "Entrar como TestUser" when form is valid
    const confirmBtn = screen.getByRole('button', { name: /entrar como/i });
    fireEvent.click(confirmBtn);

    expect(localStorage.getItem('avatar_id')).toBe('5');
    expect(onSelect).toHaveBeenCalledWith(5, 'TestUser');
  });

  it('disables confirm button when no avatar is selected and no name entered', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    const confirmBtn = screen.getByRole('button', { name: /preencha nome e selecione avatar/i });
    expect(confirmBtn.getAttribute('aria-disabled')).toBe('true');
  });

  it('calls onSelect with the correct ID and name', () => {
    const onSelect = vi.fn();
    render(<AvatarSelector onSelect={onSelect} />);

    // Type a name
    const nameInput = screen.getByLabelText(/seu nome/i);
    fireEvent.change(nameInput, { target: { value: 'Player1' } });

    const options = screen.getAllByRole('radio');
    fireEvent.click(options[14]); // Avatar 15

    const confirmBtn = screen.getByRole('button', { name: /entrar como/i });
    fireEvent.click(confirmBtn);

    expect(onSelect).toHaveBeenCalledWith(15, 'Player1');
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
    expect(options[17].getAttribute('data-avatar-id')).toBe('18');
  });
});
