// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const authMocks = vi.hoisted(() => ({
  session: vi.fn(),
  register: vi.fn(),
  verifyEmail: vi.fn(),
  login: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock("../src/runtimeConfig", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    authBaseUrl: "",
    legal: {
      personalDataConsent: { version: "consent-v1", href: "/consent" },
      userAgreement: { version: "terms-v1", href: "/terms" },
    },
    p2p: { bootstrapAccountId: "bootstrap-administrator" },
  })),
}));

vi.mock("../src/repositories/authClient", () => {
  class AuthClientError extends Error {
    constructor(readonly code: string, message: string, readonly status: number) {
      super(message);
    }
  }
  class AuthClient {
    session = authMocks.session;
    register = authMocks.register;
    verifyEmail = authMocks.verifyEmail;
    login = authMocks.login;
    forgotPassword = authMocks.forgotPassword;
    resetPassword = authMocks.resetPassword;
  }
  return { AuthClient, AuthClientError };
});

import {
  AUTH_SUCCESS_MESSAGES,
  appState,
  bootstrapApp,
  forgotPassword,
  register,
  resetPassword,
  verifyEmail,
} from "../src/appStore";
import { useAlertStore } from "../src/stores/alert";

const registration = {
  firstName: "Иван",
  lastName: "Иванов",
  email: "user@example.com",
  password: "correct horse battery",
  ageConfirmed: true,
  requestedRoles: ["owner" as const],
};

beforeAll(async () => {
  setActivePinia(createPinia());
  authMocks.session.mockResolvedValue({ authenticated: false });
  await bootstrapApp();
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  authMocks.register.mockResolvedValue({ accepted: true });
  authMocks.verifyEmail.mockResolvedValue({ verified: true });
  authMocks.forgotPassword.mockResolvedValue({ accepted: true });
  authMocks.resetPassword.mockResolvedValue({ reset: true });
});

describe("authentication feedback", () => {
  it("uses the centralized success-message catalog", async () => {
    await register(registration);
    expect(useAlertStore().alert).toEqual({
      kind: "success",
      text: AUTH_SUCCESS_MESSAGES.registration,
    });

    await verifyEmail("verification-token");
    expect(useAlertStore().alert).toEqual({ kind: "success", text: AUTH_SUCCESS_MESSAGES.verification });

    await forgotPassword("user@example.com");
    expect(useAlertStore().alert).toEqual({
      kind: "success",
      text: AUTH_SUCCESS_MESSAGES.recovery,
    });

    await resetPassword("reset-token", "new password");
    expect(useAlertStore().alert).toEqual({ kind: "success", text: AUTH_SUCCESS_MESSAGES["password-reset"] });
  });

  it("replaces stale success feedback with a caught error", async () => {
    await forgotPassword("user@example.com");
    authMocks.verifyEmail.mockRejectedValueOnce(new Error("Ссылка недействительна"));

    await expect(verifyEmail("expired-token")).rejects.toThrow("Ссылка недействительна");
    expect(useAlertStore().alert).toEqual({ kind: "error", text: "Ссылка недействительна" });
    expect(appState.busy).toBe(false);
  });

  it("normalizes unknown failures and supports explicit dismissal", async () => {
    authMocks.forgotPassword.mockRejectedValueOnce({ unexpected: true });

    await expect(forgotPassword("user@example.com")).rejects.toEqual({ unexpected: true });
    expect(useAlertStore().alert).toEqual({ kind: "error", text: "Не удалось выполнить операцию." });
    useAlertStore().clear();
    expect(useAlertStore().alert).toBeNull();
  });

  it("keeps recovery busy until the request completes", async () => {
    let resolveRequest!: (value: { accepted: true }) => void;
    authMocks.forgotPassword.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));

    const operation = forgotPassword("user@example.com");
    expect(appState.busy).toBe(true);
    expect(useAlertStore().alert).toBeNull();
    resolveRequest({ accepted: true });
    await operation;
    expect(appState.busy).toBe(false);
    expect(useAlertStore().alert?.kind).toBe("success");
  });
});
