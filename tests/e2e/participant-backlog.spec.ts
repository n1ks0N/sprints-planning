import { expect, test, type Page } from "@playwright/test";
import { buildPlanningScenario, urls } from "./planning.mock";

async function setup(page: Page, taskCount = 1) {
  const scenario = buildPlanningScenario();
  const participants = scenario.participants.map((participant) => ({ ...participant, active: true }));
  const tasks = Array.from({ length: taskCount }, (_, index) => ({
    id: `task-${index + 1}`,
    title: `Задача ${index + 1}`,
    description: "Описание",
    dod: "Готово",
    priority: 2,
    status: "inprogress",
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
  const state = { participants, tasks, taskPages: [] as number[], creates: [] as any[], failNextCreate: false };
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
    if (resource === "/quarters") return respond(scenario.quarters);
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
      const ordered = tasks.filter((task) => !search || task.title.toLowerCase().includes(search))
        .sort((left, right) => left.order - right.order);
      return respond({ content: ordered.slice(page * size, (page + 1) * size), page: {
        number: page, size, totalElements: ordered.length, totalPages: Math.ceil(ordered.length / size),
      }, first: page === 0, last: (page + 1) * size >= ordered.length });
    }
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
  await expect.poll(() => cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid"))))
    .toEqual(["backlog-task-task-1", "backlog-task-copy-1", "backlog-task-task-2", "backlog-task-task-3", "backlog-task-task-4"]);
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
