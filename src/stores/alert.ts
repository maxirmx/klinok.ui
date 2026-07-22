// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { ref } from "vue";
import { defineStore } from "pinia";

export type AlertKind = "success" | "error";
export type AppAlert = { kind: AlertKind; text: string };

export function alertErrorText(reason: unknown, fallback = "Не удалось выполнить операцию."): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

export const useAlertStore = defineStore("alert", () => {
  const alert = ref<AppAlert | null>(null);

  function success(text: string): void {
    alert.value = { kind: "success", text };
  }

  function error(reason: unknown, fallback?: string): void {
    alert.value = { kind: "error", text: alertErrorText(reason, fallback) };
  }

  function clear(): void {
    alert.value = null;
  }

  return { alert, success, error, clear };
});
