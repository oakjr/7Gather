import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CallNotification, CallInfo, formatElapsed } from './CallNotification';
import { CALL_TIMEOUT_MS, MAX_VISIBLE_CALLS } from '../../../shared/constants';

describe('CallNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeCalls(count: number, baseTimestamp?: number): CallInfo[] {
    const base = baseTimestamp ?? Date.now();
    return Array.from({ length: count }, (_, i) => ({
      callerId: `caller-${i}`,
      callerName: `User ${i}`,
      timestamp: base - i * 1000, // each 1s apart
      callerLeft: false,
    }));
  }

  describe('formatElapsed', () => {
    it('formats seconds only when under a minute', () => {
      const now = 1000000;
      const timestamp = now - 5000; // 5 seconds ago
      expect(formatElapsed(timestamp, now)).toBe('5s atrás');
    });

    it('formats minutes and seconds', () => {
      const now = 1000000;
      const timestamp = now - 125000; // 2m 5s ago
      expect(formatElapsed(timestamp, now)).toBe('2m 5s atrás');
    });

    it('formats zero seconds for current time', () => {
      const now = 1000000;
      expect(formatElapsed(now, now)).toBe('0s atrás');
    });

    it('handles future timestamps gracefully (clamps to 0)', () => {
      const now = 1000000;
      const timestamp = now + 5000; // future
      expect(formatElapsed(timestamp, now)).toBe('0s atrás');
    });
  });

  describe('rendering', () => {
    it('renders nothing when calls array is empty', () => {
      const { container } = render(
        <CallNotification calls={[]} onGo={vi.fn()} onDismiss={vi.fn()} />
      );
      expect(container.querySelector('.call-notification-container')).toBeNull();
    });

    it('renders a notification with caller name', () => {
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: Date.now() - 3000,
        callerLeft: false,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={vi.fn()} />);

      expect(screen.getByText('Alice')).toBeDefined();
    });

    it('renders elapsed time in correct format', () => {
      vi.setSystemTime(new Date(1000000));
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: 1000000 - 10000, // 10s ago
        callerLeft: false,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={vi.fn()} />);

      expect(screen.getByText('10s atrás')).toBeDefined();
    });

    it('renders "Ir" button with rocket emoji', () => {
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: Date.now(),
        callerLeft: false,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={vi.fn()} />);

      const goBtn = screen.getByTitle('Ir');
      expect(goBtn.textContent).toContain('🚀');
      expect(goBtn.textContent).toContain('Ir');
    });
  });

  describe('stacking (FIFO, max 3)', () => {
    it('shows max 3 notifications when more calls arrive', () => {
      const calls = makeCalls(5);
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={vi.fn()} />);

      const toasts = document.querySelectorAll('.call-notification-toast');
      expect(toasts.length).toBe(MAX_VISIBLE_CALLS);
    });

    it('shows the most recent calls (discards oldest)', () => {
      const now = Date.now();
      const calls: CallInfo[] = [
        { callerId: 'oldest', callerName: 'Oldest', timestamp: now - 5000, callerLeft: false },
        { callerId: 'old', callerName: 'Old', timestamp: now - 4000, callerLeft: false },
        { callerId: 'mid', callerName: 'Mid', timestamp: now - 3000, callerLeft: false },
        { callerId: 'new', callerName: 'New', timestamp: now - 2000, callerLeft: false },
        { callerId: 'newest', callerName: 'Newest', timestamp: now - 1000, callerLeft: false },
      ];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={vi.fn()} />);

      // Should show the last 3 (Mid, New, Newest)
      expect(screen.queryByText('Oldest')).toBeNull();
      expect(screen.queryByText('Old')).toBeNull();
      expect(screen.getByText('Mid')).toBeDefined();
      expect(screen.getByText('New')).toBeDefined();
      expect(screen.getByText('Newest')).toBeDefined();
    });

    it('shows all notifications when count is at or below max', () => {
      const calls = makeCalls(3);
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={vi.fn()} />);

      const toasts = document.querySelectorAll('.call-notification-toast');
      expect(toasts.length).toBe(3);
    });
  });

  describe('elapsed time updates', () => {
    it('updates elapsed time every second', () => {
      vi.setSystemTime(new Date(100000));
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: 100000,
        callerLeft: false,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={vi.fn()} />);

      expect(screen.getByText('0s atrás')).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(3000);
        vi.setSystemTime(new Date(103000));
      });

      expect(screen.getByText('3s atrás')).toBeDefined();
    });
  });

  describe('auto-dismiss after 60s', () => {
    it('calls onDismiss after CALL_TIMEOUT_MS elapses', () => {
      vi.setSystemTime(new Date(100000));
      const onDismiss = vi.fn();
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: 100000,
        callerLeft: false,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={onDismiss} />);

      expect(onDismiss).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(CALL_TIMEOUT_MS);
      });

      expect(onDismiss).toHaveBeenCalledWith('c1');
    });

    it('calculates remaining time based on elapsed since timestamp', () => {
      vi.setSystemTime(new Date(100000));
      const onDismiss = vi.fn();
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: 100000 - 30000, // already 30s old
        callerLeft: false,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={onDismiss} />);

      // Should dismiss after remaining 30s
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      expect(onDismiss).toHaveBeenCalledWith('c1');
    });

    it('dismisses immediately if call is already past timeout', () => {
      vi.setSystemTime(new Date(200000));
      const onDismiss = vi.fn();
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: 200000 - CALL_TIMEOUT_MS - 1000, // 1s past timeout
        callerLeft: false,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={onDismiss} />);

      expect(onDismiss).toHaveBeenCalledWith('c1');
    });
  });

  describe('Ir button interaction', () => {
    it('calls onGo and onDismiss when "Ir" button is clicked', () => {
      const onGo = vi.fn();
      const onDismiss = vi.fn();
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: Date.now(),
        callerLeft: false,
      }];
      render(<CallNotification calls={calls} onGo={onGo} onDismiss={onDismiss} />);

      const goBtn = screen.getByTitle('Ir');
      fireEvent.click(goBtn);

      expect(onGo).toHaveBeenCalledWith('c1');
      expect(onDismiss).toHaveBeenCalledWith('c1');
    });

    it('disables "Ir" button when caller has left', () => {
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: Date.now(),
        callerLeft: true,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={vi.fn()} />);

      const goBtn = screen.getByTitle('Ir') as HTMLButtonElement;
      expect(goBtn.disabled).toBe(true);
    });

    it('shows "Chamador saiu da sala" message when caller leaves', () => {
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: Date.now(),
        callerLeft: true,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={vi.fn()} />);

      expect(screen.getByText('Chamador saiu da sala')).toBeDefined();
    });

    it('does not show "Chamador saiu da sala" when caller is still present', () => {
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: Date.now(),
        callerLeft: false,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={vi.fn()} />);

      expect(screen.queryByText('Chamador saiu da sala')).toBeNull();
    });
  });

  describe('dismiss button', () => {
    it('calls onDismiss when dismiss button is clicked', () => {
      const onDismiss = vi.fn();
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: Date.now(),
        callerLeft: false,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={onDismiss} />);

      const dismissBtn = screen.getByTitle('Dispensar');
      fireEvent.click(dismissBtn);

      expect(onDismiss).toHaveBeenCalledWith('c1');
    });
  });

  describe('accessibility', () => {
    it('has proper region role and aria-label', () => {
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: Date.now(),
        callerLeft: false,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={vi.fn()} />);

      const region = screen.getByRole('region');
      expect(region.getAttribute('aria-label')).toBe('Notificações de chamada');
    });

    it('has aria-label on "Ir" button with caller name', () => {
      const calls: CallInfo[] = [{
        callerId: 'c1',
        callerName: 'Alice',
        timestamp: Date.now(),
        callerLeft: false,
      }];
      render(<CallNotification calls={calls} onGo={vi.fn()} onDismiss={vi.fn()} />);

      const goBtn = screen.getByTitle('Ir');
      expect(goBtn.getAttribute('aria-label')).toBe('Ir até Alice');
    });
  });
});
