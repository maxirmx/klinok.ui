// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { describe, expect, it } from "vitest";
import ConfirmationDialog from "../src/components/ConfirmationDialog.vue";

describe("ConfirmationDialog", () => {
  it("opens as a modal, focuses cancel, and restores focus after Escape", async () => {
    const wrapper = mount(defineComponent({
      components: { ConfirmationDialog },
      setup() {
        return { open: ref(false) };
      },
      template: `
        <button class="opener" @click="open = true">Открыть</button>
        <ConfirmationDialog
          v-model="open"
          title="Подтвердите действие"
          description="Действие нельзя отменить."
          confirm-label="Продолжить"
        />
      `,
    }), { attachTo: document.body });

    const opener = wrapper.get<HTMLButtonElement>(".opener");
    opener.element.focus();
    await opener.trigger("click");
    await flushPromises();

    const dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.attributes("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog.findAll("button")[0]!.element);

    await dialog.trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(opener.element);
    wrapper.unmount();
  });
});
