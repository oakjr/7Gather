import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParticipantList, ParticipantInfo } from './ParticipantList';

const mockParticipants: ParticipantInfo[] = [
  { sessionId: 'session-1', displayName: 'Alice', avatarId: 2, currentZone: '' },
  { sessionId: 'session-2', displayName: 'Bob', avatarId: 8, currentZone: 'zone-meeting' },
  { sessionId: 'session-3', displayName: 'Charlie', avatarId: 14, currentZone: '' },
  { sessionId: 'session-4', displayName: 'Diana', avatarId: 18, currentZone: 'zone-private' },
];

describe('ParticipantList', () => {
  it('renders all participants with their names', () => {
    const onLocate = vi.fn();
    const onFollow = vi.fn();
    render(
      <ParticipantList
        participants={mockParticipants}
        onLocate={onLocate}
        onFollow={onFollow}
      />
    );

    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.getByText('Charlie')).toBeDefined();
    expect(screen.getByText('Diana')).toBeDefined();
  });

  it('renders avatar image for each participant', () => {
    const onLocate = vi.fn();
    const onFollow = vi.fn();
    render(
      <ParticipantList
        participants={mockParticipants}
        onLocate={onLocate}
        onFollow={onFollow}
      />
    );

    // Each participant should have an avatar label span
    const avatarLabels = screen.getAllByLabelText(/^Avatar:/);
    expect(avatarLabels).toHaveLength(4);
    // The component now renders <img> tags inside the avatar span
    avatarLabels.forEach((label) => {
      const img = label.querySelector('img');
      expect(img).not.toBeNull();
    });
  });

  it('shows private zone indicator for participants in a zone', () => {
    const onLocate = vi.fn();
    const onFollow = vi.fn();
    render(
      <ParticipantList
        participants={mockParticipants}
        onLocate={onLocate}
        onFollow={onFollow}
      />
    );

    // Bob and Diana are in private zones
    const zoneIndicators = screen.getAllByLabelText('Em zona privada');
    expect(zoneIndicators).toHaveLength(2);
  });

  it('does not show private zone indicator for participants in general area', () => {
    const onLocate = vi.fn();
    const onFollow = vi.fn();
    const generalParticipants: ParticipantInfo[] = [
      { sessionId: 's1', displayName: 'User1', avatarId: 1, currentZone: '' },
    ];
    render(
      <ParticipantList
        participants={generalParticipants}
        onLocate={onLocate}
        onFollow={onFollow}
      />
    );

    const zoneIndicators = screen.queryAllByLabelText('Em zona privada');
    expect(zoneIndicators).toHaveLength(0);
  });

  it('calls onLocate with correct sessionId when Localizar is clicked', () => {
    const onLocate = vi.fn();
    const onFollow = vi.fn();
    render(
      <ParticipantList
        participants={mockParticipants}
        onLocate={onLocate}
        onFollow={onFollow}
      />
    );

    const locateBtn = screen.getByLabelText('Localizar Bob');
    fireEvent.click(locateBtn);

    expect(onLocate).toHaveBeenCalledTimes(1);
    expect(onLocate).toHaveBeenCalledWith('session-2');
  });

  it('calls onFollow with correct sessionId when Seguir is clicked', () => {
    const onLocate = vi.fn();
    const onFollow = vi.fn();
    render(
      <ParticipantList
        participants={mockParticipants}
        onLocate={onLocate}
        onFollow={onFollow}
      />
    );

    const followBtn = screen.getByLabelText('Seguir Charlie');
    fireEvent.click(followBtn);

    expect(onFollow).toHaveBeenCalledTimes(1);
    expect(onFollow).toHaveBeenCalledWith('session-3');
  });

  it('renders Localizar and Seguir buttons for each participant', () => {
    const onLocate = vi.fn();
    const onFollow = vi.fn();
    render(
      <ParticipantList
        participants={mockParticipants}
        onLocate={onLocate}
        onFollow={onFollow}
      />
    );

    const locateButtons = screen.getAllByRole('button', { name: /localizar/i });
    const followButtons = screen.getAllByRole('button', { name: /seguir/i });
    expect(locateButtons).toHaveLength(4);
    expect(followButtons).toHaveLength(4);
  });

  it('renders empty state when no participants', () => {
    const onLocate = vi.fn();
    const onFollow = vi.fn();
    render(
      <ParticipantList
        participants={[]}
        onLocate={onLocate}
        onFollow={onFollow}
      />
    );

    expect(screen.getByText('Nenhum participante na sala.')).toBeDefined();
  });

  it('has proper ARIA region and heading', () => {
    const onLocate = vi.fn();
    const onFollow = vi.fn();
    render(
      <ParticipantList
        participants={mockParticipants}
        onLocate={onLocate}
        onFollow={onFollow}
      />
    );

    const region = screen.getByRole('region');
    expect(region.getAttribute('aria-labelledby')).toBe('participant-list-title');
    expect(screen.getByText('Participantes')).toBeDefined();
  });

  it('renders data-session-id attribute for each participant item', () => {
    const onLocate = vi.fn();
    const onFollow = vi.fn();
    render(
      <ParticipantList
        participants={mockParticipants}
        onLocate={onLocate}
        onFollow={onFollow}
      />
    );

    const listItems = screen.getAllByRole('listitem');
    expect(listItems[0].getAttribute('data-session-id')).toBe('session-1');
    expect(listItems[1].getAttribute('data-session-id')).toBe('session-2');
  });

  it('renders accessible list with proper label', () => {
    const onLocate = vi.fn();
    const onFollow = vi.fn();
    render(
      <ParticipantList
        participants={mockParticipants}
        onLocate={onLocate}
        onFollow={onFollow}
      />
    );

    const list = screen.getByRole('list', { name: 'Lista de participantes' });
    expect(list).toBeDefined();
  });

  describe('Poke button (Chamar)', () => {
    it('renders poke button for all participants except current user', () => {
      const onLocate = vi.fn();
      const onFollow = vi.fn();
      const onPoke = vi.fn();
      render(
        <ParticipantList
          participants={mockParticipants}
          currentUserSessionId="session-1"
          onLocate={onLocate}
          onFollow={onFollow}
          onPoke={onPoke}
        />
      );

      // Alice is current user, no poke button for her
      expect(screen.queryByLabelText('Chamar Alice')).toBeNull();
      // Other participants should have poke buttons
      expect(screen.getByLabelText('Chamar Bob')).toBeDefined();
      expect(screen.getByLabelText('Chamar Charlie')).toBeDefined();
      expect(screen.getByLabelText('Chamar Diana')).toBeDefined();
    });

    it('does not render poke buttons when onPoke prop is not provided', () => {
      const onLocate = vi.fn();
      const onFollow = vi.fn();
      render(
        <ParticipantList
          participants={mockParticipants}
          currentUserSessionId="session-1"
          onLocate={onLocate}
          onFollow={onFollow}
        />
      );

      expect(screen.queryByLabelText('Chamar Bob')).toBeNull();
      expect(screen.queryByLabelText('Chamar Charlie')).toBeNull();
    });

    it('calls onPoke with sessionId when poke button is clicked for a connected participant', () => {
      const onLocate = vi.fn();
      const onFollow = vi.fn();
      const onPoke = vi.fn();
      render(
        <ParticipantList
          participants={mockParticipants}
          currentUserSessionId="session-1"
          onLocate={onLocate}
          onFollow={onFollow}
          onPoke={onPoke}
        />
      );

      const pokeBtn = screen.getByLabelText('Chamar Bob');
      fireEvent.click(pokeBtn);

      expect(onPoke).toHaveBeenCalledTimes(1);
      expect(onPoke).toHaveBeenCalledWith('session-2');
    });

    it('shows inline error when poking a disconnected participant', () => {
      const onLocate = vi.fn();
      const onFollow = vi.fn();
      const onPoke = vi.fn();
      const participantsWithDisconnected: ParticipantInfo[] = [
        { sessionId: 'session-1', displayName: 'Alice', avatarId: 2, currentZone: '', isConnected: true },
        { sessionId: 'session-2', displayName: 'Bob', avatarId: 8, currentZone: '', isConnected: false },
      ];
      render(
        <ParticipantList
          participants={participantsWithDisconnected}
          currentUserSessionId="session-1"
          onLocate={onLocate}
          onFollow={onFollow}
          onPoke={onPoke}
        />
      );

      const pokeBtn = screen.getByLabelText('Chamar Bob');
      fireEvent.click(pokeBtn);

      expect(onPoke).not.toHaveBeenCalled();
      expect(screen.getByText('Participante indisponível')).toBeDefined();
      expect(screen.getByRole('alert')).toBeDefined();
    });

    it('does not show error when poking a connected participant', () => {
      const onLocate = vi.fn();
      const onFollow = vi.fn();
      const onPoke = vi.fn();
      const participantsConnected: ParticipantInfo[] = [
        { sessionId: 'session-1', displayName: 'Alice', avatarId: 2, currentZone: '', isConnected: true },
        { sessionId: 'session-2', displayName: 'Bob', avatarId: 8, currentZone: '', isConnected: true },
      ];
      render(
        <ParticipantList
          participants={participantsConnected}
          currentUserSessionId="session-1"
          onLocate={onLocate}
          onFollow={onFollow}
          onPoke={onPoke}
        />
      );

      const pokeBtn = screen.getByLabelText('Chamar Bob');
      fireEvent.click(pokeBtn);

      expect(onPoke).toHaveBeenCalledWith('session-2');
      expect(screen.queryByText('Participante indisponível')).toBeNull();
    });

    it('treats participant without isConnected field as connected', () => {
      const onLocate = vi.fn();
      const onFollow = vi.fn();
      const onPoke = vi.fn();
      const participantsNoField: ParticipantInfo[] = [
        { sessionId: 'session-1', displayName: 'Alice', avatarId: 2, currentZone: '' },
        { sessionId: 'session-2', displayName: 'Bob', avatarId: 8, currentZone: '' },
      ];
      render(
        <ParticipantList
          participants={participantsNoField}
          currentUserSessionId="session-1"
          onLocate={onLocate}
          onFollow={onFollow}
          onPoke={onPoke}
        />
      );

      const pokeBtn = screen.getByLabelText('Chamar Bob');
      fireEvent.click(pokeBtn);

      expect(onPoke).toHaveBeenCalledWith('session-2');
      expect(screen.queryByText('Participante indisponível')).toBeNull();
    });
  });
});
