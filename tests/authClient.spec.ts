import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthClient, AuthClientError } from "../src/repositories/authClient";

afterEach(() => vi.unstubAllGlobals());

describe("auth client", () => {
  it("uses same-origin credentials and forwards the session CSRF token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, accountId: "a1", csrfToken: "csrf" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ loggedOut: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AuthClient();
    await client.session();
    await client.logout();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
    expect((fetchMock.mock.calls[1][1].headers as Headers).get("X-CSRF-Token")).toBe("csrf");
  });

  it("maps stable API error codes to typed errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "LOGIN_FAILED", message: "Ошибка входа" } }), { status: 401 })));
    await expect(new AuthClient().login("a@b.ru", "password")).rejects.toMatchObject<AuthClientError>({ code: "LOGIN_FAILED", status: 401 });
  });

  it("encodes owner and pet directory search terms", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], page: 1, pageSize: 50, total: 0, pageCount: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new AuthClient().searchDirectoryPets("Иванов Иван", "Барс", 1, 50);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/directory/pets?owner=%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2+%D0%98%D0%B2%D0%B0%D0%BD&pet=%D0%91%D0%B0%D1%80%D1%81&page=1&pageSize=50&sort=owner");
  });

  it("sends the doctor pet sort field and direction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], page: 1, pageSize: 10, total: 0, pageCount: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new AuthClient().getMyDirectoryPets("Буся", 2, 10, "pet", "desc");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/directory/my-pets?query=%D0%91%D1%83%D1%81%D1%8F&page=2&pageSize=10&sort=pet&direction=desc");
  });

  it("sends credential changes through an authenticated CSRF request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, csrfToken: "csrf" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ updated: true, email: "new@example.ru" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AuthClient();
    await client.session();
    await client.updateCredentials({ email: "new@example.ru", password: "a completely new password" });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/credentials");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PATCH", credentials: "include" });
    expect((fetchMock.mock.calls[1][1].headers as Headers).get("X-CSRF-Token")).toBe("csrf");
  });

  it("requests and answers a bootstrap replacement challenge with CSRF protection", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, csrfToken: "csrf" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ challenge: "nonce", expiresAt: "2026-07-21T00:05:00.000Z" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ certificate: {}, enrollment: {}, revokedDeviceIds: ["old-device"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AuthClient();
    await client.session();
    await client.bootstrapDeviceReplacementChallenge();
    await client.replaceBootstrapDevice({
      action: "bootstrap-device-replacement",
      challenge: "nonce",
      accountId: "bootstrap-administrator",
      deviceId: "new-device",
      deviceName: "Новый ноутбук",
      orbitIdentityId: "orbit-new",
      userKeyVersion: 1,
      signingPublicKey: { kty: "EC" },
      encryptionPublicKey: { kty: "RSA" },
    }, "signed-proof");

    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/bootstrap-device-replacement/challenge");
    expect(fetchMock.mock.calls[2][0]).toBe("/api/auth/bootstrap-device-replacement");
    expect(fetchMock.mock.calls.slice(1).every((call) =>
      (call[1].headers as Headers).get("X-CSRF-Token") === "csrf")).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toMatchObject({
      payload: { deviceId: "new-device", challenge: "nonce" },
      signature: "signed-proof",
    });
  });

  it("uploads, retrieves, and rotates the server-held key set without caching", async () => {
    const userKeySet = {
      version: 2,
      signingPublicKey: { kty: "EC" },
      signingPrivateKey: { kty: "EC", d: "private-signing" },
      encryptionPublicKey: { kty: "RSA" },
      encryptionPrivateKey: { kty: "RSA", d: "private-encryption" },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, csrfToken: "csrf" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stored: true, version: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ userKeySet }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revoked: true, rotateUserKeys: true, revokedDeviceIds: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AuthClient();
    await client.session();
    await client.putUserKeySet(userKeySet);
    await client.getUserKeySet();
    await client.revokeDevice("old-device", userKeySet);

    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/user-key-set");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PUT" });
    expect(fetchMock.mock.calls[2][0]).toBe("/api/auth/user-key-set");
    expect(fetchMock.mock.calls[3][0]).toBe("/api/auth/devices/old-device");
    expect(JSON.parse(fetchMock.mock.calls[3][1].body as string)).toEqual({ userKeySet });
    expect((fetchMock.mock.calls[3][1].headers as Headers).get("X-CSRF-Token")).toBe("csrf");
  });
});
