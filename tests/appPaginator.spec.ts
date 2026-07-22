import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppPaginator from "../src/components/AppPaginator.vue";

describe("AppPaginator", () => {
  it("renders the admin audit pagination pattern and emits page changes", async () => {
    const wrapper = mount(AppPaginator, {
      props: { page: 2, pageSize: 20, totalItems: 45 },
    });

    expect(wrapper.text()).toContain("Показаны 21–40 из 45");
    expect(wrapper.findAll('.app-paginator-buttons button[aria-label^="Страница "]')).toHaveLength(3);
    expect(wrapper.get('button[aria-current="page"]').text()).toBe("2");

    await wrapper.get('button[title="Предыдущая страница"]').trigger("click");
    await wrapper.get('button[title="Следующая страница"]').trigger("click");
    await wrapper.get('button[aria-label="Страница 1"]').trigger("click");
    expect(wrapper.emitted("update:page")).toEqual([[1], [3], [1]]);
  });

  it("uses custom labels and emits a numeric page size", async () => {
    const wrapper = mount(AppPaginator, {
      props: {
        page: 1,
        pageSize: 10,
        totalItems: 11,
        pageSizes: [10, 50],
        pageSizeLabel: "Записей на странице",
        ariaLabel: "Навигация по медицинским записям",
      },
    });

    expect(wrapper.attributes("aria-label")).toBe("Навигация по медицинским записям");
    expect(wrapper.text()).toContain("Записей на странице");
    await wrapper.get("select").setValue("50");
    expect(wrapper.emitted("update:pageSize")).toEqual([[50]]);
  });
});
