import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it } from "vitest";
import AppIcon from "../src/components/AppIcon.vue";
import PasswordInput from "../src/components/PasswordInput.vue";
import RoleSelectionCards from "../src/components/RoleSelectionCards.vue";
import AuthScreen from "../src/screens/AuthScreen.vue";
import RoleStatusScreen from "../src/screens/RoleStatusScreen.vue";
import WorkspaceScreen from "../src/screens/WorkspaceScreen.vue";
import OwnerScreen from "../src/screens/OwnerScreen.vue";
import AdministratorScreen from "../src/screens/AdministratorScreen.vue";
import { getOrCreateDeviceId, setDeviceName } from "../src/repositories/deviceVault";
import { routes } from "../src/router";

beforeEach(() => localStorage.clear());

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
    expect(wrapper.find('input[autocomplete="off"]').exists()).toBe(true);
    expect(wrapper.find(".auth-device-name").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("номер телефона");
    expect(wrapper.text()).not.toContain("код из СМС");
  });

  it("shows the saved device name as non-editable text for an existing device", async () => {
    getOrCreateDeviceId();
    setDeviceName("Домашний ноутбук");
    const wrapper = await mountScreen(AuthScreen, "/auth/login", { scenarioId: "auth-login" });
    expect(wrapper.find('input[autocomplete="off"]').exists()).toBe(false);
    expect(wrapper.get(".auth-device-name").text()).toContain("Домашний ноутбук");
    expect(wrapper.get(".auth-device-name").attributes("aria-label")).toBe("Название этого устройства");
  });

  it("uses one initial role and confirms the password during registration", async () => {
    const wrapper = await mountScreen(AuthScreen, "/auth/register", { scenarioId: "auth-register" });
    expect(wrapper.text()).not.toContain("Заполните профиль и выберите хотя бы одну роль");
    expect(wrapper.text()).toContain("Я - ветеринар");
    expect(wrapper.text()).toContain("Я - владелец животного");
    expect(wrapper.findAll(".role-selection-graphic")).toHaveLength(2);
    expect(wrapper.findAll(".role-selection-card")).toHaveLength(2);
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
    expect(passwordFields.every((field) => field.attributes("minlength") === "6")).toBe(true);
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

  it("shares role cards and highlights active and request statuses", () => {
    const wrapper = mount(RoleSelectionCards, {
      props: {
        modelValue: "owner",
        includeAdministrator: true,
        selectable: false,
        statusByRole: { owner: "approved", doctor: "pending", administrator: "rejected" },
      },
    });
    const cards = wrapper.findAll(".role-selection-card");
    expect(cards).toHaveLength(3);
    expect(cards[0]!.classes()).toEqual(expect.arrayContaining(["owner", "approved", "selected"]));
    expect(cards[1]!.classes()).toEqual(expect.arrayContaining(["doctor", "pending"]));
    expect(cards[2]!.classes()).toEqual(expect.arrayContaining(["administrator", "rejected"]));
  });

  it("keeps separate role-card instances in independent radio groups", () => {
    const wrapper = mount(defineComponent({
      components: { RoleSelectionCards },
      template: "<div><RoleSelectionCards /><RoleSelectionCards /></div>",
    }));
    const groups = wrapper.findAll(".role-selection-grid").map((group) =>
      group.get<HTMLInputElement>('input[type="radio"]').attributes("name"),
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toBeTruthy();
    expect(groups[1]).toBeTruthy();
    expect(groups[0]).not.toBe(groups[1]);
  });

  it("renders accessible profile settings and Administrator queue surfaces", async () => {
    const statuses = await mountScreen(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    expect(statuses.text()).toContain("Настройки пользователя");
    expect(statuses.text()).toContain("Электронная почта и пароль");
    expect(statuses.text()).not.toContain("Повторите электронную почту");
    expect(statuses.text()).toContain("Синхронизация данных");
    expect(statuses.text()).toContain("Аккаунт и устройства");
    expect(statuses.findAll(".role-selection-title").map((node) => node.text())).toEqual(["Владелец животного", "Ветеринар", "Администратор"]);
    expect(statuses.findAll(".role-selection-card")).toHaveLength(3);
    expect(statuses.findAll('.profile-roles input[type="radio"]')).toHaveLength(3);
    expect(statuses.get(".profile-form").find('button[type="submit"]').exists()).toBe(false);
    expect(statuses.get(".credentials-form").find('button[type="submit"]').exists()).toBe(false);
    const profileSave = statuses.get('.profile-section-heading button[form="profile-form"]');
    const credentialsSave = statuses.get('.profile-section-heading button[form="credentials-form"]');
    expect(profileSave.text()).toBe("");
    expect(credentialsSave.text()).toBe("");
    expect(profileSave.attributes("title")).toBe("Сохранить личные данные");
    expect(credentialsSave.attributes("title")).toBe("Сохранить электронную почту и пароль");
    expect(profileSave.getComponent(AppIcon).props("name")).toBe("check");
    expect(credentialsSave.getComponent(AppIcon).props("name")).toBe("check");
    expect(statuses.get('button[title="Восстановить личные данные"]').getComponent(AppIcon).props("name")).toBe("restore");
    expect(statuses.get('button[title="Восстановить электронную почту и пароль"]').getComponent(AppIcon).props("name")).toBe("restore");
    expect(statuses.findAll(".profile-form > label").map((label) => label.text())).toEqual([
      "Имя", "Отчество, если есть", "Фамилия",
    ]);
    expect(statuses.get<HTMLInputElement>('input[autocomplete="given-name"]').attributes("readonly")).toBeUndefined();
    expect(statuses.findAll<HTMLInputElement>('.credentials-form input[type="password"]')).toHaveLength(2);
    expect(statuses.findAll<HTMLInputElement>('.credentials-form input[type="password"]').every((input) => input.attributes("minlength") === "6")).toBe(true);
    expect(statuses.findAll<HTMLInputElement>('.credentials-form input[type="password"]').every((input) => input.element.value === "")).toBe(true);
    const administrator = await mountScreen(AdministratorScreen, "/admin/home", { scenarioId: "administrator-home", role: "administrator" });
    expect(administrator.text()).toContain("Ветеринары и администраторы");
    expect(administrator.get(".administrator-audit-link").attributes("title")).toBe("Открыть журнал действий");
    expect(administrator.text()).not.toContain("Конфликты авторизации");
  });

  it.each([
    ["administrator", AdministratorScreen, "/admin/home", ["Пользователи", "Журнал"]],
    ["doctor", WorkspaceScreen, "/doctor/home", ["Главная страница", "Запросить доступ", "Питомцы", "Новая запись", "Делегирование", "Медкарта"]],
  ] as const)("renders responsive %s navigation for the current feature set", async (role, component, path, labels) => {
    const workspace = await mountScreen(component, path, { scenarioId: `${role}-home`, role });
    const sidebarLabels = workspace.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text());
    const sidebarMenuLabels = [
      ...sidebarLabels,
      ...workspace.findAll(".workspace-sidebar-footer .workspace-nav-item span").map((node) => node.text()),
    ];
    const bottomLabels = workspace.findAll(".workspace-bottom-nav :is(a, button) span").map((node) => node.text());

    expect(sidebarLabels).toEqual(labels);
    expect(bottomLabels).toEqual(sidebarMenuLabels);
    expect(workspace.find(".workspace-sidebar").attributes("aria-label")).toBe("Основная навигация");
    expect(workspace.find(".workspace-bottom-nav").attributes("aria-label")).toBe("Нижняя навигация");
    expect(workspace.text()).toContain("Настройки пользователя");

    const target = workspace.findAll(".workspace-sidebar-nav .workspace-nav-item")[1]!;
    await target.trigger("click");
    await flushPromises();
    if (role === "administrator") expect(workspace.vm.$route.path).toBe("/admin/audit");
    else expect(workspace.vm.$route.hash).toBe(target.attributes("href"));
    expect(target.classes()).toContain("active");
  });

  it("renders the Owner route hierarchy and compact mobile actions", async () => {
    const owner = await mountScreen(OwnerScreen, "/owner/home", { scenarioId: "owner-home", role: "owner" });
    const sidebarLabels = owner.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text());
    expect(sidebarLabels).toEqual([
      "Питомцы", "Добавить питомца",
    ]);
    expect(owner.findAll(".workspace-bottom-nav :is(a, button) span").map((node) => node.text())).toEqual([
      "Питомцы", "Настройки пользователя", "Выйти",
    ]);
    expect(owner.text()).toContain("Мои питомцы");
  });
});
