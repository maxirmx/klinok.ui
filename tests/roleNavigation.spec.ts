// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import { roleHomePath } from "../src/roleNavigation";

describe("role navigation", () => {
  it.each([
    ["administrator", "/admin/home"],
    ["doctor", "/doctor/home"],
    ["owner", "/owner/home"],
  ] as const)("opens the %s workspace directly", (role, expected) => {
    expect(roleHomePath(role)).toBe(expected);
  });

  it("uses role status only when no approved role is active", () => {
    expect(roleHomePath(null)).toBe("/profile");
  });
});
