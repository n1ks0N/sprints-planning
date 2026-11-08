import { expect, test, type Page } from "@playwright/test";
import { installReactAudit, readTaskAudit } from "./react-audit";

const team = "rendering-test";
const quarters = [
  { id: "q-current", year: 2026, number: 4, name: "Q4 2026", startDate: "2026-10-01", endDate: "2026-12-31" },
  { id: "q-next", year: 2027, number: 1, name: "Q1 2027", startDate: "2027-01-01", endDate: "2027-03-31" },
];

async function setup(page: Page, workspace: "ROADMAP" | "BACKLOG" = "ROADMAP", count = 20) {
  const participants = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, fullName: `Участник ${i}`, role: "BE", rate: 1, active: true, userStreams: [] }));
  const sprints = quarters.flatMap((q, qi) => Array.from({ length: 6 }, (_, i) => ({ id: `s${qi}-${i}`, quarterId: q.id, name: `Спринт ${i}`, startDate: q.startDate, endDate: q.endDate, workingDays: 10, order: i })));
  const tasks = quarters.flatMap((q, qi) => Array.from({ length: count }, (_, i) => ({
    id: `t${qi}-${i}`, title: `Задача ${qi}-${i}`, workspace, status: workspace === "BACKLOG" ? "backlog" : "inprogress",
    description: "Описание\nВторая строка", dod: "Готово", priority: 2, customers: ["Customer"], streams: ["Core"],
    participantIds: participants.map(p => p.id), initialQuarterId: q.id, planningQuarterIds: [q.id],
    planningSprintIds: sprints.filter(s => s.quarterId === q.id).map(s => s.id),
    allocations: Object.fromEntries(participants.map(p => [p.id, Object.fromEntries(sprints.filter(s => s.quarterId === q.id).map(s => [s.id, 2]))])),
    loads: {}, notes: {}, jiraIssues: {}, order: i, createdAt: "2026-11-01", updatedAt: "2026-11-01",
  })));
  const state = { tasks, taskRequests: [] as URL[], updates: [] as any[], failAllocation: false };
  await installReactAudit(page);
  await page.addInitScript(q => {
    localStorage.setItem("sprints-planning-user-name", "Rendering regression");
    localStorage.setItem("uiState_v1", JSON.stringify({ backlog: { selectedQuarterIds: [q], tasksPageSize: "20", hideAllParticipants: false } }));
  }, quarters[0].id);
  await page.route("**/sprints-planning/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    let resource = url.pathname.split("/sprints-planning")[1];
    const respond = (json: unknown, status = 200) => route.fulfill({ status, json });
    if (resource === "/teams") return respond([{ key: team, name: team }]);
    resource = resource.replace(`/${team}`, "");
    if (resource === "/quarters" || resource === "/quarters/options") return respond(quarters);
    if (resource === "/sprints") return respond(sprints);
    if (resource === "/participants") return respond(participants);
    if (resource === "/filters") return respond({ streams: ["Core"], customers: ["Customer"], participantRoles: ["BE"], participantStreams: [] });
    if (["/releases/options", "/releases", "/capacity"].includes(resource)) return respond([]);
    if (resource === "/tasks") {
      state.taskRequests.push(url);
      await new Promise(resolve => setTimeout(resolve, 150));
      const selected = url.searchParams.get("quarterId")?.split(",");
      const content = tasks.filter(t => !selected?.length || selected.includes(t.initialQuarterId)).sort((a, b) => a.order - b.order);
      const number = Number(url.searchParams.get("page") || 0), size = Number(url.searchParams.get("size") || 20);
      return respond({ content: content.slice(number * size, (number + 1) * size), page: { number, size, totalElements: content.length, totalPages: Math.ceil(content.length / size) }, first: number === 0 });
    }
    if (resource.endsWith("/allocations")) {
      if (state.failAllocation) { state.failAllocation = false; return respond({ message: "Allocation rejected" }, 500); }
      const task = tasks.find(t => t.id === resource.split("/")[2])!;
      const cells = request.postDataJSON().changes;
      for (const cell of cells) task.allocations[cell.participantId][cell.sprintId] = cell.days;
      task.updatedAt = "2026-11-07";
      return respond({ taskId: task.id, cells, loads: {}, updatedAt: task.updatedAt });
    }
    if (resource === "/tasks/update") {
      const update = request.postDataJSON(); state.updates.push(update);
      const task = tasks.find(t => t.id === update.id)!;
      if (typeof update.order === "number") {
        const ordered = tasks.filter(t => t.initialQuarterId === task.initialQuarterId).sort((a, b) => a.order - b.order).filter(t => t.id !== task.id);
        ordered.splice(update.order, 0, task); ordered.forEach((t, i) => t.order = i);
      }
      Object.assign(task, update);
      return respond(task);
    }
    return respond({ message: `Unexpected ${resource}` }, 500);
  });
  await page.goto(`/#/${team}/${workspace === "BACKLOG" ? "backlog" : ""}`);
  await expect(page.getByTestId("backlog-task-t0-0")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("task-cards-region")).toHaveAttribute("aria-busy", "false");
  return state;
}

for (const workspace of ["ROADMAP", "BACKLOG"] as const) {
  test(`${workspace} quarter changes mount visible cards once with allocations already present`, async ({ page }) => {
    const state = await setup(page, workspace);
    const cards = page.locator('[data-testid^="backlog-task-"]');
    expect(await cards.count()).toBeLessThan(8);
    const initial = await readTaskAudit(page);
    expect(initial.emptyTaskAllocations).toEqual([]);
    expect(Object.values(initial.tasks).every(count => count === 1)).toBeTruthy();
    const quartersFilter = page.getByRole("combobox", { name: "Фильтр по кварталам", exact: true });
    await quartersFilter.click();
    await page.getByRole("option", { name: "Q1 2027", exact: true }).click();
    // Complete the two-quarter selection before measuring the final scope.
    // Otherwise a slower click can legitimately render both selections first.
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("task-cards-region")).toHaveAttribute("aria-busy", "false");
    const beforeFinalSelection = await readTaskAudit(page);
    await quartersFilter.locator('xpath=ancestor::div[contains(@class,"MuiAutocomplete-root")]').locator(".MuiChip-root").filter({ hasText: "Q4 2026" }).locator(".MuiChip-deleteIcon").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("backlog-task-t1-0")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("task-cards-region")).toHaveAttribute("aria-busy", "false");
    expect(await cards.count()).toBeLessThan(8);
    expect(state.taskRequests.filter(url => url.searchParams.get("quarterId") === "q-next")).toHaveLength(1);
    const after = await readTaskAudit(page);
    expect(after.emptyTaskAllocations).toEqual([]);
    const visibleTaskIds = await cards.evaluateAll(elements => elements.map(element => element.getAttribute("data-testid")!.replace("backlog-task-", "")));
    for (const id of visibleTaskIds) {
      expect(after.tasks[id] - (beforeFinalSelection.tasks[id] ?? 0), id).toBe(1);
    }
    // Returning to the original quarter reuses RTK Query instead of refetching it.
    await quartersFilter.click();
    await page.getByRole("option", { name: "Q4 2026", exact: true }).click();
    await quartersFilter.locator('xpath=ancestor::div[contains(@class,"MuiAutocomplete-root")]').locator(".MuiChip-root").filter({ hasText: "Q1 2027" }).locator(".MuiChip-deleteIcon").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("backlog-task-t0-0")).toBeVisible();
    expect(state.taskRequests.filter(url => url.searchParams.get("quarterId") === "q-current")).toHaveLength(1);
    const combinedQuarterRequests = state.taskRequests.filter(url => url.searchParams.get("quarterId")?.split(",").length === 2);
    const combinedPages = combinedQuarterRequests.map(url => url.searchParams.get("page"));
    expect(combinedPages.filter(number => number === "0")).toHaveLength(1);
    expect(new Set(combinedPages).size).toBe(combinedPages.length);
  });
}

test("virtual cards retain a focused draft, measure height changes and append the next server page", async ({ page }) => {
  const state = await setup(page, "ROADMAP", 24);
  const first = page.getByTestId("backlog-task-t0-0");
  await first.getByRole("button", { name: "Описание:", exact: true }).click();
  const editor = first.getByRole("textbox", { name: "Описание", exact: true });
  const description = "Один\nДва\nТри\nЧетыре\nПять\nШесть";
  await editor.fill(description);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByText("Загружено 24 задач из 24", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByTestId("backlog-task-t0-23")).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(description);
  expect(await page.locator('[data-testid^="backlog-task-"]').count()).toBeLessThan(8);
  await editor.evaluate(element => element.blur());
  await expect.poll(() => state.updates.some(update => update.description === description)).toBeTruthy();
  const last = await page.getByTestId("backlog-task-t0-23").boundingBox();
  const previous = await page.getByTestId("backlog-task-t0-22").boundingBox();
  expect(previous && last && previous.y + previous.height <= last.y + 1).toBeTruthy();
  expect(state.taskRequests.filter(url => url.searchParams.get("page") === "1")).toHaveLength(1);
});

test("roadmap cell edits update only their card and roll back through RTK Query on failure", async ({ page }) => {
  const state = await setup(page);
  const card = page.getByTestId("backlog-task-t0-0");
  const row = card.getByRole("row").filter({ hasText: "Участник 0" });
  const cell = row.getByRole("cell").nth(2);
  const before = await readTaskAudit(page);
  await cell.getByText("2", { exact: true }).click();
  await cell.getByRole("spinbutton").fill("5");
  await cell.getByRole("spinbutton").press("Tab");
  await expect.poll(() => state.tasks[0].allocations.p0["s0-0"]).toBe(5);
  await expect(cell.getByText("5", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const after = await readTaskAudit(page);
  for (const id of Object.keys(before.tasks).filter(id => id !== "t0-0")) expect(after.tasks[id], id).toBe(before.tasks[id]);
  state.failAllocation = true;
  page.on("dialog", dialog => dialog.accept());
  await cell.getByText("5", { exact: true }).click();
  await cell.getByRole("spinbutton").fill("7");
  await cell.getByRole("spinbutton").press("Tab");
  await page.waitForLoadState("networkidle");
  await expect(cell.getByText("5", { exact: true })).toBeVisible();
});

test("virtualized task cards still support dragging and persist the resulting order", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  const state = await setup(page);
  const first = page.getByTestId("backlog-task-t0-0"), second = page.getByTestId("backlog-task-t0-1");
  const handle = first.locator('span[role="button"]').first();
  const source = await handle.boundingBox(), target = await second.boundingBox();
  expect(source && target).toBeTruthy();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2 + 12, { steps: 3 });
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => state.updates.some(update => update.id === "t0-0" && update.order === 1)).toBeTruthy();
  await expect(page.locator('[data-testid^="backlog-task-"]').first()).toHaveAttribute("data-testid", "backlog-task-t0-1");
});

test("row copy and row/task shifts use the latest optimistic allocations", async ({ page }) => {
  const state = await setup(page);
  const card = page.getByTestId("backlog-task-t0-0");
  const row = card.getByRole("row").filter({ hasText: "Участник 0" });
  await row.getByRole("button", { name: "Скопировать нагрузку в следующий квартал", exact: true }).click();
  await expect.poll(() => state.tasks[0].allocations.p0["s1-0"]).toBe(2);
  await row.getByRole("button", { name: "Сдвинуть вправо (по всем спринтам)", exact: true }).click();
  await expect.poll(() => state.tasks[0].allocations.p0["s0-0"]).toBe(0);
  await expect.poll(() => state.tasks[0].allocations.p0["s1-5"]).toBe(4);
  await page.getByTestId("task-options-t0-0").click();
  await page.getByRole("menuitem", { name: "Сдвинуть нагрузку влево", exact: true }).click();
  await expect.poll(() => state.tasks[0].allocations.p0["s0-0"]).toBe(2);
  await expect.poll(() => state.tasks[0].allocations.p1["s0-0"]).toBe(4);
  await expect(row.getByRole("cell").nth(2).getByText("2", { exact: true })).toBeVisible();
});
