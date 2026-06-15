// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import App from "../src/App.vue";
import { routes } from "../src/router";
import { applyPetFilters, darkMode, petQuery, selectedRole } from "../src/state";

const mountedWrappers: ReturnType<typeof mount>[] = [];

async function mountAt(path = "/auth/role") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  });

  const wrapper = mount(App, {
    global: {
      plugins: [router],
    },
  });

  mountedWrappers.push(wrapper);

  await router.isReady();
  await router.push(path);
  await flushPromises();
  return { wrapper, router };
}

describe("App", () => {
  afterEach(() => {
    while (mountedWrappers.length) {
      mountedWrappers.pop()!.unmount();
    }
  });

  beforeEach(() => {
    selectedRole.value = "owner";
    petQuery.value = "";
    applyPetFilters("Все", "Все");
    darkMode.value = false;
  });

  it("walks through the auth routes and opens the owner home screen", async () => {
    const { wrapper, router } = await mountAt();

    expect(wrapper.text()).toContain("Добро пожаловать!");
    expect(wrapper.text()).toContain("Я - владелец животного");

    await wrapper.get("button.primary-action").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/auth/login");
    expect(wrapper.text()).toContain("С возвращением!");

    await wrapper.get("button.primary-action").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/auth/code");
    expect(wrapper.text()).toContain("Введите код из СМС");

    await wrapper.get("button.primary-action").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/auth/welcome");
    expect(wrapper.text()).toContain("Добро пожаловать, Даниил!");

    await wrapper.get("button.primary-action").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/owner/home");
    expect(wrapper.text()).toContain("Здравствуйте, Даниил !");
    expect(wrapper.text()).toContain("Мои питомцы");
  });

  it("filters pets by the search field", async () => {
    const { wrapper } = await mountAt("/owner/pets");

    await wrapper.get('input[placeholder="Кличка питомца"]').setValue("Чар");

    expect(wrapper.text()).toContain("Чарли");
    expect(wrapper.text()).not.toContain("Шарик");
  });

  it("submits booking and navigates to the success state", async () => {
    const { wrapper, router } = await mountAt("/owner/booking");

    await wrapper.get("button.primary-action.inline").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/owner/booking/success");
    expect(wrapper.text()).toContain("Заявка создана");
    expect(wrapper.text()).toContain("Откликнувшиеся врачи");
  });

  it("supports the add-analysis template flow", async () => {
    const { wrapper, router } = await mountAt("/owner/analysis");

    await wrapper.get('a[href="/owner/analysis/templates"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/owner/analysis/templates");
    expect(wrapper.text()).toContain("Общий анализ крови");

    await wrapper.findAll(".template-row")[1].trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/owner/analysis");
    expect(wrapper.text()).toContain("Биохимия");

    await wrapper.get("button.primary-action.inline").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/owner/analysis/saved");
    expect(wrapper.text()).toContain("Анализ сохранен");
  });

  it("renders profile subpages through stable routes", async () => {
    const { wrapper, router } = await mountAt("/owner/profile");

    await wrapper.get('a[href="/owner/profile/faq"]').trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/owner/profile/faq");
    expect(wrapper.text()).toContain("Как долго хранится история болезни?");
  });

  it("shows QA scenario menu only when requested", async () => {
    const hidden = await mountAt("/owner/home");
    expect(hidden.wrapper.text()).not.toContain("QA сценарии");

    const visible = await mountAt("/owner/home?qa=1");
    expect(visible.wrapper.text()).toContain("QA сценарии");
    expect(visible.wrapper.text()).toContain("owner-home");
  });

  it("does not render or keep device chrome selectors", async () => {
    const { wrapper } = await mountAt("/owner/home");
    const forbidden = ["status-bar", "dynamic-island", "home-indicator", "battery", "wifi", "signal"];

    for (const selector of forbidden) {
      expect(wrapper.html()).not.toContain(selector);
    }

    const sourceFiles = ["src/App.vue", "src/styles.css"];
    const combinedSource = sourceFiles
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n");

    for (const selector of forbidden) {
      expect(combinedSource).not.toContain(selector);
    }
  });
});
