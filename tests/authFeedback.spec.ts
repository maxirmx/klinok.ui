import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  appState,
  bootstrapApp,
  dismissAuthFeedback,
  forgotPassword,
  register,
  resetPassword,
  verifyEmail,
} from "../src/appStore";

const registration = {
  firstName: "Иван",
  lastName: "Иванов",
  email: "user@example.com",
  password: "correct horse battery",
  ageConfirmed: true,
  requestedRoles: ["owner" as const],
};

beforeAll(async () => {
  authMocks.session.mockResolvedValue({ authenticated: false });
  await bootstrapApp();
});

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.register.mockResolvedValue({ accepted: true });
  authMocks.verifyEmail.mockResolvedValue({ verified: true });
  authMocks.forgotPassword.mockResolvedValue({ accepted: true });
  authMocks.resetPassword.mockResolvedValue({ reset: true });
  dismissAuthFeedback();
});

describe("authentication feedback", () => {
  it("uses the centralized success-message catalog", async () => {
    await register(registration);
    expect(appState.feedback).toEqual({
      kind: "success",
      text: "Перейдите в Вашу программу электронной почты и откройте ссылку из письма для завершения регистрации.",
    });

    await verifyEmail("verification-token");
    expect(appState.feedback).toEqual({ kind: "success", text: "Почта подтверждена, Вы можете войти в систему." });

    await forgotPassword("user@example.com");
    expect(appState.feedback).toEqual({
      kind: "success",
      text: "Перейдите в Вашу программу электронной почты и откройте ссылку из письма для восстановления доступа.",
    });

    await resetPassword("reset-token", "new password");
    expect(appState.feedback).toEqual({ kind: "success", text: "Пароль изменён. Вы можете войти в систему." });
  });

  it("replaces stale success feedback with a caught error", async () => {
    await forgotPassword("user@example.com");
    authMocks.verifyEmail.mockRejectedValueOnce(new Error("Ссылка недействительна"));

    await expect(verifyEmail("expired-token")).rejects.toThrow("Ссылка недействительна");
    expect(appState.feedback).toEqual({ kind: "error", text: "Ссылка недействительна" });
    expect(appState.busy).toBe(false);
  });

  it("normalizes unknown failures and supports explicit dismissal", async () => {
    authMocks.forgotPassword.mockRejectedValueOnce({ unexpected: true });

    await expect(forgotPassword("user@example.com")).rejects.toEqual({ unexpected: true });
    expect(appState.feedback).toEqual({ kind: "error", text: "Не удалось выполнить операцию." });
    dismissAuthFeedback();
    expect(appState.feedback).toBeNull();
  });

  it("keeps recovery busy until the request completes", async () => {
    let resolveRequest!: (value: { accepted: true }) => void;
    authMocks.forgotPassword.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));

    const operation = forgotPassword("user@example.com");
    expect(appState.busy).toBe(true);
    expect(appState.feedback).toBeNull();
    resolveRequest({ accepted: true });
    await operation;
    expect(appState.busy).toBe(false);
    expect(appState.feedback?.kind).toBe("success");
  });
});
