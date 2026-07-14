import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDeviceId,
  getDeviceName,
  getOrCreateDeviceId,
  getOrCreateDeviceName,
  setDeviceName,
} from "../src/repositories/deviceVault";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("local device identity", () => {
  it("reuses the same device ID across application restarts", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();
    expect(first).toBe("11111111-1111-4111-8111-111111111111");
    expect(second).toBe(first);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);

    clearDeviceId();
    const replacement = getOrCreateDeviceId();
    expect(replacement).toBe("22222222-2222-4222-8222-222222222222");
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2);
  });

  it("keeps a recognizable, user-editable device name", () => {
    expect(getOrCreateDeviceName()).toBeTruthy();
    setDeviceName("Домашний ноутбук");
    expect(getDeviceName()).toBe("Домашний ноутбук");
    expect(getOrCreateDeviceName()).toBe("Домашний ноутбук");
  });
});
