// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppIcon from "../src/components/AppIcon.vue";
import MedicalRecordEntry from "../src/components/MedicalRecordEntry.vue";
import type { MedicalRecordDraft } from "../src/repositories/types";

const record: MedicalRecordDraft = {
  recordId: "record-1",
  petId: "pet-1",
  revision: 2,
  authorAccountId: "doctor-1",
  authorDisplayName: "Вера Врач",
  encounterDate: "2026-07-21",
  title: "Осмотр",
  text: "Не ест со вчерашнего дня",
  sections: {
    "what-happened": {
      kind: "what-happened",
      templateVersion: "what-happened-v1",
      value: { selectedIds: ["problem.digestive.1"], comment: "Не ест со вчерашнего дня" },
      authorAccountId: "doctor-1",
      authorDisplayName: "Вера Врач",
      updatedAt: "2026-07-21T10:00:00.000Z",
    },
    diagnosis: {
      kind: "diagnosis",
      templateVersion: "free-text-v0",
      value: { text: "Предварительный диагноз" },
      authorAccountId: "doctor-2",
      authorDisplayName: "Анна Врач",
      updatedAt: "2026-07-21T11:00:00.000Z",
    },
    outcome: {
      kind: "outcome",
      templateVersion: "free-text-v0",
      value: { text: "Назначено лечение" },
      authorAccountId: "doctor-1",
      authorDisplayName: "Вера Врач",
      updatedAt: "2026-07-21T12:00:00.000Z",
    },
  },
  createdAt: "2026-07-21T10:00:00.000Z",
  updatedAt: "2026-07-21T12:00:00.000Z",
};

describe("MedicalRecordEntry", () => {
  it.each([
    ["well.1", "Всё хорошо", "well"],
    ["problem.digestive.1", "Не всё хорошо", "problem"],
    ["critical.1", "Всё плохо", "critical"],
  ])("shows the general condition for %s in the record header", (selectedId, label, tone) => {
    const whatHappened = record.sections["what-happened"]!;
    const wrapper = mount(MedicalRecordEntry, {
      props: {
        record: {
          ...record,
          sections: {
            ...record.sections,
            "what-happened": {
              ...whatHappened,
              value: { selectedIds: [selectedId], comment: "Подробный комментарий" },
            },
          },
        },
        mode: "details",
        confirmed: false,
      },
    });

    const summary = wrapper.get(".owner-encounter-summary");
    expect(summary.text()).toContain(label);
    expect(summary.text()).not.toContain("Подробный комментарий");
    expect(summary.get(`.medical-record-condition-${tone}`).text()).toBe(label);
  });

  it("renders and activates the compact epicrisis mode", async () => {
    const wrapper = mount(MedicalRecordEntry, {
      props: { record, mode: "epicrisis", confirmed: false },
    });

    expect(wrapper.element.tagName).toBe("BUTTON");
    expect(wrapper.text()).toContain("21.07.2026");
    expect(wrapper.text()).toContain("Не ест");
    expect(wrapper.text()).toContain("Назначено лечение");
    expect(wrapper.text()).toContain("Ожидает подтверждения");
    await wrapper.trigger("click");
    expect(wrapper.emitted("activate")?.[0]).toEqual([record]);

    const withoutOutcome = mount(MedicalRecordEntry, {
      props: {
        record: { ...record, sections: { "what-happened": record.sections["what-happened"] } },
        mode: "epicrisis",
        confirmed: false,
      },
    });
    expect(withoutOutcome.text()).toContain("Не заполнено");
  });

  it("renders populated sections in canonical order and hides editing for confirmed records", async () => {
    const wrapper = mount(MedicalRecordEntry, {
      props: {
        record,
        mode: "details",
        confirmed: true,
        action: "edit",
        open: true,
        showAuthorAccountId: true,
      },
    });

    expect(wrapper.element.tagName).toBe("DETAILS");
    expect(wrapper.attributes()).toHaveProperty("open");
    expect(wrapper.find(".medical-record-chevron-collapsed").exists()).toBe(true);
    expect(wrapper.find(".medical-record-chevron-expanded").exists()).toBe(true);
    expect(wrapper.findAll(".encounter-history-section h3").map((node) => node.text()))
      .toEqual(["Что случилось", "Диагноз", "Исход"]);
    expect(wrapper.get(".owner-encounter-sections").findAll(":scope > .encounter-history-section")).toHaveLength(3);
    expect(wrapper.get(".owner-encounter-sections").classes()).not.toContain("owner-encounter-sections-editing");
    const summary = wrapper.get(".owner-encounter-summary");
    expect(summary.text()).toContain("21.07.2026 · Не всё хорошо");
    expect(summary.text()).not.toContain("Пищеварением");
    expect(summary.get(".medical-record-condition-problem").text()).toBe("Не всё хорошо");
    expect(wrapper.get(".encounter-history-comment").text()).toBe("Не ест со вчерашнего дня");
    expect(wrapper.text()).not.toContain("Рекомендации");
    expect(wrapper.text()).toContain("Анна Врач · doctor-2");
    expect(wrapper.text()).not.toContain("2026-07-21T11:00:00.000Z");
    expect(wrapper.text()).toContain("Подтверждена");
    expect(wrapper.find(".medical-record-edit").exists()).toBe(false);

    await wrapper.setProps({ confirmed: false });
    const edit = wrapper.get(".medical-record-edit");
    expect(wrapper.get(".owner-encounter-summary").find(".medical-record-actions").exists()).toBe(false);
    expect(wrapper.findAll(".encounter-history-section")[0]!.get(".encounter-history-heading").find(".medical-record-actions").exists()).toBe(true);
    expect(edit.text()).toBe("");
    expect(edit.attributes("title")).toBe("Редактировать запись");
    expect(edit.attributes("aria-label")).toBe("Редактировать запись");
    expect(edit.getComponent(AppIcon).props("name")).toBe("edit");
    await edit.trigger("click");
    expect(wrapper.emitted("edit")?.[0]).toEqual([record]);
    const remove = wrapper.get(".medical-record-delete");
    expect(remove.attributes("title")).toBe("Удалить запись");
    expect(remove.attributes("aria-label")).toBe("Удалить запись");
    expect(remove.getComponent(AppIcon).props("name")).toBe("trash");
    await remove.trigger("click");
    expect(wrapper.emitted("delete")?.[0]).toEqual([record]);
  });

  it("offers confirmation only for a pending detailed record", async () => {
    const wrapper = mount(MedicalRecordEntry, {
      props: { record, mode: "details", confirmed: false, action: "confirm" },
    });
    const confirm = wrapper.get(".owner-encounter-confirm");
    expect(confirm.text()).toBe("");
    expect(confirm.attributes("title")).toBe("Подтвердить запись");
    expect(confirm.attributes("aria-label")).toBe("Подтвердить запись");
    expect(confirm.getComponent(AppIcon).props("name")).toBe("check");
    expect(confirm.element.closest(".encounter-history-heading")).not.toBeNull();
    expect(confirm.element.closest(".medical-record-actions")).not.toBeNull();
    await confirm.trigger("click");
    expect(wrapper.emitted("confirm")?.[0]).toEqual([record]);

    await wrapper.setProps({ confirmed: true });
    expect(wrapper.find(".owner-encounter-confirm").exists()).toBe(false);
  });
});
