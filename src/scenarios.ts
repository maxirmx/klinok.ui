export type ScenarioRole = "auth" | "owner" | "doctor" | "administrator" | "shared";
export type ScenarioComponentName = "AuthScreen" | "RoleStatusScreen" | "WorkspaceScreen";

export interface ScenarioRegistryEntry {
  id: string;
  title: string;
  role: ScenarioRole;
  path: string;
  figmaNodeId: string;
  exportName?: string;
  component: ScenarioComponentName;
  implemented: boolean;
}

export interface FigmaCoverageEntry {
  id: string;
  source: string;
  status: "implemented" | "duplicate" | "reference-only";
  scenarioId?: string;
  notes: string;
}

export const scenarioRegistry: ScenarioRegistryEntry[] = [
  { id: "auth-login", title: "Вход", role: "auth", path: "/auth/login", figmaNodeId: "issue:25", component: "AuthScreen", implemented: true },
  { id: "auth-register", title: "Регистрация", role: "auth", path: "/auth/register", figmaNodeId: "issue:25", component: "AuthScreen", implemented: true },
  { id: "auth-consent", title: "Согласия", role: "auth", path: "/auth/register/consent", figmaNodeId: "issue:25", component: "AuthScreen", implemented: true },
  { id: "auth-verify", title: "Подтверждение почты", role: "auth", path: "/auth/verify-email", figmaNodeId: "issue:25", component: "AuthScreen", implemented: true },
  { id: "auth-forgot", title: "Восстановление пароля", role: "auth", path: "/auth/forgot-password", figmaNodeId: "issue:25", component: "AuthScreen", implemented: true },
  { id: "auth-reset", title: "Новый пароль", role: "auth", path: "/auth/reset-password", figmaNodeId: "issue:25", component: "AuthScreen", implemented: true },
  { id: "role-status", title: "Роли и статусы", role: "shared", path: "/roles", figmaNodeId: "issue:25", component: "RoleStatusScreen", implemented: true },
  { id: "owner-home", title: "Кабинет владельца", role: "owner", path: "/owner/home", figmaNodeId: "issue:25", component: "WorkspaceScreen", implemented: true },
  { id: "doctor-home", title: "Кабинет врача", role: "doctor", path: "/doctor/home", figmaNodeId: "issue:25", component: "WorkspaceScreen", implemented: true },
  { id: "administrator-home", title: "Кабинет администратора", role: "administrator", path: "/admin/home", figmaNodeId: "issue:25", component: "WorkspaceScreen", implemented: true },
];

export const figmaCoverage: FigmaCoverageEntry[] = scenarioRegistry.map((scenario) => ({
  id: `issue-25-${scenario.id}`,
  source: "GitHub issue #25 design comment",
  status: "implemented",
  scenarioId: scenario.id,
  notes: "Operational registration and role-system cutover.",
}));
