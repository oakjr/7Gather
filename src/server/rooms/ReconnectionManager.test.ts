import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ReconnectionManager } from "./ReconnectionManager";
import { RECONNECT_TIMEOUT_MS } from "../../shared/constants";

describe("ReconnectionManager", () => {
  let manager: ReconnectionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ReconnectionManager(RECONNECT_TIMEOUT_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("trackActivity", () => {
    it("should track a client's activity", () => {
      manager.trackActivity("session1");
      expect(manager.trackedCount).toBe(1);
      expect(manager.getLastActivity("session1")).toBeDefined();
    });

    it("should update timestamp on subsequent calls", () => {
      manager.trackActivity("session1");
      const firstTime = manager.getLastActivity("session1");

      vi.advanceTimersByTime(1000);
      manager.trackActivity("session1");
      const secondTime = manager.getLastActivity("session1");

      expect(secondTime).toBeGreaterThan(firstTime!);
    });

    it("should clear reconnecting state when activity is tracked", () => {
      manager.markReconnecting("session1");
      expect(manager.isReconnecting("session1")).toBe(true);

      manager.trackActivity("session1");
      expect(manager.isReconnecting("session1")).toBe(false);
    });
  });

  describe("markReconnecting / isReconnecting", () => {
    it("should mark a client as reconnecting", () => {
      manager.markReconnecting("session1");
      expect(manager.isReconnecting("session1")).toBe(true);
      expect(manager.reconnectingCount).toBe(1);
    });

    it("should return false for clients not reconnecting", () => {
      expect(manager.isReconnecting("unknown")).toBe(false);
    });
  });

  describe("markReconnected", () => {
    it("should clear reconnecting state and reset activity timestamp", () => {
      manager.trackActivity("session1");
      vi.advanceTimersByTime(3000);
      manager.markReconnecting("session1");

      manager.markReconnected("session1");

      expect(manager.isReconnecting("session1")).toBe(false);
      // Activity timestamp was just reset, so it should be recent
      const activity = manager.getLastActivity("session1")!;
      expect(Date.now() - activity).toBeLessThanOrEqual(0);
    });
  });

  describe("removeClient", () => {
    it("should remove client from all tracking", () => {
      manager.trackActivity("session1");
      manager.markReconnecting("session1");

      manager.removeClient("session1");

      expect(manager.trackedCount).toBe(0);
      expect(manager.reconnectingCount).toBe(0);
      expect(manager.getLastActivity("session1")).toBeUndefined();
    });
  });

  describe("getInactiveClients", () => {
    it("should return empty array when no clients are inactive", () => {
      manager.trackActivity("session1");
      expect(manager.getInactiveClients()).toEqual([]);
    });

    it("should detect clients inactive longer than threshold", () => {
      manager.trackActivity("session1");
      manager.trackActivity("session2");

      // Advance time past the threshold
      vi.advanceTimersByTime(RECONNECT_TIMEOUT_MS + 100);

      const inactive = manager.getInactiveClients();
      expect(inactive).toContain("session1");
      expect(inactive).toContain("session2");
    });

    it("should not include clients with recent activity", () => {
      manager.trackActivity("session1");
      manager.trackActivity("session2");

      vi.advanceTimersByTime(RECONNECT_TIMEOUT_MS + 100);

      // session2 sends activity again
      manager.trackActivity("session2");

      const inactive = manager.getInactiveClients();
      expect(inactive).toContain("session1");
      expect(inactive).not.toContain("session2");
    });

    it("should exclude clients in reconnecting state", () => {
      manager.trackActivity("session1");
      vi.advanceTimersByTime(RECONNECT_TIMEOUT_MS + 100);

      manager.markReconnecting("session1");

      // Even though session1 has been inactive > threshold,
      // it's excluded because allowReconnection is handling it
      const inactive = manager.getInactiveClients();
      expect(inactive).not.toContain("session1");
    });

    it("should use custom threshold when provided", () => {
      const customManager = new ReconnectionManager(2000);
      customManager.trackActivity("session1");

      vi.advanceTimersByTime(2500);
      expect(customManager.getInactiveClients()).toContain("session1");
    });
  });

  describe("clear", () => {
    it("should remove all tracked state", () => {
      manager.trackActivity("session1");
      manager.trackActivity("session2");
      manager.markReconnecting("session3");

      manager.clear();

      expect(manager.trackedCount).toBe(0);
      expect(manager.reconnectingCount).toBe(0);
    });
  });
});
