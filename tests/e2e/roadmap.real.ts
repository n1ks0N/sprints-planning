import { expect, test, type APIRequestContext } from "@playwright/test";

const prefix = "/api/v1/sprints-planning";
async function get(request: APIRequestContext, path: string) {
  const response = await request.get(prefix + path);
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
async function post(request: APIRequestContext, path: string, data: unknown = {}) {
  const response = await request.post(prefix + path, { data });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
async function seed(request: APIRequestContext) {
  const team = `roadmap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await post(request, "/teams", { key: team, name: `Проверка ${team}` });
  const quarter = await post(request, `/${team}/quarters`, { year: 2030, number: 1, name: "Q1 2030", startDate: "2030-01-01", endDate: "2030-03-31" });
  const sprint = await post(request, `/${team}/sprints`, { quarterId: quarter.id, name: "Sprint 1", startDate: "2030-01-07", endDate: "2030-01-25", workingDays: 15, order: 1 });
  const active = await post(request, `/${team}/participants`, { fullName: "Активный исполнитель", role: "DEV", rate: 1, userStreams: [] });
  const old = await post(request, `/${team}/participants`, { fullName: "Бывший исполнитель", role: "QA", rate: 1, userStreams: [] });
  const task = await post(request, `/${team}/tasks`, { title: "Задача из бэклога", workspace: "BACKLOG", status: "backlog", priority: 1,
    initialQuarterId: quarter.id, planningQuarterIds: [quarter.id], participantIds: [active.id, old.id], leaderId: old.id,
    notes: { [old.id]: "Историческая заметка" }, allocations: { [active.id]: { [sprint.id]: 3 }, [old.id]: { [sprint.id]: 2 } } });
  return { team, quarter, sprint, active, old, task };
}
async function cleanup(request: APIRequestContext, team: string) {
  const response = await request.delete(`${prefix}/teams/${team}?deleteData=true`);
  expect([204, 404]).toContain(response.status());
}

test.describe("Roadmap and backlog against PostgreSQL", () => {
  test.setTimeout(90_000);
  test.beforeAll(async ({ request }) => {
    await expect.poll(async () => { try { return (await request.get(`${prefix}/actuator/health`)).status(); } catch { return 0; } }, { timeout: 45_000 }).toBe(200);
  });

  test("preserves inactive assignments and task identity through planning apply", async ({ request }) => {
    const { team, task, active, old, sprint, quarter } = await seed(request);
    try {
      await post(request, `/${team}/participants/delete`, { id: old.id });
      const full = await get(request, `/${team}/tasks/${task.id}`);
      expect(full.participantIds).toContain(old.id);
      const rejected = await request.post(`${prefix}/${team}/tasks`, { data: { title: "Недопустимое назначение", participantIds: [old.id] } });
      expect(rejected.status()).toBe(409);
      const capacity = await get(request, `/${team}/capacity?quarterId=${quarter.id}`);
      expect(capacity.find((r: any) => r.participant.id === active.id).totalQuarterWorkload).toBe(0);
      const item = await post(request, `/${team}/planning-workbench/from-task/${task.id}`);
      const repeated = await post(request, `/${team}/planning-workbench/from-task/${task.id}`);
      expect(repeated.id).toBe(item.id);
      const candidates = await get(request, `/${team}/planning-workbench/backlog?quarterIds=${quarter.id}&sortBy=load`);
      expect(candidates.content.map((i: any) => i.id)).toContain(item.id);
      const preview = await post(request, `/${team}/planning-workbench/preview`, { plannerType: "ALGORITHM", itemIds: [item.id] });
      expect(preview.items[0].allocations[active.id][sprint.id]).toBe(3);
      const applied = await post(request, `/${team}/planning-workbench/apply`, { itemIds: [item.id], allocations: { [item.id]: preview.items[0].allocations } });
      expect(applied).toHaveLength(1);
      expect(applied[0].id).toBe(task.id);
      expect(applied[0].workspace).toBe("ROADMAP");
      expect(applied[0].participantIds).toContain(old.id);
      expect(applied[0].allocations[old.id][sprint.id]).toBe(2);
      expect(applied[0].notes[old.id]).toBe("Историческая заметка");
      expect(applied[0].leaderId).toBe(old.id);
      const tasks = await get(request, `/${team}/tasks?workspace=ROADMAP`);
      expect(tasks.content).toHaveLength(1);
      expect((await get(request, `/${team}/tasks?workspace=BACKLOG`)).content).toHaveLength(0);
      expect((await request.post(`${prefix}/${team}/planning-workbench/apply`, { data: { itemIds: [item.id], allocations: {} } })).ok()).toBeFalsy();
    } finally { await cleanup(request, team); }
  });

  test("manual date is unrestricted, persisted, reused and searchable without creating filter releases", async ({ page, request }) => {
    const { team, task, old } = await seed(request);
    const taskRequests: string[] = [];
    page.on("request", req => { if (req.url().includes("/tasks?")) taskRequests.push(req.url()); });
    try {
      await post(request, `/${team}/participants/delete`, { id: old.id });
      await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Проверка дорожной карты"));
      await page.goto(`/#/${team}/backlog`);
      const card = page.getByTestId(`backlog-task-${task.id}`);
      await expect(card.getByText("Бывший исполнитель", { exact: true })).toBeVisible();
      await expect(card.getByText("Неактивен", { exact: true })).toBeVisible();
      await expect(card.getByRole("button", { name: /Добавить.*корзин.*Jira/i })).toHaveCount(0);
      const requestsBeforeTextEdit = taskRequests.length;
      await card.getByText("Описание", { exact: true }).click();
      const description = card.getByRole("textbox", { name: "Описание", exact: true });
      await description.fill("Описание сохраняется без перечитывания списка");
      await description.press("Tab");
      await expect.poll(async () => (await get(request, `/${team}/tasks/${task.id}`)).description).toBe("Описание сохраняется без перечитывания списка");
      expect(taskRequests).toHaveLength(requestsBeforeTextEdit);
      const dateField = card.getByRole("combobox", { name: "Релиз (ПРОМ)", exact: true });
      await dateField.fill("15.12.2020");
      await dateField.press("Enter");
      await expect.poll(async () => (await get(request, `/${team}/tasks/${task.id}`)).releasePromDate).toBe("2020-12-15");
      await page.reload();
      await expect(card.getByRole("combobox", { name: "Релиз (ПРОМ)", exact: true })).toHaveValue("15.12.2020");
      const releaseFilter = page.getByRole("combobox", { name: "Релиз", exact: true });
      await releaseFilter.fill("15.12.2020"); await releaseFilter.press("Enter");
      await expect(card).toBeVisible();
      const before = await get(request, `/${team}/releases`);
      await releaseFilter.fill("16.12.2020"); await releaseFilter.press("Enter");
      await expect(card, JSON.stringify(taskRequests)).toHaveCount(0);
      expect(await get(request, `/${team}/releases`)).toHaveLength(before.length);
      await releaseFilter.fill(""); await releaseFilter.press("Enter");
      await expect(card).toBeVisible();
      await card.getByRole("combobox", { name: /^Статус/ }).click();
      await page.getByRole("option", { name: "В работе", exact: true }).click();
      await expect(card).toHaveCount(0);
      await page.getByRole("link", { name: "Дорожная карта", exact: true }).click();
      await expect(card).toBeVisible();
      expect((await get(request, `/${team}/tasks/${task.id}`)).participantIds).toContain(old.id);
      const sameDate = await Promise.all([0, 1].map(() => post(request, `/${team}/tasks`, { title: "Та же дата", releasePromDate: "2031-05-10" })));
      expect(sameDate[0].releaseDateId).toBe(sameDate[1].releaseDateId);
    } finally { await cleanup(request, team); }
  });

  test("scopes pinned tasks, retains canceled workspace, detects stale planning and filters quarter options", async ({ request }) => {
    const { team, quarter, task, sprint } = await seed(request);
    try {
      const canceled = await post(request, `/${team}/tasks/update`, { id: task.id, status: "canceled" });
      expect(canceled.workspace).toBe("BACKLOG");
      expect((await get(request, `/${team}/tasks?workspace=ROADMAP&id=${task.id}`)).content).toHaveLength(0);
      expect((await request.post(`${prefix}/${team}/jira/issues`, { data: { taskIds: [task.id], planningSprintId: sprint.id, jiraSprintId: "1", projectKey: "TEST" } })).status()).toBe(409);
      await post(request, `/${team}/tasks/update`, { id: task.id, status: "backlog", releasePromDate: "2030-02-15" });
      const options = await get(request, `/${team}/releases/options?quarterId=${quarter.id}`);
      expect(options.map((r: any) => r.promDate)).toEqual(["2030-02-15"]);
      await post(request, `/${team}/tasks`, { title: "Другой квартал", releasePromDate: "2030-05-15" });
      expect((await get(request, `/${team}/releases/options?quarterId=${quarter.id}`)).map((r: any) => r.promDate)).toEqual(["2030-02-15"]);
      const item = await post(request, `/${team}/planning-workbench/from-task/${task.id}`);
      await post(request, `/${team}/tasks/update`, { id: task.id, description: "Изменено после передачи" });
      const stale = await request.post(`${prefix}/${team}/planning-workbench/apply`, { data: { itemIds: [item.id], allocations: {} } });
      expect(stale.status()).toBe(409);
      const invalid = await request.post(`${prefix}/${team}/tasks`, { data: { title: "Ошибка даты", releasePromDate: "2030-02-31" } });
      expect(invalid.status()).toBe(400);
    } finally { await cleanup(request, team); }
  });
});
