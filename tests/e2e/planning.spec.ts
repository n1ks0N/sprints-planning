import { expect, test, type Page } from "@playwright/test";
import {
  buildPlanningScenario,
  installPlanningApiMocks,
  readPlanningMockState,
  urls,
} from "./planning.mock";

const setupPlanningScenario = async (page: Page, scenario = {}) => {
  await installPlanningApiMocks(page, scenario);
};

const setPlanningSort = async (
  page: Page,
  fieldName: string,
  direction: "asc" | "desc"
) => {
  await page.getByLabel("Сортировка").click();
  await page.getByRole("option", { name: fieldName }).click();
  const directionButton = page.getByRole("button", {
    name: direction === "asc" ? "По убыванию" : "По возрастанию",
  });
  if (await directionButton.isVisible()) {
    await directionButton.click();
  }
};

const editAllocation = async (page: Page, testId: string, value: string) => {
  await page.getByTestId(testId).click();
  await page.getByTestId(testId).fill(value);
  await page.getByTestId(testId).blur();
  await expect(page.getByTestId(testId)).toHaveText(value);
};

const openPreview = async (page: Page, scenario = {}) => {
  const resolved = buildPlanningScenario(scenario);
  await setupPlanningScenario(page, scenario);
  await page.goto(urls.planning);
  await page.getByTestId("planning-move-all-to-plan").click();
  await expect(page.getByTestId("planning-selected-count")).toHaveText(String(resolved.planningItems.length));
  await page.getByTestId("planning-run-preview").click();
  await expect(page).toHaveURL(
    new RegExp(`${urls.planningPreview.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
  );
  return resolved;
};

test.describe("Planning Workbench", () => {
  test("filters planning backlog by quarter and sorts visible items by documented rules", async ({ page }) => {
    const scenario = {
      quarterId: "quarter-q2",
      quarters: [
        {
          id: "quarter-q2",
          year: 2026,
          number: 2,
          name: "Q2 2026",
          startDate: "2026-04-01",
          endDate: "2026-06-30",
        },
        {
          id: "quarter-q3",
          year: 2026,
          number: 3,
          name: "Q3 2026",
          startDate: "2026-07-01",
          endDate: "2026-09-30",
        },
      ],
      sprints: [
        {
          id: "sprint-q2-1",
          quarterId: "quarter-q2",
          name: "Sprint Q2",
          startDate: "2026-04-01",
          endDate: "2026-04-14",
          workingDays: 10,
          order: 1,
        },
        {
          id: "sprint-q3-1",
          quarterId: "quarter-q3",
          name: "Sprint Q3",
          startDate: "2026-07-01",
          endDate: "2026-07-14",
          workingDays: 10,
          order: 2,
        },
      ],
      releases: [
        { id: "release-early", name: "Early", promDate: "2026-05-10" },
        { id: "release-late", name: "Late", promDate: "2026-08-10" },
      ],
      planningItems: [
        {
          id: "item-light",
          title: "Light Q2",
          priority: 2,
          customers: ["Acme"],
          streams: ["Core"],
          planningDemands: [{ kind: "ROLE", role: "Backend", stream: "Core", days: 2 }],
          planningQuarterIds: ["quarter-q2"],
          planningSprintIds: [],
          releaseDateId: "release-late",
          initialQuarterId: "quarter-q2",
          order: 1,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        },
        {
          id: "item-heavy",
          title: "Heavy Q2",
          priority: 1,
          customers: ["Acme"],
          streams: ["Core"],
          planningDemands: [{ kind: "ROLE", role: "Backend", stream: "Core", days: 7 }],
          planningQuarterIds: ["quarter-q2"],
          planningSprintIds: [],
          releaseDateId: "release-early",
          initialQuarterId: "quarter-q2",
          order: 2,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        },
        {
          id: "item-q3",
          title: "Future Q3",
          priority: 3,
          customers: ["Beta"],
          streams: ["Core"],
          planningDemands: [{ kind: "ROLE", role: "Backend", stream: "Core", days: 4 }],
          planningQuarterIds: ["quarter-q3"],
          planningSprintIds: [],
          releaseDateId: "release-late",
          initialQuarterId: "quarter-q3",
          order: 3,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        },
      ],
    };

    await setupPlanningScenario(page, scenario);
    await page.goto(urls.planning);

    const availableCards = page.locator('[data-testid^="planning-item-"]');
    await expect(availableCards).toHaveCount(3);

    await page.getByLabel("Фильтр по кварталу").click();
    await page.getByRole("option", { name: "Q3 2026" }).click();

    await expect(page.getByTestId("planning-backlog-count")).toHaveText("1");
    await expect(availableCards).toHaveCount(1);
    await expect(availableCards.first()).toContainText("Future Q3");

    await page.reload();
    await expect(page.getByTestId("planning-backlog-count")).toHaveText("3");

    await setPlanningSort(page, "Нагрузка", "desc");
    await expect(availableCards.first()).toContainText("Heavy Q2");

    await setPlanningSort(page, "Дата реализации", "asc");
    await expect(availableCards.first()).toContainText("Heavy Q2");

    await setPlanningSort(page, "Приоритет", "asc");
    await expect(availableCards.first()).toContainText("Heavy Q2");
  });

  test("shows count-only chip in current plan and supports create-edit-delete", async ({ page }) => {
    await setupPlanningScenario(page);

    await page.goto(urls.planning);
    await expect(page.getByTestId("planning-backlog-count")).toHaveText("2");
    await expect(page.getByTestId("planning-selected-count")).toHaveText("0");
    await expect(page.getByText(/^Выбрано /)).toHaveCount(0);
    await expect(page.getByText(/^Готово /)).toHaveCount(0);

    await page.getByTestId("planning-create-selected").click();
    await page.getByLabel("Название").fill("Черновик E2E");
    await page.getByRole("button", { name: "Сохранить" }).click();

    await expect(page.getByTestId("planning-selected-count")).toHaveText("1");
    await expect(
      page.locator('[data-testid^="planning-item-"]').filter({ hasText: "Черновик E2E" })
    ).toHaveCount(1);

    const createdState = await readPlanningMockState(page);
    const createdItem = createdState.planningItems.find((item: any) => item.title === "Черновик E2E");
    expect(createdItem).toBeTruthy();
    expect(createdItem.priority).toBe(1);
    expect(createdItem.initialQuarterId).toBeTruthy();
    expect(createdItem.planningQuarterIds).toEqual([createdItem.initialQuarterId]);
    expect(createdItem.planningDemands).toEqual([]);

    await page
      .locator('[data-testid^="planning-item-"]')
      .filter({ hasText: "Черновик E2E" })
      .getByRole("button", { name: "Изменить" })
      .click();
    await page.getByLabel("Название").fill("Черновик E2E Updated");
    await page.getByRole("button", { name: "Сохранить" }).click();

    await expect(
      page.locator('[data-testid^="planning-item-"]').filter({ hasText: "Черновик E2E Updated" })
    ).toHaveCount(1);

    page.once("dialog", (dialog) => dialog.accept());
    await page
      .locator('[data-testid^="planning-item-"]')
      .filter({ hasText: "Черновик E2E Updated" })
      .getByRole("button", { name: "Удалить" })
      .click();

    await expect(
      page.locator('[data-testid^="planning-item-"]').filter({ hasText: "Черновик E2E Updated" })
    ).toHaveCount(0);

    const state = await readPlanningMockState(page);
    expect(state.planningItems.some((item: any) => item.title === "Черновик E2E Updated")).toBeFalsy();
  });

  test("restores preview draft and removes caps lock on preview buttons", async ({
    page,
  }) => {
    await openPreview(page);

    await expect(page.getByTestId("planning-preview-back")).toHaveCSS("text-transform", "none");
    await expect(page.getByTestId("planning-preview-recalculate")).toHaveCSS("text-transform", "none");
    await expect(page.getByTestId("planning-preview-apply")).toHaveCSS("text-transform", "none");
    const capacitySection = page.getByTestId("planning-preview-capacity");
    await expect(capacitySection.getByRole("row", { name: /Backend Иван Иванов/ })).toBeVisible();
    await expect(capacitySection.getByRole("row", { name: /QA Мария Петрова/ })).toBeVisible();
    await expect(capacitySection.getByText("01.04.2026 — 14.04.2026")).toBeVisible();

    await expect(page.getByTestId("planning-preview-task-item-1")).toBeVisible();
    await expect(page.getByTestId("planning-preview-task-item-2")).toBeVisible();

    await page.getByTestId("planning-preview-remove-task-item-1").click();
    await expect(page.getByTestId("planning-preview-task-item-1")).toHaveCount(0);
    await expect(page.getByTestId("planning-preview-task-item-2")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("planning-preview-task-item-1")).toHaveCount(0);
    await expect(page.getByTestId("planning-preview-task-item-2")).toBeVisible();

    await page.getByTestId("planning-preview-recalculate").click();
    await expect.poll(async () => (await readPlanningMockState(page)).lastPreviewItemIds).toEqual(["item-2"]);
  });

  test("persists review edits and applies patched metadata together with edited allocations", async ({ page }) => {
    await openPreview(page);

    await page.getByTestId("planning-preview-title-item-1").click();
    const titleInput = page.getByTestId("planning-preview-title-item-1-input");
    await titleInput.fill("Task Alpha Final");
    await titleInput.press("Tab");
    await expect(page.getByTestId("planning-preview-title-item-1")).toContainText("Task Alpha Final");

    await editAllocation(page, "planning-preview-allocation-item-1-participant-1-sprint-1", "4");

    await page.reload();
    await expect(page.getByTestId("planning-preview-title-item-1")).toContainText("Task Alpha Final");
    await expect(page.getByTestId("planning-preview-allocation-item-1-participant-1-sprint-1")).toHaveText("4");

    await page.getByTestId("planning-preview-apply").click();

    await expect.poll(async () => (await readPlanningMockState(page)).lastApplyBody?.itemPatches?.["item-1"]?.title).toBe(
      "Task Alpha Final"
    );
    await expect.poll(async () => (await readPlanningMockState(page)).lastApplyBody?.allocations?.["item-1"]?.["participant-1"]?.["sprint-1"]).toBe(4);
  });

  test("shows warnings and keeps apply available for manual review edits", async ({
    page,
  }) => {
    const scenario = {
      participants: [
        {
          id: "participant-1",
          fullName: "Core Dev",
          role: "Backend",
          displayOrder: 1,
          userStreams: ["Core"],
        },
      ],
      capacities: {
        "participant-1": 2,
      },
      committedLoad: {
        "participant-1": {
          "sprint-1": 1,
          "sprint-2": 2,
        },
      },
      planningItems: [
        {
          id: "item-core",
          title: "Core Critical",
          description: "Должна занять остатки capacity",
          dod: "Ready",
          priority: 1,
          customers: ["Acme"],
          streams: ["Core"],
          planningDemands: [
            {
              kind: "ROLE",
              role: "Backend",
              stream: "Core",
              days: 4,
            },
          ],
          planningQuarterIds: ["quarter-q2"],
          planningSprintIds: [],
          releaseDateId: "release-1",
          initialQuarterId: "quarter-q2",
          order: 1,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        },
        {
          id: "item-missing",
          title: "Missing QA",
          description: "Нет подходящего исполнителя",
          dod: "Ready",
          priority: 1,
          customers: ["Beta"],
          streams: ["Core"],
          planningDemands: [
            {
              kind: "ROLE",
              role: "QA",
              stream: "Core",
              days: 2,
            },
          ],
          planningQuarterIds: ["quarter-q2"],
          planningSprintIds: [],
          releaseDateId: "release-1",
          initialQuarterId: "quarter-q2",
          order: 2,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        },
      ],
    };

    await openPreview(page, scenario);

    await expect(page.getByText("Задача 'Core Critical' не распределена полностью: 3 дн.")).toBeVisible();
    await expect(page.getByText("Задача 'Missing QA' не имеет доступных участников по роли/стриму")).toBeVisible();
    await expect(page.getByTestId("planning-preview-apply")).toBeEnabled();
    await expect(page.getByTestId("planning-preview-allocation-item-core-participant-1-sprint-1")).toHaveText("1");
    await expect(page.getByTestId("planning-preview-task-item-missing")).toBeVisible();

    const state = await readPlanningMockState(page);
    expect(state.lastPreviewResponse.summary.unplannedDays).toBe(5);
    expect(state.lastPreviewResponse.canApply).toBeFalsy();
  });

  test("gives shared capacity to higher-priority tasks first", async ({ page }) => {
    const scenario = {
      sprints: [
        {
          id: "sprint-1",
          quarterId: "quarter-q2",
          name: "Sprint 1",
          startDate: "2026-04-01",
          endDate: "2026-04-14",
          workingDays: 4,
          order: 1,
        },
      ],
      participants: [
        {
          id: "participant-1",
          fullName: "Shared Dev",
          role: "Backend",
          displayOrder: 1,
          userStreams: ["Core"],
        },
      ],
      capacities: {
        "participant-1": 4,
      },
      committedLoad: {
        "participant-1": {
          "sprint-1": 0,
        },
      },
      planningItems: [
        {
          id: "item-high",
          title: "High Priority",
          priority: 1,
          customers: ["Acme"],
          streams: ["Core"],
          planningDemands: [
            {
              kind: "ROLE",
              role: "Backend",
              stream: "Core",
              days: 4,
            },
          ],
          planningQuarterIds: ["quarter-q2"],
          planningSprintIds: ["sprint-1"],
          releaseDateId: "release-1",
          initialQuarterId: "quarter-q2",
          order: 1,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        },
        {
          id: "item-low",
          title: "Low Priority",
          priority: 3,
          customers: ["Beta"],
          streams: ["Core"],
          planningDemands: [
            {
              kind: "ROLE",
              role: "Backend",
              stream: "Core",
              days: 4,
            },
          ],
          planningQuarterIds: ["quarter-q2"],
          planningSprintIds: ["sprint-1"],
          releaseDateId: "release-1",
          initialQuarterId: "quarter-q2",
          order: 2,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        },
      ],
    };

    await openPreview(page, scenario);

    const state = await readPlanningMockState(page);
    const highItem = state.lastPreviewResponse.items.find((item: any) => item.id === "item-high");
    const lowItem = state.lastPreviewResponse.items.find((item: any) => item.id === "item-low");

    expect(highItem.allocations["participant-1"]["sprint-1"]).toBe(4);
    expect(lowItem.allocations).toEqual({});
    expect(state.lastPreviewResponse.summary.unplannedDays).toBe(4);
    expect(state.lastPreviewResponse.warnings).toContain("Задача 'Low Priority' не распределена полностью: 4 дн.");

    await expect(page.getByTestId("planning-preview-allocation-item-high-participant-1-sprint-1")).toHaveText("4");
    await expect(page.getByText("Задача 'Low Priority' не распределена полностью: 4 дн.")).toBeVisible();
    await expect(page.getByTestId("planning-preview-apply")).toBeEnabled();
  });
});
