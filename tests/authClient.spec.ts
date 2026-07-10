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
});
