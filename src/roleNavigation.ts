// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { Role } from "@klinok/protocol";

export function roleHomePath(role: Role | null | undefined): string {
  if (role === "administrator") return "/admin/home";
  if (role === "doctor") return "/doctor/home";
  if (role === "owner") return "/owner/home";
  return "/profile";
}
