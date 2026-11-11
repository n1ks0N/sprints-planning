import { expect, test, type Page } from "@playwright/test";
import { buildPlanningScenario, urls } from "./planning.mock";

async function setup(page: Page, taskCount = 1, workspace: "ROADMAP" | "BACKLOG" = "ROADMAP") {
  const scenario = buildPlanningScenario();
  const participants = scenario.participants.map((participant) => ({ ...participant, active: true }));
  const tasks = Array.from({ length: taskCount }, (_, index) => ({
    id: `task-${index + 1}`,
    title: `Задача ${index + 1}`,
    description: "Описание",
    dod: "Готово",
    priority: 2,
    workspace,
    status: workspace === "BACKLOG" ? "backlog" : "inprogress",
    customers: ["Customer"],
    streams: ["Core"],
    participantIds: participants.map((participant) => participant.id),
    planningQuarterIds: [scenario.quarterId],
    planningSprintIds: [scenario.sprints[0].id],
    loads: { [scenario.sprints[0].id]: 5 },
    allocations: {
      [participants[0].id]: { [scenario.sprints[0].id]: 3 },
      [participants[1].id]: { [scenario.sprints[0].id]: 2 },
    },
    notes: { [participants[0].id]: "Сохранённая заметка" },
    jiraIssues: {},
    initialQuarterId: scenario.quarterId,
    leaderId: participants[0].id,
    order: index,
    createdAt: "2026-04-17",
    updatedAt: "2026-04-17",
  }));
  const state = { participants, tasks, taskPages: [] as number[], creates: [] as any[], failNextCreate: false,
    transfers: [] as string[], failNextTransfer: false, transferGate: null as Promise<void> | null };
  await page.addInitScript((quarterId) => {
    localStorage.setItem("sprints-planning-user-name", "E2E User");
    localStorage.setItem("uiState_v1", JSON.stringify({ backlog: {
      selectedQuarterIds: [quarterId], tasksPageSize: "2", hideAllParticipants: false,
    } }));
  }, scenario.quarterId);
  await page.route("**/sprints-planning/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.split("/sprints-planning")[1];
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (path === "/teams") return respond([{ key: scenario.teamKey, name: "Test Team" }]);
    const resource = path.replace(`/${scenario.teamKey}`, "");
    if (resource === "/participants" && request.method() === "GET") {
      return respond(url.searchParams.get("includeInactive") === "true"
        ? participants : participants.filter((participant) => participant.active));
    }
    if (resource === "/participants/delete") {
      const participant = participants.find((p) => p.id === request.postDataJSON().id)!;
      participant.active = false;
      return respond(participant);
    }
    if (resource === "/quarters" || resource === "/quarters/options") return respond(scenario.quarters);
    if (resource === "/sprints") return respond(scenario.sprints);
    if (resource === "/releases" || resource === "/releases/options") return respond(scenario.releases);
    if (resource === "/filters") return respond({ ...scenario.filters,
      participantRoles: [...new Set(participants.filter((p) => p.active).map((p) => p.role))],
      participantStreams: [...new Set(participants.filter((p) => p.active).flatMap((p) => p.userStreams || []))],
    });
    if (resource === "/tasks" && request.method() === "POST") {
      const body = request.postDataJSON();
      state.creates.push(body);
      if (state.failNextCreate) {
        state.failNextCreate = false;
        return respond({ message: "Ошибка создания" }, 500);
      }
      tasks.forEach((task) => { if (task.order >= body.order) task.order += 1; });
      const copy = { ...body, id: `copy-${state.creates.length}`, createdAt: "2026-04-17", updatedAt: "2026-04-17", jiraIssues: {} };
      tasks.push(copy);
      return respond(copy);
    }
    if (resource === "/tasks") {
      const page = Number(url.searchParams.get("page") || 0);
      const size = Number(url.searchParams.get("size") || 20);
      state.taskPages.push(page);
      const search = url.searchParams.get("search")?.toLowerCase();
      const requestedWorkspace = url.searchParams.get("workspace");
      const ordered = tasks.filter((task) => (!requestedWorkspace || task.workspace === requestedWorkspace)
        && (!search || task.title.toLowerCase().includes(search)))
        .sort((left, right) => left.order - right.order);
      return respond({ content: ordered.slice(page * size, (page + 1) * size), page: {
        number: page, size, totalElements: ordered.length, totalPages: Math.ceil(ordered.length / size),
      }, first: page === 0, last: (page + 1) * size >= ordered.length });
    }
    if (resource.startsWith("/planning-workbench/from-task/")) {
      const taskId = resource.split("/").at(-1)!;
      state.transfers.push(taskId);
      if (state.transferGate) await state.transferGate;
      if (state.failNextTransfer) {
        state.failNextTransfer = false;
        return respond({ error: "Не удалось передать задачу" }, 500);
      }
      return respond({ ...tasks.find(task => task.id === taskId), id: `planning-${taskId}`, sourceTaskId: taskId, estimateDays: 5, planningDemands: [] });
    }
    if (resource === "/planning-workbench/backlog") return respond({ content: [], page: { number: 0, size: 20, totalElements: 0, totalPages: 0 } });
    if (resource === "/capacity") return respond([]);
    return respond({ message: `Unexpected request: ${request.method()} ${resource}` }, 500);
  });
  return state;
}

async function duplicate(page: Page, taskId = "task-1") {
  await page.getByTestId(`task-options-${taskId}`).click();
  await page.getByRole("menuitem", { name: "Дублировать", exact: true }).click();
}

test("duplicate appears immediately and retains its planning window", async ({ page }) => {
  const state = await setup(page);
  await page.goto(urls.backlog);
  await duplicate(page);
  await expect(page.getByTestId("backlog-task-copy-1")).toBeVisible();
  expect(state.creates[0].planningQuarterIds).toEqual(state.tasks[0].planningQuarterIds);
  expect(state.creates[0].planningSprintIds).toEqual(state.tasks[0].planningSprintIds);
  await expect(page.getByTestId("backlog-task-copy-1")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("backlog-task-copy-1")).toBeVisible();
});

test("duplicate refreshes earlier pages after additional pages have loaded", async ({ page }) => {
  const state = await setup(page, 4);
  await page.goto(urls.backlog);
  await page.getByTestId("backlog-task-task-2").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("backlog-task-task-4")).toBeAttached();
  expect(state.taskPages).toContain(1);
  const requestsBeforeCopy = state.taskPages.length;
  await duplicate(page);
  await expect(page.getByTestId("backlog-task-copy-1")).toBeVisible();
  await expect.poll(() => state.taskPages.slice(requestsBeforeCopy)).toContain(0);
  const cards = page.locator('[data-testid^="backlog-task-"]');
  await expect.poll(() => cards.evaluateAll((nodes) => nodes.slice(0, 3).map((node) => node.getAttribute("data-testid"))))
    .toEqual(["backlog-task-task-1", "backlog-task-copy-1", "backlog-task-task-2"]);
  await expect(page.getByText("Загружено 5 задач из 5", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByTestId("backlog-task-task-4")).toBeVisible();
  const previous = await page.getByTestId("backlog-task-task-3").boundingBox();
  const last = await page.getByTestId("backlog-task-task-4").boundingBox();
  expect(previous && last && previous.y < last.y).toBeTruthy();
});

test("duplicating the last loaded row keeps the copy visible across a page boundary", async ({ page }) => {
  const state = await setup(page, 4);
  await page.goto(urls.backlog);
  await page.getByTestId("backlog-task-task-2").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("backlog-task-task-4")).toBeAttached();
  await duplicate(page, "task-4");
  await expect(page.getByTestId("backlog-task-copy-1")).toBeVisible();
  await expect.poll(() => state.taskPages).toContain(2);
  await expect(page.locator('[data-testid^="backlog-task-"]')).toHaveCount(5);
});

test("failed duplication rolls back the temporary copy", async ({ page }) => {
  const state = await setup(page);
  state.failNextCreate = true;
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(urls.backlog);
  await duplicate(page);
  await expect.poll(() => state.creates.length).toBe(1);
  await expect(page.locator('[data-testid^="backlog-task-"]')).toHaveCount(1);
  await expect(page.getByTestId("backlog-task-task-1")).toBeVisible();
});

test("deactivation hides the participant from the team and preserves the task row", async ({ page }) => {
  const state = await setup(page);
  const participant = state.participants[0];
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`/#/customlab/team`);
  const row = page.getByRole("row").filter({ hasText: participant.fullName });
  await row.getByRole("button", { name: "Деактивировать участника" }).click();
  await expect(row).toHaveCount(0);
  await page.goto(urls.backlog);
  const task = page.getByTestId("backlog-task-task-1");
  await expect(task.getByText(participant.fullName, { exact: true })).toBeVisible();
  await expect(task.getByText("Неактивен", { exact: true })).toBeVisible();
  expect(state.tasks[0].allocations[participant.id]).toEqual({ "sprint-1": 3 });
  expect(state.tasks[0].leaderId).toBe(participant.id);
  expect(state.tasks[0].notes[participant.id]).toBe("Сохранённая заметка");
  await page.reload();
  await expect(task.getByText("Неактивен", { exact: true })).toBeVisible();
  await duplicate(page);
  await expect(page.getByTestId("backlog-task-copy-1")).toBeVisible();
  expect(state.creates[0].participantIds).not.toContain(participant.id);
  expect(state.creates[0].allocations).not.toHaveProperty(participant.id);
});


test("header highlights only the current section, including planning review and trailing slashes", async ({ page }) => {
  await setup(page);
  await page.goto(urls.backlog);
  const header = page.getByRole("banner");
  const selected = header.locator('a[aria-current="page"]');
  await expect(selected).toHaveText("Дорожная карта");
  await expect(selected).toHaveCSS("background-color", "rgb(0, 160, 0)");
  await expect(selected).toHaveCount(1);
  await header.getByRole("link", { name: "Бэклог", exact: true }).click();
  await expect(selected).toHaveText("Бэклог");
  await expect(header.getByRole("link", { name: "Дорожная карта", exact: true })).not.toHaveAttribute("aria-current", "page");
  await page.goto("/#/customlab/backlog/");
  await expect(selected).toHaveText("Бэклог");
  await header.getByRole("link", { name: "Планирование", exact: true }).click();
  await expect(selected).toHaveText("Планирование");
  await page.goto("/#/customlab/planning/review");
  await expect(selected).toHaveText("Планирование");
  await expect(selected).toHaveCount(1);
});

test("backlog quick action transfers once and shows progress and success without a menu", async ({ page }) => {
  const state = await setup(page, 2, "BACKLOG");
  let releaseTransfer!: () => void;
  state.transferGate = new Promise<void>(resolve => { releaseTransfer = resolve; });
  await page.goto("/#/customlab/backlog");
  const card = page.getByTestId("backlog-task-task-1");
  const action = card.getByTestId("transfer-to-planning-task-1");
  await expect(action).toHaveAccessibleName("Добавить в планирование: Задача 1");
  await expect(card.getByRole("button", { name: /Добавить.*корзину Jira/ })).toHaveCount(0);
  await action.click();
  await expect(action).toBeDisabled();
  await expect(action.getByRole("progressbar")).toBeVisible();
  await expect.poll(() => state.transfers).toEqual(["task-1"]);
  releaseTransfer();
  await expect(action).toHaveAccessibleName("Убрать из планирования: Задача 1");
  await expect(action).toBeEnabled();
  await expect(page.getByText("Задача добавлена в текущий набор для планирования", { exact: true })).toBeVisible();
  await expect(card).toBeVisible();
  expect(state.transfers).toEqual(["task-1"]);
  await page.getByRole("banner").getByRole("link", { name: "Планирование", exact: true }).click();
  await expect(page.getByTestId("planning-selected-count")).toHaveText("1");
  await expect(page.getByTestId("planning-item-planning-task-1")).toBeVisible();
  await page.getByRole("banner").getByRole("link", { name: "Бэклог", exact: true }).click();
  await expect(page.getByTestId("transfer-to-planning-task-1")).toBeEnabled();
  await page.getByTestId("transfer-to-planning-task-1").click();
  await expect(page.getByTestId("transfer-to-planning-task-1")).toHaveAccessibleName("Добавить в планирование: Задача 1");
  expect(state.transfers).toEqual(["task-1"]);
  await page.getByRole("banner").getByRole("link", { name: "Планирование", exact: true }).click();
  await expect(page.getByTestId("planning-selected-count")).toHaveText("0");
  await page.getByRole("banner").getByRole("link", { name: "Бэклог", exact: true }).click();
  await page.getByTestId("transfer-to-planning-task-1").click();
  await expect(page.getByTestId("transfer-to-planning-task-1")).toHaveAccessibleName("Убрать из планирования: Задача 1");
  await page.getByTestId("transfer-to-planning-task-2").click();
  await expect(page.getByTestId("transfer-to-planning-task-2")).toHaveAccessibleName("Убрать из планирования: Задача 2");
  await page.getByRole("banner").getByRole("link", { name: "Планирование", exact: true }).click();
  await expect(page.getByTestId("planning-selected-count")).toHaveText("2");
  expect(state.transfers).toEqual(["task-1", "task-1", "task-2"]);
  await page.getByRole("banner").getByRole("link", { name: "Дорожная карта", exact: true }).click();
  await expect(page.getByTestId("transfer-to-planning-task-1")).toHaveCount(0);
});

test("failed quick transfer can be retried and canceled backlog tasks cannot transfer", async ({ page }) => {
  const state = await setup(page, 2, "BACKLOG");
  state.tasks[1].status = "canceled";
  state.failNextTransfer = true;
  await page.goto("/#/customlab/backlog");
  const action = page.getByTestId("transfer-to-planning-task-1");
  await expect(page.getByTestId("transfer-to-planning-task-2")).toBeDisabled();
  await action.click();
  await expect(page.getByText("Не удалось передать задачу в планирование", { exact: true })).toBeVisible();
  await expect(action).toBeEnabled();
  await action.click();
  await expect(action).toHaveAccessibleName("Убрать из планирования: Задача 1");
  expect(state.transfers).toEqual(["task-1", "task-1"]);
});

async function setupLinkedPlanningCache(page: Page) {
  const state = await setup(page, 2, "BACKLOG");
  type Draft = (typeof state.tasks)[number] & { sourceTaskId?: string; estimateDays: number; planningDemands: [] };
  const drafts = new Map<string, Draft>();
  drafts.set("independent", { ...state.tasks[0], id: "independent", title: "Самостоятельная заготовка", estimateDays: 0, planningDemands: [] });
  const cache = { reads: 0, failDelete: false };
  await page.route("**/planning-workbench/backlog*", route => {
    cache.reads += 1;
    for (const taskId of state.transfers) {
      const source = state.tasks.find(task => task.id === taskId);
      const id = `planning-${taskId}`;
      if (source && !drafts.has(id)) drafts.set(id, { ...source, id, sourceTaskId: taskId, estimateDays: 5, planningDemands: [] });
    }
    const content = [...drafts.values()];
    return route.fulfill({ json: { content, page: { number: 0, size: 20, totalElements: content.length, totalPages: 1 }, first: true } });
  });
  await page.route("**/tasks/delete", route => {
    if (cache.failDelete) return route.fulfill({ status: 500, json: { message: "Deletion rejected" } });
    const { id } = route.request().postDataJSON();
    const index = state.tasks.findIndex(task => task.id === id);
    state.tasks.splice(index, 1);
    drafts.delete(`planning-${id}`);
    return route.fulfill({ json: { id } });
  });
  await page.route("**/tasks/update", route => {
    const body = route.request().postDataJSON();
    const source = state.tasks.find(task => task.id === body.id)!;
    Object.assign(source, body);
    return route.fulfill({ json: source });
  });
  return { state, cache };
}

const openPlanning = async (page: Page) => {
  await page.getByRole("banner").getByRole("link", { name: "Планирование", exact: true }).click();
  await expect(page.getByTestId("planning-item-independent")).toBeVisible();
};

const openBacklog = async (page: Page) => {
  await page.getByRole("banner").getByRole("link", { name: "Бэклог", exact: true }).click();
  await expect(page.getByTestId("backlog-task-task-1")).toBeVisible();
};

async function saveLinkedPreview(page: Page) {
  await page.evaluate(() => {
    const preview = { items: [{ id: "planning-task-1", sourceTaskId: "task-1" }] };
    sessionStorage.setItem("planning-workbench-preview-v2:customlab", JSON.stringify(preview));
    sessionStorage.setItem("planning-workbench-review-state-v2:customlab", JSON.stringify({ preview }));
  });
}

for (const selected of [true, false]) {
  test(`backlog deletion clears planning caches when the linked item is ${selected ? "selected" : "available"} and preserves them on failure`, async ({ page }) => {
    const { cache } = await setupLinkedPlanningCache(page);
    page.on("dialog", dialog => dialog.accept());
    await page.goto("/#/customlab/backlog");
    for (const id of ["task-1", "task-2"]) {
      await page.getByTestId(`transfer-to-planning-${id}`).click();
      await expect(page.getByTestId(`transfer-to-planning-${id}`)).toHaveAccessibleName(/Убрать из планирования/);
    }
    if (!selected) await page.getByTestId("transfer-to-planning-task-1").click();
    await openPlanning(page);
    await expect(page.getByTestId("planning-selected-count")).toHaveText(selected ? "2" : "1");
    await expect(page.getByTestId("planning-item-planning-task-1")).toBeVisible();
    const initialReads = cache.reads;
    await saveLinkedPreview(page);
    await openBacklog(page);
    cache.failDelete = true;
    const failedDelete = page.waitForEvent("dialog", dialog => dialog.type() === "alert");
    await page.getByTestId("remove-task-task-1").click();
    expect((await failedDelete).message()).toContain("Не удалось удалить задачу");
    await expect(page.getByTestId("backlog-task-task-1")).toBeVisible();
    await openPlanning(page);
    await expect(page.getByTestId("planning-selected-count")).toHaveText(selected ? "2" : "1");
    await expect(page.getByTestId("planning-item-planning-task-1")).toBeVisible();
    expect(cache.reads).toBe(initialReads);
    expect(await page.evaluate(() => sessionStorage.getItem("planning-workbench-preview-v2:customlab"))).not.toBeNull();
    await openBacklog(page);
    cache.failDelete = false;
    await page.getByTestId("remove-task-task-1").click();
    await expect(page.getByTestId("backlog-task-task-1")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("planning-workbench-preview-v2:customlab"))).toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem("planning-workbench-review-state-v2:customlab"))).toBeNull();
    await openPlanning(page);
    await expect(page.getByTestId("planning-selected-count")).toHaveText("1");
    await expect(page.getByTestId("planning-backlog-count")).toHaveText("1");
    await expect(page.getByTestId("planning-item-planning-task-1")).toHaveCount(0);
    await expect(page.getByTestId("planning-item-planning-task-2")).toBeVisible();
    expect(cache.reads).toBe(initialReads + 1);
  });
}

test("source updates invalidate planning queries and only previews containing that source", async ({ page }) => {
  const { cache } = await setupLinkedPlanningCache(page);
  await page.goto("/#/customlab/backlog");
  await page.getByTestId("transfer-to-planning-task-1").click();
  await expect(page.getByTestId("transfer-to-planning-task-1")).toHaveAccessibleName(/Убрать из планирования/);
  await openPlanning(page);
  const initialReads = cache.reads;
  await saveLinkedPreview(page);
  await openBacklog(page);
  for (const number of [2, 1]) {
    const card = page.getByTestId(`backlog-task-task-${number}`);
    await card.getByText(`Задача ${number}`, { exact: true }).click();
    const input = card.getByPlaceholder("Название", { exact: true });
    await input.fill(`Обновлённая задача ${number}`);
    const response = page.waitForResponse(r => r.url().endsWith("/tasks/update") && r.ok());
    await input.blur();
    await response;
    await expect(card.getByText(`Обновлённая задача ${number}`, { exact: true })).toBeVisible();
    const storedPreview = await page.evaluate(() => sessionStorage.getItem("planning-workbench-preview-v2:customlab"));
    if (number === 2) expect(storedPreview).not.toBeNull();
    else expect(storedPreview).toBeNull();
  }
  await openPlanning(page);
  await expect(page.getByTestId("planning-selected-count")).toHaveText("1");
  await expect(page.getByTestId("planning-item-planning-task-1")).toBeVisible();
  expect(cache.reads).toBe(initialReads + 1);
});
