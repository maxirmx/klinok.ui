// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it } from "vitest";
import AppAlert from "../src/components/AppAlert.vue";
import { installAlertNavigationGuard } from "../src/router";
import { useAlertStore } from "../src/stores/alert";

beforeEach(() => setActivePinia(createPinia()));

describe("alert store", () => {
  it("shows, replaces, normalizes, and clears alerts", () => {
    const store = useAlertStore();

    store.success("Сохранено.");
    expect(store.alert).toEqual({ kind: "success", text: "Сохранено." });

    store.error(new Error("Не удалось сохранить."));
    expect(store.alert).toEqual({ kind: "error", text: "Не удалось сохранить." });

    store.error({ unexpected: true }, "Повторите попытку.");
    expect(store.alert).toEqual({ kind: "error", text: "Повторите попытку." });

    store.clear();
    expect(store.alert).toBeNull();
  });

  it("clears only when the route path changes", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/first", component: { template: "<div />" } },
        { path: "/second", component: { template: "<div />" } },
      ],
    });
    installAlertNavigationGuard(router, pinia);
    await router.push("/first");

    const store = useAlertStore();
    store.success("Готово.");
    await router.push({ path: "/first", query: { page: "2" } });
    expect(store.alert?.text).toBe("Готово.");
    await router.push({ path: "/first", hash: "#details" });
    expect(store.alert?.text).toBe("Готово.");

    await router.push("/second");
    expect(store.alert).toBeNull();
  });
});

describe("AppAlert", () => {
  it("renders accessible error feedback and dismisses it", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAlertStore();
    store.error(new Error("Ошибка операции"));
    const wrapper = mount(AppAlert, { global: { plugins: [pinia] } });

    expect(wrapper.get('[role="alert"]').classes()).toContain("error");
    expect(wrapper.text()).toContain("Ошибка операции");
    const close = wrapper.get('button[title="Закрыть сообщение"]');
    expect(close.attributes("aria-label")).toBe("Закрыть сообщение");
    await close.trigger("click");
    expect(store.alert).toBeNull();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("uses status semantics for success feedback", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAlertStore().success("Операция выполнена.");
    const wrapper = mount(AppAlert, { global: { plugins: [pinia] } });

    expect(wrapper.get('[role="status"]').classes()).toContain("success");
  });
});
