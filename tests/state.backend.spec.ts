// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { beforeEach, describe, expect, it } from "vitest";
import { backendError, backendReady, resetPrototypeStateForTests, submitAppointment, todayInputDate } from "../src/state";

describe("backend state guards", () => {
  beforeEach(async () => {
    await resetPrototypeStateForTests();
  });

  it("blocks replicated writes while backend initialization is still running", async () => {
    backendReady.value = false;
    backendError.value = "";

    await expect(submitAppointment()).rejects.toThrow("Backend is still initializing.");
  });

  it("reports the backend initialization error instead of the placeholder repository error", async () => {
    backendReady.value = true;
    backendError.value = "Failed to dial trusted node.";

    await expect(submitAppointment()).rejects.toThrow("Failed to dial trusted node.");
  });

  it("formats date input defaults from local date parts instead of UTC serialization", () => {
    const localDate = {
      getFullYear: () => 2026,
      getMonth: () => 6,
      getDate: () => 6,
      toISOString: () => "2026-07-05T21:30:00.000Z",
    } as unknown as Date;

    expect(todayInputDate(localDate)).toBe("2026-07-06");
  });
});
