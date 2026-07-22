// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import { roleStatusMailText } from "./controlObserver.js";

describe("role status email", () => {
  it("confirms an approved Doctor role in Russian", () => {
    expect(roleStatusMailText("doctor", "approved")).toBe("Ваша роль «Врач» подтверждена.");
  });

  it("confirms an approved Administrator role in Russian", () => {
    expect(roleStatusMailText("administrator", "approved")).toBe("Ваша роль «Администратор» подтверждена.");
  });

  it("uses the same confirmation template for every localized role", () => {
    expect(roleStatusMailText("owner", "approved")).toBe("Ваша роль «Владелец» подтверждена.");
  });

  it.each([
    ["not_requested", "Роль «Врач» не запрошена."],
    ["pending", "Ваша заявка на роль «Врач» ожидает подтверждения."],
    ["rejected", "Ваша заявка на роль «Врач» отклонена."],
    ["suspended", "Ваша роль «Врач» приостановлена."],
    ["revoked", "Ваша роль «Врач» отозвана."],
    ["expired", "Срок действия вашей роли «Врач» истёк."],
  ])("localizes the %s transition", (status, expected) => {
    expect(roleStatusMailText("doctor", status)).toBe(expected);
  });
});
