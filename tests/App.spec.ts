import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";
import PasswordInput from "../src/components/PasswordInput.vue";
import AuthScreen from "../src/screens/AuthScreen.vue";
import RoleStatusScreen from "../src/screens/RoleStatusScreen.vue";
import WorkspaceScreen from "../src/screens/WorkspaceScreen.vue";
import { routes } from "../src/router";

async function mountScreen(component: object, path: string, props: Record<string, unknown>) {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(path);
  await router.isReady();
  return mount(component, { props, global: { plugins: [router] } });
}

describe("operational Russian UI", () => {
  it("renders email/password login without phone or code controls", async () => {
    const wrapper = await mountScreen(AuthScreen, "/auth/login", { scenarioId: "auth-login" });
    expect(wrapper.text()).toContain("Вход в Клинок");
    expect(wrapper.text()).toContain("Электронная почта");
    expect(wrapper.text()).not.toContain("Введите электронную почту и пароль");
    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("номер телефона");
    expect(wrapper.text()).not.toContain("код из СМС");
  });

  it("uses one initial role and confirms the password during registration", async () => {
    const wrapper = await mountScreen(AuthScreen, "/auth/register", { scenarioId: "auth-register" });
    expect(wrapper.text()).not.toContain("Заполните профиль и выберите хотя бы одну роль");
    expect(wrapper.text()).not.toContain("Администратор");
    expect(wrapper.text()).not.toContain("Мои питомцы и их медицинская история");
    expect(wrapper.text()).not.toContain("Работа с предоставленными медкартами");
    expect(wrapper.text()).toContain("Я - ветеринар");
    expect(wrapper.text()).toContain("Я - владелец животного");
    expect(wrapper.findAll(".initial-role-graphic")).toHaveLength(2);
    expect(wrapper.text()).not.toContain("Начальная роль");
    expect(wrapper.get("fieldset").attributes("aria-label")).toBe("Выберите роль");
    const roles = wrapper.findAll<HTMLInputElement>('input[type="radio"]');
    expect(roles).toHaveLength(2);
    expect(roles.filter((role) => role.element.checked)).toHaveLength(1);
    expect(wrapper.findAll("form > label").slice(0, 3).map((label) => label.text())).toEqual([
      "Имя", "Отчество, если есть", "Фамилия",
    ]);
    const passwordFields = wrapper.findAll<HTMLInputElement>(".password-field input");
    expect(passwordFields).toHaveLength(2);
    await passwordFields[0]!.setValue("correct horse battery");
    await passwordFields[1]!.setValue("different password");
    expect(wrapper.text()).toContain("Пароли не совпадают.");
    expect(wrapper.get<HTMLButtonElement>('button[type="submit"], button.primary-action').element.disabled).toBe(true);
  });

  it("shows and hides password values with an accessible button", async () => {
    const wrapper = mount(PasswordInput, { props: { label: "Пароль", modelValue: "секрет" } });
    expect(wrapper.get("input").attributes("type")).toBe("password");
    await wrapper.get('button[aria-label="Показать пароль"]').trigger("click");
    expect(wrapper.get("input").attributes("type")).toBe("text");
    expect(wrapper.get("button").attributes("aria-label")).toBe("Скрыть пароль");
  });

  it("renders accessible status and Administrator queue surfaces", async () => {
    const statuses = await mountScreen(RoleStatusScreen, "/roles", { scenarioId: "role-status" });
    expect(statuses.text()).toContain("Роли и доступ");
    expect(statuses.findAll("h2").map((node) => node.text())).toEqual(expect.arrayContaining(["Администратор", "Врач", "Владелец животного"]));
    expect(statuses.findAll(".profile-form > label").map((label) => label.text())).toEqual([
      "Имя", "Отчество, если есть", "Фамилия",
    ]);
    const administrator = await mountScreen(WorkspaceScreen, "/admin/home", { scenarioId: "administrator-home", role: "administrator" });
    expect(administrator.text()).toContain("Заявки на роли");
    expect(administrator.text()).toContain("Конфликты авторизации");
  });

  it.each([
    ["administrator", "/admin/home", ["Главная", "Заявки", "Аккаунты", "Конфликты", "Журнал"]],
    ["doctor", "/doctor/home", ["Главная", "Питомцы", "Новая запись", "Делегирование", "Медкарта"]],
    ["owner", "/owner/home", ["Главная", "Добавить", "Питомцы", "Дать доступ", "Доступы", "Медкарта"]],
  ] as const)("renders responsive %s navigation for the current feature set", async (role, path, labels) => {
    const workspace = await mountScreen(WorkspaceScreen, path, { scenarioId: `${role}-home`, role });
    const sidebarLabels = workspace.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text());
    const bottomLabels = workspace.findAll(".workspace-bottom-nav a span").map((node) => node.text());

    expect(sidebarLabels).toEqual(labels);
    expect(bottomLabels).toEqual(labels);
    expect(workspace.find(".workspace-sidebar").attributes("aria-label")).toBe("Основная навигация");
    expect(workspace.find(".workspace-bottom-nav").attributes("aria-label")).toBe("Нижняя навигация");
  });
});
