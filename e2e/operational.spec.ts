import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

const password = "correct horse battery";
const replicationTimeout = 30_000;

async function verificationLink(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const list = await request.get("http://localhost:8025/api/v1/messages");
    const messages = (await list.json()).messages as Array<{ ID: string }>;
    for (const summary of messages) {
      const message = await request.get(`http://localhost:8025/api/v1/message/${summary.ID}`);
      const body = await message.json() as { Text?: string; HTML?: string; To?: Array<{ Address?: string }> };
      if (body.To?.length && !body.To.some((recipient) => recipient.Address?.toLocaleLowerCase() === email.toLocaleLowerCase())) continue;
      const match = `${body.Text ?? ""} ${body.HTML ?? ""}`.match(/https?:\/\/[^\s<]+\/auth\/verify-email\?token=[^\s<]+/);
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Verification email for ${email} was not captured by Mailpit.`);
}

async function register(page: Page, request: APIRequestContext, input: {
  firstName: string;
  lastName: string;
  email: string;
  role: "owner" | "doctor";
}) {
  await page.goto("/auth/register");
  await page.getByLabel("Имя").fill(input.firstName);
  await page.getByLabel("Фамилия").fill(input.lastName);
  await page.getByLabel("Электронная почта").fill(input.email);
  await page.getByLabel(/Пароль —/).fill(password);
  if (input.role === "doctor") {
    await page.getByLabel("Владелец животного").uncheck();
    await page.getByLabel("Врач").check();
  }
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel(/отдельно принимаю/).check();
  await page.getByLabel(/пользовательское соглашение/).check();
  await page.getByLabel(/исполнилось 18/).check();
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page.getByText(/Письмо отправлено/)).toBeVisible();
  await page.goto(await verificationLink(request, input.email));
  await expect(page.getByText(/Почта подтверждена/)).toBeVisible();
}

async function login(page: Page, email: string, accountPassword = password) {
  await page.goto("/auth/login");
  await page.getByLabel("Электронная почта").fill(email);
  await page.getByLabel("Пароль").fill(accountPassword);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/roles/);
}

async function accountId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const session = await fetch("/api/auth/session").then((response) => response.json()) as { accountId?: string };
    if (!session.accountId) throw new Error("Authenticated session did not include an account ID.");
    return session.accountId;
  });
}

async function newPage(context: BrowserContext, label: string): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes('"event":"p2p.') || message.type() === "error" || message.type() === "warning") {
      console.log(`[browser:${label}:${message.type()}] ${text}`);
    }
  });
  page.on("pageerror", (error) => console.error(`[browser:${label}:pageerror] ${error.message}`));
  page.on("requestfailed", (request) => console.error(`[browser:${label}:requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`));
  return page;
}

test("fresh provisioning, Doctor approval, grant, draft, and confirmation", async ({ browser, request }) => {
  test.slow();
  const suffix = Date.now();
  const doctorEmail = `doctor-${suffix}@example.ru`;
  const ownerEmail = `owner-${suffix}@example.ru`;
  const doctorPage = await newPage(await browser.newContext(), "doctor");
  await register(doctorPage, request, { firstName: "Анна", lastName: "Врач", email: doctorEmail, role: "doctor" });
  await login(doctorPage, doctorEmail);
  const doctorAccountId = await accountId(doctorPage);
  await expect(doctorPage.getByText("Ожидает решения")).toBeVisible();

  const administratorPage = await newPage(await browser.newContext(), "administrator");
  await login(administratorPage, process.env.KLINOK_E2E_BOOTSTRAP_EMAIL ?? "administrator@example.ru", process.env.KLINOK_E2E_BOOTSTRAP_PASSWORD ?? "bootstrap-password-2026");
  await expect(administratorPage.getByText(/Ключи этого аккаунта отсутствуют/)).toBeVisible();
  const recoveryBundle = process.env.KLINOK_E2E_RECOVERY_BUNDLE;
  if (!recoveryBundle) throw new Error("KLINOK_E2E_RECOVERY_BUNDLE is required for the composed E2E test.");
  await administratorPage.getByLabel("Пакет восстановления").setInputFiles({
    name: "bootstrap-recovery.bundle.json",
    mimeType: "application/json",
    buffer: Buffer.from(recoveryBundle),
  });
  await administratorPage.getByLabel("Пароль пакета").fill(process.env.KLINOK_E2E_RECOVERY_PASSPHRASE ?? "offline-recovery-passphrase-2026");
  await administratorPage.getByRole("button", { name: "Импортировать ключи" }).click();
  await administratorPage.getByRole("button", { name: "Использовать роль" }).click();
  await expect(administratorPage).toHaveURL(/\/admin\/home/);
  const requestRow = administratorPage.locator(".request-row").filter({ hasText: doctorAccountId });
  await expect(requestRow).toBeVisible({ timeout: replicationTimeout });
  await requestRow.getByRole("button", { name: "Одобрить" }).click();

  await doctorPage.bringToFront();
  await expect(doctorPage.getByRole("button", { name: "Использовать роль" })).toBeVisible({ timeout: replicationTimeout });
  await doctorPage.getByRole("button", { name: "Использовать роль" }).click();
  await expect(doctorPage).toHaveURL(/\/doctor\/home/);

  const ownerPage = await newPage(await browser.newContext(), "owner");
  await register(ownerPage, request, { firstName: "Ольга", lastName: "Владелец", email: ownerEmail, role: "owner" });
  await login(ownerPage, ownerEmail);
  await ownerPage.getByRole("button", { name: "Использовать роль" }).click();
  await expect(ownerPage).toHaveURL(/\/owner\/home/);
  await ownerPage.getByLabel("Кличка").fill("Шарик");
  await ownerPage.getByLabel("Порода").fill("Бигль");
  await ownerPage.getByRole("button", { name: "Сохранить питомца" }).click();
  await expect(ownerPage.locator(".pet-operational-card strong").filter({ hasText: "Шарик" })).toBeVisible();
  await ownerPage.getByLabel("Питомец").selectOption({ label: "Шарик" });
  await ownerPage.getByLabel("Идентификатор аккаунта врача").fill(doctorAccountId);
  await ownerPage.getByRole("button", { name: "Предоставить доступ" }).click();

  await doctorPage.bringToFront();
  await expect(doctorPage.locator(".pet-operational-card strong").filter({ hasText: "Шарик" })).toBeVisible({ timeout: replicationTimeout });
  await doctorPage.getByLabel("Питомец").selectOption({ label: "Шарик" });
  await doctorPage.getByLabel("Заголовок").fill("Осмотр");
  await doctorPage.getByRole("textbox", { name: "Запись", exact: true }).fill("Состояние стабильное");
  await doctorPage.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(doctorPage.getByText("Состояние стабильное")).toBeVisible();

  await ownerPage.bringToFront();
  await expect(ownerPage.getByText("Состояние стабильное")).toBeVisible({ timeout: replicationTimeout });
  await ownerPage.getByRole("button", { name: "Подтвердить" }).click();
  await expect(ownerPage.getByText("Подтверждена")).toBeVisible();
});
