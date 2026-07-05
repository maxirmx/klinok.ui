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
import { scenarioRegistry } from "../src/scenarios";
import { complaintRecords, drugRecords, resetPrototypeStateForTests } from "../src/state";
import { APP_VERSION } from "../src/version";

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

function resolveScenarioPath(path: string) {
  return path.replace(/:id/g, "1");
}

describe("App", () => {
  afterEach(() => {
    while (mountedWrappers.length) {
      mountedWrappers.pop()!.unmount();
    }
  });

  beforeEach(() => {
    resetPrototypeStateForTests();
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

  it("creates a real complaint record from the booking template", async () => {
    const { wrapper } = await mountAt("/owner/booking");

    await wrapper.findAll("[data-test='complaint-tree'] button").find((button) => button.text() === "Есть проблемы")!.trigger("click");
    await wrapper.findAll("[data-test='complaint-tree'] button").find((button) => button.text() === "С поведением")!.trigger("click");
    await wrapper.findAll("[data-test='complaint-tree'] button").find((button) => button.text() === "Снижение активности")!.trigger("click");
    await wrapper.get("[data-test='complaint-free-text']").setValue("стал тише");
    await wrapper.get("[data-test='complaint-details']").setValue("после прогулки меньше играет");
    await wrapper.get("button.primary-action.inline").trigger("click");
    await flushPromises();

    expect(complaintRecords.value[0]).toMatchObject({
      templateId: "what-happened-tree",
      pet: "Чарли",
      selectedOptionLabels: ["Есть проблемы", "С поведением", "Снижение активности"],
      freeText: "стал тише",
      details: "после прогулки меньше играет",
    });
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

  it("separates real drugs from mocked disease and template sections", async () => {
    const { wrapper } = await mountAt("/owner/materials");

    expect(wrapper.get("[data-test='materials-tab-drugs']").classes()).toContain("active");
    expect(wrapper.find("[data-test='materials-drugs-list']").exists()).toBe(true);
    expect(wrapper.findAll("[data-test='drug-group-head']").map((row) => row.text())).toEqual(["Обезболивающие"]);
    expect(wrapper.findAll("[data-test='drug-record-row']").map((row) => row.text())).toEqual(["Мелоксикам", "Парацетамол"]);
    expect(wrapper.text()).not.toContain("Карпрофен");
    expect(wrapper.text()).not.toContain("Справочник болезней");

    await wrapper.get("[data-test='materials-search']").setValue("Обезболивающие");
    expect(wrapper.findAll("[data-test='drug-record-row']").map((row) => row.text())).toEqual(["Мелоксикам", "Парацетамол"]);

    await wrapper.get("[data-test='materials-tab-diseases']").trigger("click");
    expect(wrapper.find("[data-test='materials-diseases-list']").exists()).toBe(true);
    expect(wrapper.text()).toContain("Справочник болезней");
    await wrapper.findAll("[data-test='mock-section-head']").find((row) => row.text().includes("Справочник болезней"))!.trigger("click");
    expect(wrapper.text()).toContain("Лептоспироз");
    expect(wrapper.find("[data-test='drug-record-row']").exists()).toBe(false);

    await wrapper.get("[data-test='materials-tab-templates']").trigger("click");
    expect(wrapper.find("[data-test='materials-templates-list']").exists()).toBe(true);
    expect(wrapper.text()).toContain("При температуре");
    expect(wrapper.text()).not.toContain("Лептоспироз");
    expect(wrapper.find("[data-test='drug-record-row']").exists()).toBe(false);
  });

  it("creates and displays a real drug record from the drug template", async () => {
    const { wrapper, router } = await mountAt("/owner/materials/drugs/new");

    expect(wrapper.text()).toContain("Новый препарат");
    expect(wrapper.text()).not.toContain("Запись по шаблону препарата");
    expect(wrapper.text()).not.toContain("Шаблон препарата");
    expect(wrapper.text()).not.toContain("Структура справочной записи по действующему веществу.");
    expect(wrapper.find("[data-test='drug-template']").exists()).toBe(false);
    expect((wrapper.get("[data-test='drug-group']").element as HTMLSelectElement).value).toBe("");
    expect(wrapper.get("[data-test='drug-dogDoseSource']").element.tagName).toBe("TEXTAREA");
    expect(wrapper.get("[data-test='drug-catDoseSource']").element.tagName).toBe("TEXTAREA");

    await wrapper.get("[data-test='drug-activeSubstanceRu']").setValue("Тестовое вещество");
    await wrapper.get("[data-test='drug-activeSubstanceLatin']").setValue("Substantia test");
    await wrapper.get("[data-test='drug-tradeNames']").setValue("Название 1, Название 2");
    await wrapper.get("[data-test='save-drug-record']").trigger("click");
    await flushPromises();

    expect(drugRecords.value[0]).toMatchObject({
      activeSubstanceRu: "Тестовое вещество",
      activeSubstanceLatin: "Substantia test",
      groupIds: [],
      tradeNames: ["Название 1", "Название 2"],
    });
    expect(router.currentRoute.value.path).toBe(`/owner/materials/drugs/${drugRecords.value[0].id}`);
    expect(wrapper.text()).toContain("Тестовое вещество");
    expect(wrapper.text()).toContain("Источник не указан");

    await router.push("/owner/materials");
    await flushPromises();
    expect(wrapper.get("[data-test='materials-tab-drugs']").classes()).toContain("active");
    expect(wrapper.findAll("[data-test='drug-record-row']").some((row) => row.text().includes("Тестовое вещество"))).toBe(true);
    expect(wrapper.findAll("[data-test='drug-group-head']").some((row) => row.text().includes("Без группы"))).toBe(true);
    expect(wrapper.text()).not.toContain("Карпрофен");

    await wrapper.get("[data-test='materials-search']").setValue("Название 2");
    expect(wrapper.text()).toContain("Тестовое вещество");
    expect(wrapper.text()).not.toContain("Мелоксикам");
  });

  it("validates drug dosage sources before saving", async () => {
    const { wrapper, router } = await mountAt("/owner/materials/drugs/new");
    const initialCount = drugRecords.value.length;

    await wrapper.get("[data-test='drug-activeSubstanceRu']").setValue("Тестовая дозировка");
    await wrapper.get("[data-test='drug-dogDoseText']").setValue("5 мг/кг");
    await wrapper.get("[data-test='save-drug-record']").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/owner/materials/drugs/new");
    expect(drugRecords.value).toHaveLength(initialCount);
    expect(wrapper.text()).toContain("Укажите источник дозировки для собак");
  });

  it("edits a drug record from the detail screen", async () => {
    const { wrapper, router } = await mountAt("/owner/materials/drugs/drug-meloxicam");

    await wrapper.get("[data-test='edit-drug-record']").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/owner/materials/drugs/drug-meloxicam/edit");
    expect((wrapper.get("[data-test='drug-activeSubstanceRu']").element as HTMLInputElement).value).toBe("Мелоксикам");
    expect((wrapper.get("[data-test='drug-group']").element as HTMLSelectElement).value).toBe("drug-group-analgesics");

    await wrapper.get("[data-test='drug-activeSubstanceRu']").setValue("Мелоксикам обновленный");
    await wrapper.get("[data-test='drug-group']").setValue("");
    await wrapper.get("[data-test='drug-tradeNames']").setValue("Локсиком");
    await wrapper.get("[data-test='save-drug-record']").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/owner/materials/drugs/drug-meloxicam");
    expect(drugRecords.value.find((record) => record.id === "drug-meloxicam")).toMatchObject({
      activeSubstanceRu: "Мелоксикам обновленный",
      groupIds: [],
      tradeNames: ["Локсиком"],
    });
    expect(wrapper.text()).toContain("Мелоксикам обновленный");
    expect(wrapper.text()).toContain("Без группы");
  });

  it("deletes a drug record after confirmation", async () => {
    const { wrapper, router } = await mountAt("/owner/materials/drugs/drug-meloxicam");

    await wrapper.get("[data-test='show-delete-drug-confirm']").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Удалить препарат из справочника?");

    await wrapper.get("[data-test='confirm-delete-drug']").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/owner/materials");
    expect(drugRecords.value.some((record) => record.id === "drug-meloxicam")).toBe(false);
    expect(wrapper.findAll("[data-test='drug-record-row']").some((row) => row.text().includes("Мелоксикам"))).toBe(false);
  });

  it("shows QA scenario menu only when requested", async () => {
    const hidden = await mountAt("/owner/home");
    expect(hidden.wrapper.text()).not.toContain("QA сценарии");

    const visible = await mountAt("/owner/home?qa=1");
    expect(visible.wrapper.text()).toContain("QA сценарии");
    expect(visible.wrapper.text()).toContain("owner-home");
  });

  it("renders the brand logo on entry, owner shell, and role landing surfaces", async () => {
    const entry = await mountAt("/auth/role");
    expect(entry.wrapper.find("[data-brand-logo]").exists()).toBe(true);
    expect(entry.wrapper.find(".auth-brand").attributes("aria-label")).toBe("Клинок");
    expect(entry.wrapper.findAll("[data-brand-logo] path")).toHaveLength(3);

    const owner = await mountAt("/owner/home");
    expect(owner.wrapper.find(".desktop-nav .brand-logo").exists()).toBe(true);
    expect(owner.wrapper.findAll(".desktop-nav .brand-logo path")).toHaveLength(3);

    const vet = await mountAt("/vet/home");
    expect(vet.wrapper.find(".role-header .brand-logo").exists()).toBe(true);
    expect(vet.wrapper.findAll(".role-header .brand-logo path")).toHaveLength(3);
  });

  it("shows the version label on every implemented screen", async () => {
    const expectedVersion = `Версия ${APP_VERSION}`;
    const missingScreens: string[] = [];

   for (const scenario of scenarioRegistry.filter((item) => item.implemented)) {
     const { wrapper } = await mountAt(resolveScenarioPath(scenario.path));
     if (!wrapper.text().includes(expectedVersion)) {
       missingScreens.push(`${scenario.id} (${scenario.path})`);
     }
     wrapper.unmount();
     mountedWrappers.pop();
   }

    expect(missingScreens).toEqual([]);
  });

  it("keeps brand tokens aligned with the logo book", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const fullLogo = readFileSync(resolve(process.cwd(), "src/assets/brand/klinok-logo-full-ru.svg"), "utf8");
    const monoLogo = readFileSync(resolve(process.cwd(), "src/assets/brand/klinok-logo-mono-ru.svg"), "utf8");

    const stylesLower = styles.toLowerCase();
    for (const color of ["#4087D1", "#FF7F1A", "#000000", "#FFFFFF", "#EAF4FF", "#FFEAD9", "#EFEFEF"]) {
      expect(stylesLower).toContain(color.toLowerCase());
    }

    expect(styles.toLowerCase()).not.toContain("#3778ff");
    expect(fullLogo).toContain('viewBox="0 0 773 198"');
    expect(fullLogo).toContain('fill="#4087D1"');
    expect(fullLogo).toContain('fill="#FF7F1A"');
    expect(monoLogo).toContain('fill="#000000"');
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
