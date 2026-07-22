// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const password = "correct horse battery";
const replicationTimeout = 30_000;
const execFile = promisify(execFileCallback);
const mailpitUrl = process.env.KLINOK_E2E_MAILPIT_URL ?? "http://localhost:8025";

async function verificationLink(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const list = await request.get(`${mailpitUrl}/api/v1/messages`);
    const messages = (await list.json()).messages as Array<{ ID: string }>;
    for (const summary of messages) {
      const message = await request.get(`${mailpitUrl}/api/v1/message/${summary.ID}`);
      const body = await message.json() as { Text?: string; HTML?: string; To?: Array<{ Address?: string }> };
      if (body.To?.length && !body.To.some((recipient) => recipient.Address?.toLocaleLowerCase() === email.toLocaleLowerCase())) continue;
      const match = `${body.Text ?? ""} ${body.HTML ?? ""}`.match(/https?:\/\/[^\s<]+\/auth\/verify-email\?token=[^\s<]+/);
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Verification email for ${email} was not captured by Mailpit.`);
}

async function expectEmailText(request: APIRequestContext, email: string, expectedText: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const list = await request.get(`${mailpitUrl}/api/v1/messages`);
    const messages = (await list.json()).messages as Array<{ ID: string }>;
    for (const summary of messages) {
      const message = await request.get(`${mailpitUrl}/api/v1/message/${summary.ID}`);
      const body = await message.json() as { Text?: string; To?: Array<{ Address?: string }> };
      if (body.To?.some((recipient) => recipient.Address?.toLocaleLowerCase() === email.toLocaleLowerCase()) && body.Text?.includes(expectedText)) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Email containing "${expectedText}" for ${email} was not captured by Mailpit.`);
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
  await page.getByLabel("Повторите пароль").fill(password);
  if (input.role === "doctor") {
    await page.getByLabel("Ветеринар").check();
  }
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel(/регистрируюсь в тестовой системе/).check();
  await page.getByLabel(/не использовать при регистрации/).check();
  await page.getByLabel(/исполнилось 18/).check();
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page).toHaveURL(/\/auth\/verify-email$/);
  await expect(page.getByText(/Перейдите в Вашу программу электронной почты/)).toBeVisible();
  await page.goto(await verificationLink(request, input.email));
  await expect(page.getByText(/Почта подтверждена/)).toBeVisible();
}

async function login(page: Page, email: string, accountPassword = password) {
  await page.goto("/auth/login");
  await page.getByLabel("Электронная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(accountPassword);
  await page.getByRole("button", { name: "Войти" }).click();
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

async function openProfileAndWaitForSync(page: Page) {
  if (new URL(page.url()).pathname !== "/profile") {
    await page.locator(".workspace-sidebar").getByRole("button", { name: "Настройки пользователя" }).click();
  }
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.locator(".profile-sync-status .sync-status"))
    .toContainText("Сохранено", { timeout: replicationTimeout });
}

async function clearBrowserStorage(page: Page) {
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const databases = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
    for (const database of databases) {
      if (!database.name) continue;
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database.name!);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`IndexedDB ${database.name} is still open.`));
      });
    }
  });
}

async function restartTrustedNode() {
  await execFile("docker", ["compose", "restart", "p2p"], { cwd: process.cwd(), env: process.env });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await execFile("docker", ["compose", "exec", "-T", "p2p", "node", "-e", "fetch('http://127.0.0.1:8091/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"], {
        cwd: process.cwd(), env: process.env,
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("Trusted P2P node did not become healthy after restart.");
}

test("fresh provisioning, Doctor approval, grant, draft, and confirmation", async ({ browser, request }) => {
  test.slow();
  const suffix = Date.now();
  const doctorEmail = `doctor-${suffix}@example.ru`;
  const ownerEmail = `owner-${suffix}@example.ru`;
  const doctorPage = await newPage(await browser.newContext(), "doctor");
  await register(doctorPage, request, { firstName: "Анна", lastName: "Врач", email: doctorEmail, role: "doctor" });
  await login(doctorPage, doctorEmail);
  await expect(doctorPage).toHaveURL(/\/profile/, { timeout: replicationTimeout });
  const doctorAccountId = await accountId(doctorPage);
  await expect(doctorPage.getByText("Ожидает решения")).toBeVisible();

  const administratorPage = await newPage(await browser.newContext(), "administrator");
  await login(administratorPage, process.env.KLINOK_E2E_BOOTSTRAP_EMAIL ?? "administrator@example.ru", process.env.KLINOK_E2E_BOOTSTRAP_PASSWORD ?? "bootstrap-password-2026");
  await expect(administratorPage).toHaveURL(/\/admin\/home/);
  const requestRow = administratorPage.locator(".administrator-table tbody tr").filter({ hasText: doctorAccountId });
  await expect(requestRow).toBeVisible({ timeout: replicationTimeout });
  await requestRow.getByRole("button", { name: "Одобрить роль «Ветеринар»", exact: true }).click();
  const approvalDialog = administratorPage.getByRole("dialog", { name: "Одобрить роль «Ветеринар»?" });
  await expect(approvalDialog).toBeVisible();
  await approvalDialog.getByRole("button", { name: "Одобрить", exact: true }).click();
  await expect(approvalDialog).toBeHidden();
  await expectEmailText(request, doctorEmail, "Ваша роль «Врач» подтверждена.");

  await doctorPage.bringToFront();
  const doctorHome = doctorPage.locator(".workspace-sidebar").getByRole("link", { name: "Мед. карты" });
  await expect(doctorHome).toBeVisible({ timeout: replicationTimeout });
  await doctorHome.click();
  await expect(doctorPage).toHaveURL(/\/doctor\/home/);

  const ownerPage = await newPage(await browser.newContext(), "owner");
  await register(ownerPage, request, { firstName: "Ольга", lastName: "Владелец", email: ownerEmail, role: "owner" });
  await login(ownerPage, ownerEmail);
  await expect(ownerPage).toHaveURL(/\/owner\/home/);
  await ownerPage.locator(".workspace-sidebar").getByRole("link", { name: "Добавить питомца" }).click();
  await expect(ownerPage).toHaveURL(/\/owner\/pets\/new/);
  await ownerPage.getByLabel("Кличка").fill("Шарик");
  await ownerPage.getByLabel("Вид").fill("Собака");
  await ownerPage.getByLabel("Порода").fill("Бигль");
  await ownerPage.getByLabel("Пол").selectOption("Интактный самец");
  await ownerPage.getByLabel("Точная дата рождения", { exact: true }).fill("2022-06-17");
  await ownerPage.getByLabel("Окрас").fill("трёхцветный");
  await ownerPage.getByLabel("Вес, кг").fill("12.4");
  await ownerPage.getByLabel("Заметки").fill("Первичная заметка");
  await ownerPage.getByRole("button", { name: "Сохранить питомца" }).click();
  await expect(ownerPage).toHaveURL(/\/owner\/pets\/[0-9a-f-]+$/i);
  const petId = new URL(ownerPage.url()).pathname.split("/").at(-1)!;
  await expect(ownerPage.getByText("Первичная заметка")).toBeVisible();
  await ownerPage.getByRole("link", { name: "Редактировать" }).click();
  await ownerPage.getByLabel("Заметки").fill("Наблюдать за аппетитом");
  await ownerPage.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(ownerPage.getByText("Наблюдать за аппетитом")).toBeVisible();
  await openProfileAndWaitForSync(ownerPage);
  await ownerPage.locator(".workspace-sidebar").getByRole("link", { name: "Шарик", exact: true }).click();
  await expect(ownerPage).toHaveURL(new RegExp(`/owner/pets/${petId}$`));

  await doctorPage.bringToFront();
  await doctorPage.getByRole("button", { name: "Запросить доступ", exact: true }).click();
  const accessDialog = doctorPage.getByRole("dialog", { name: "Запросить доступ" });
  await accessDialog.getByLabel(/ФИО владельца, его часть или полный ID/).fill("Ольга Владелец");
  await accessDialog.getByLabel("Кличка, её часть или полный ID питомца").fill("Шарик");
  await accessDialog.getByRole("button", { name: "Найти питомца" }).click();
  const requestResult = accessDialog.locator(".doctor-request-result").filter({ hasText: petId });
  await expect(requestResult).toBeVisible({ timeout: replicationTimeout });
  await requestResult.getByRole("button", { name: "Отправить запрос" }).click();
  await expect(doctorPage.getByText("Запрос отправлен владельцу.")).toBeVisible();

  await ownerPage.bringToFront();
  await ownerPage.getByRole("link", { name: "Доступ врачей" }).click();
  await expect(ownerPage).toHaveURL(new RegExp(`/owner/pets/${petId}/access$`));
  const accessRequest = ownerPage.locator(".owner-access-table tbody tr").filter({ hasText: doctorAccountId });
  await expect(accessRequest).toBeVisible({ timeout: replicationTimeout });
  await accessRequest.getByRole("button", { name: "Предоставить доступ", exact: true }).click();
  await ownerPage.getByRole("link", { name: "Назад к информации о питомце" }).click();
  await expect(ownerPage).toHaveURL(new RegExp(`/owner/pets/${petId}$`));

  await doctorPage.bringToFront();
  await openProfileAndWaitForSync(doctorPage);
  await doctorPage.locator(".workspace-sidebar").getByRole("link", { name: "Мед. карты" }).click();
  await expect(doctorPage).toHaveURL(/\/doctor\/home/);
  const medicalCard = doctorPage.locator(".doctor-access-table tbody tr").filter({ hasText: petId });
  await expect(medicalCard).toBeVisible({ timeout: replicationTimeout });
  await medicalCard.getByRole("link", { name: "Открыть медицинскую карту" }).click();
  await expect(doctorPage).toHaveURL(new RegExp(`/doctor/pets/${petId}$`));
  await doctorPage.getByText("Всё хорошо, необходимо", { exact: true }).click();
  await doctorPage.getByLabel("Контрольный осмотр", { exact: true }).check();
  await doctorPage.getByLabel("Комментарий").fill("Состояние стабильное");
  await doctorPage.locator(".encounter-add-section select").selectOption("general-data");
  await doctorPage.getByLabel("Вес, кг", { exact: true }).fill("14.3");
  await doctorPage.getByRole("button", { name: "Сохранить запись" }).click();
  await expect(doctorPage.locator(".medical-record-entry-details").filter({ hasText: "Всё хорошо" })).toBeVisible();

  await ownerPage.bringToFront();
  const ownerRecord = ownerPage.locator(".medical-record-entry-details").filter({ hasText: "Всё хорошо" });
  await expect(ownerRecord).toBeVisible({ timeout: replicationTimeout });
  await ownerRecord.locator("summary").click();
  await expect(ownerRecord.getByText("Состояние стабильное", { exact: true })).toBeVisible();
  await expect(ownerRecord.getByText("14.3 кг", { exact: true })).toBeVisible();
  const profileWeight = ownerPage.locator(".pet-profile-view-fields > div").filter({ hasText: "Вес" });
  await expect(profileWeight).toContainText("12.4 кг");
  await ownerRecord.getByRole("button", { name: "Подтвердить запись" }).click();
  await expect(ownerRecord.getByText("Подтверждена", { exact: true })).toBeVisible();
  await expect(profileWeight).toContainText("14.3 кг");
  await openProfileAndWaitForSync(ownerPage);
  await ownerPage.locator(".workspace-sidebar").getByRole("link", { name: "Шарик", exact: true }).click();
  await expect(ownerPage).toHaveURL(new RegExp(`/owner/pets/${petId}$`));
  await ownerPage.getByRole("link", { name: "Доступ врачей" }).click();
  const activeAccess = ownerPage.locator(".owner-access-table tbody tr").filter({ hasText: "Анна Врач" });
  await activeAccess.getByRole("button", { name: "Отозвать доступ" }).click();
  await expect(ownerPage.getByText("Доступ отозван.")).toBeVisible();
  await openProfileAndWaitForSync(ownerPage);

  if (process.env.KLINOK_E2E_RESTART_P2P === "true") await restartTrustedNode();
  await ownerPage.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(ownerPage).toHaveURL(/\/auth\/login/);
  await clearBrowserStorage(ownerPage);
  await login(ownerPage, ownerEmail);
  await expect(ownerPage).toHaveURL(/\/(?:profile|owner\/home)/, { timeout: replicationTimeout });
  if (new URL(ownerPage.url()).pathname === "/profile") {
    const ownerRole = ownerPage.locator(".role-selection-card").filter({ hasText: "Владелец животного" });
    await expect(ownerRole.getByText("Одобрена", { exact: true })).toBeVisible({ timeout: replicationTimeout });
  }
  await openProfileAndWaitForSync(ownerPage);
  await ownerPage.locator(".workspace-sidebar").getByRole("link", { name: "Питомцы" }).click();
  await expect(ownerPage).toHaveURL(/\/owner\/home/);
  await expect(ownerPage.locator(".owner-pet-card strong").filter({ hasText: "Шарик" })).toBeVisible({ timeout: replicationTimeout });
});
