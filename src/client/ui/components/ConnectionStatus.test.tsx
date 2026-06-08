import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus, RoomFullMessage } from './ConnectionStatus';

describe('ConnectionStatus', () => {
  it('displays connected state with green indicator', () => {
    render(<ConnectionStatus state="connected" />);

    expect(screen.getByText('Conectado')).toBeDefined();
    expect(screen.getByText('🟢')).toBeDefined();
  });

  it('displays reconnecting state with yellow indicator', () => {
    render(<ConnectionStatus state="reconnecting" />);

    expect(screen.getByText('Reconectando...')).toBeDefined();
    expect(screen.getByText('🟡')).toBeDefined();
  });

  it('displays disconnected state with red indicator', () => {
    render(<ConnectionStatus state="disconnected" />);

    expect(screen.getByText('Desconectado')).toBeDefined();
    expect(screen.getByText('🔴')).toBeDefined();
  });

  it('has role="status" for accessibility', () => {
    render(<ConnectionStatus state="connected" />);

    const status = screen.getByRole('status');
    expect(status).toBeDefined();
    expect(status.getAttribute('aria-atomic')).toBe('true');
  });

  it('uses aria-live="polite" for connected state', () => {
    render(<ConnectionStatus state="connected" />);

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('uses aria-live="assertive" for reconnecting state', () => {
    render(<ConnectionStatus state="reconnecting" />);

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('assertive');
  });

  it('uses aria-live="assertive" for disconnected state', () => {
    render(<ConnectionStatus state="disconnected" />);

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('assertive');
  });

  it('applies correct CSS class for connected state', () => {
    render(<ConnectionStatus state="connected" />);

    const status = screen.getByRole('status');
    expect(status.className).toContain('connection-status--connected');
  });

  it('applies correct CSS class for reconnecting state', () => {
    render(<ConnectionStatus state="reconnecting" />);

    const status = screen.getByRole('status');
    expect(status.className).toContain('connection-status--reconnecting');
  });

  it('applies correct CSS class for disconnected state', () => {
    render(<ConnectionStatus state="disconnected" />);

    const status = screen.getByRole('status');
    expect(status.className).toContain('connection-status--disconnected');
  });

  it('does not show error message when not provided', () => {
    render(<ConnectionStatus state="connected" />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('displays error message for audio/video errors', () => {
    render(
      <ConnectionStatus state="disconnected" errorMessage="Falha na conexão de áudio" />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
    expect(alert.textContent).toBe('Falha na conexão de áudio');
  });

  it('does not show error message when null', () => {
    render(<ConnectionStatus state="connected" errorMessage={null} />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hides icon from screen readers with aria-hidden', () => {
    render(<ConnectionStatus state="connected" />);

    const icon = screen.getByText('🟢');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('RoomFullMessage', () => {
  it('displays room full message with room name', () => {
    render(<RoomFullMessage roomName="Sala Principal" />);

    expect(screen.getByText('Sala Principal')).toBeDefined();
    expect(
      screen.getByText((_, element) => {
        return element?.textContent === 'A sala Sala Principal está cheia. Não é possível entrar no momento.';
      })
    ).toBeDefined();
  });

  it('has role="alert" for immediate accessibility notification', () => {
    render(<RoomFullMessage roomName="Dev Team" />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
    expect(alert.getAttribute('aria-live')).toBe('assertive');
    expect(alert.getAttribute('aria-atomic')).toBe('true');
  });

  it('renders warning icon hidden from screen readers', () => {
    render(<RoomFullMessage roomName="Test Room" />);

    const icon = screen.getByText('⚠️');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies room-full-message CSS class', () => {
    render(<RoomFullMessage roomName="Test" />);

    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('room-full-message');
  });

  it('renders room name in bold for emphasis', () => {
    render(<RoomFullMessage roomName="Engineering" />);

    const strong = screen.getByText('Engineering');
    expect(strong.tagName).toBe('STRONG');
  });
});
