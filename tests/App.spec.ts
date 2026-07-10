import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";
import AuthScreen from "../src/screens/AuthScreen.vue";
import RoleStatusScreen from "../src/screens/RoleStatusScreen.vue";
import WorkspaceScreen from "../src/screens/WorkspaceScreen.vue";

async function mountScreen(component: object, path: string, props: Record<string, unknown>) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path, component, props }] });
  await router.push(path);
  await router.isReady();
  return mount(component, { props, global: { plugins: [router] } });
}

describe("operational Russian UI", () => {
  it("renders email/password login without phone or code controls", async () => {
    const wrapper = await mountScreen(AuthScreen, "/auth/login", { scenarioId: "auth-login" });
    expect(wrapper.text()).toContain("Вход в Клинок");
    expect(wrapper.text()).toContain("Электронная почта");
    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("номер телефона");
    expect(wrapper.text()).not.toContain("код из СМС");
  });

  it("uses the exact final role labels during registration", async () => {
    const wrapper = await mountScreen(AuthScreen, "/auth/register", { scenarioId: "auth-register" });
    expect(wrapper.text()).toContain("Администратор");
    expect(wrapper.text()).toContain("Врач");
    expect(wrapper.text()).toContain("Владелец животного");
    expect(wrapper.find("fieldset legend").text()).toBe("Запрашиваемые роли");
  });

  it("renders accessible status and Administrator queue surfaces", async () => {
    const statuses = await mountScreen(RoleStatusScreen, "/roles", { scenarioId: "role-status" });
    expect(statuses.text()).toContain("Роли и доступ");
    expect(statuses.findAll("h2").map((node) => node.text())).toEqual(expect.arrayContaining(["Администратор", "Врач", "Владелец животного"]));
    const administrator = await mountScreen(WorkspaceScreen, "/admin/home", { scenarioId: "administrator-home", role: "administrator" });
    expect(administrator.text()).toContain("Заявки на роли");
    expect(administrator.text()).toContain("Конфликты авторизации");
    expect(administrator.text()).toContain("Справочники и шаблоны");
  });
});
