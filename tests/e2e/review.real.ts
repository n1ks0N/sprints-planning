import { expect, test, type APIRequestContext } from "@playwright/test";
test.setTimeout(90_000);
const api = "/api/v1/sprints-planning";
async function post(request: APIRequestContext, path: string, data: unknown) {
  const response = await request.post(api + path, { data });
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
}
async function team(request: APIRequestContext) {
  const key = `review-ui-${Date.now()}`;
  await post(request, "/teams", { key, name: "Temporary review UI" }); return key;
}
async function clean(request: APIRequestContext, key: string) { await request.delete(`${api}/teams/${key}?deleteData=true`); }

test("selected release keeps its date after quarter change and reload", async ({ page, request }) => {
  const key = await team(request);
  try {
    await post(request, `/${key}/quarters`, { year: 2032, number: 1, name: "Q1 2032", startDate: "2032-01-01", endDate: "2032-03-31" });
    const q2 = await post(request, `/${key}/quarters`, { year: 2032, number: 2, name: "Q2 2032", startDate: "2032-04-01", endDate: "2032-06-30" });
    const release = await post(request, `/${key}/releases`, { promDate: "2032-02-15" });
    await post(request, `/${key}/releases`, { promDate: "2032-04-15" });
    await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Code review"));
    await page.goto(`/#/${key}/`);
    const filter = page.getByRole("combobox", { name: "Релиз", exact: true });
    await filter.click(); await page.getByRole("option", { name: "15.02.2032", exact: true }).click();
    await expect(page.getByRole("button", { name: "15.02.2032", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: "Фильтр по кварталам", exact: true }).fill("Q2 2032");
    await page.getByRole("option", { name: "Q2 2032", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "15.02.2032", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "15.02.2032", exact: true })).toBeVisible();
  } finally { await clean(request, key); }
});

test("planning invalidation refreshes all loaded pages", async ({ page, request }) => {
  const key = await team(request);
  try {
    const q = await post(request, `/${key}/quarters`, { year: 2032, number: 1, name: "Q1 2032", startDate: "2032-01-01", endDate: "2032-03-31" });
    const items = [];
    for (let i = 0; i < 23; i++) items.push(await post(request, `/${key}/planning-workbench/items`, { title: `Match ${String(i).padStart(2, "0")}`, initialQuarterId: q.id, priority: 1, planningDemands: [], customers: [], streams: [] }));
    await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Code review"));
    await page.goto(`/#/${key}/planning`);
    const search = page.getByRole("textbox", { name: "Поиск по названию/описанию/DOD", exact: true });
    await search.fill("Match"); await search.press("Tab");
    await page.getByRole("button", { name: "Загрузить еще", exact: true }).click();
    const first = page.getByTestId(`planning-item-${items[0].id}`);
    await expect(page.getByTestId(`planning-item-${items[22].id}`)).toBeVisible();
    await first.getByRole("button", { name: "Изменить", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Название", exact: true }).fill("Excluded from search");
    await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const server = await request.get(`${api}/${key}/planning-workbench/backlog?search=Match&size=200`);
    expect((await server.json()).content.some((item: any) => item.id === items[0].id)).toBe(false);
    await expect(first).toHaveCount(0);
    await expect(page.getByTestId(`planning-item-${items[22].id}`)).toBeVisible();
    const removed = page.getByTestId(`planning-item-${items[1].id}`);
    page.once("dialog", dialog => dialog.accept());
    await removed.getByRole("button", { name: `Удалить ${items[1].title}`, exact: true }).click();
    await expect(removed).toHaveCount(0);
    await expect(page.getByTestId(`planning-item-${items[22].id}`)).toBeVisible();
    await page.getByTestId("planning-create-backlog").click();
    await page.getByRole("dialog").getByRole("textbox", { name: "Название", exact: true }).fill("Match Created after pagination");
    await page.getByRole("dialog").getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator('[data-testid^="planning-item-"]').filter({ hasText: "Match Created after pagination" })).toBeVisible();
    await expect(first).toHaveCount(0);
    await expect(removed).toHaveCount(0);
  } finally { await clean(request, key); }
});

test("Excel uses explicit workspace across navigation with backlog in team key", async ({ page, request }) => {
  const key = `backlog-review-${Date.now()}`;
  await post(request, "/teams", { key, name: "Temporary Excel code review" });
  try {
    await post(request, `/${key}/tasks`, { title: "Roadmap export probe", workspace: "ROADMAP", status: "inprogress" });
    await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Code review"));
    await page.goto(`/#/${key}/`);
    await expect(page.getByRole("heading", { name: "Дорожная карта", exact: true })).toBeVisible();
    const query = page.waitForRequest(req => req.url().includes("/export/excel"));
    await page.getByRole("button", { name: "Экспорт в Excel", exact: true }).click();
    const sent = await query;
    expect(new URL(sent.url()).searchParams.get("workspace")).toBe("ROADMAP");
    await page.goto(`/#/${key}/backlog/`);
    await expect(page.getByRole("heading", { name: "Бэклог", exact: true })).toBeVisible();
    const backlogQuery = page.waitForRequest(req => req.url().includes("/export/excel"));
    await page.getByRole("button", { name: "Экспорт в Excel", exact: true }).click();
    expect(new URL((await backlogQuery).url()).searchParams.get("workspace")).toBe("BACKLOG");
  } finally { await clean(request, key); }
});

test("zero-load assignee survives transfer, dialog save, preview and UI apply", async ({ page, request }) => {
  const key = await team(request);
  try {
    const q = await post(request, `/${key}/quarters`, { year: 2032, number: 1, name: "Q1 2032", startDate: "2032-01-01", endDate: "2032-03-31" });
    await post(request, `/${key}/sprints`, { quarterId: q.id, name: "Sprint", startDate: "2032-01-05", endDate: "2032-01-16", workingDays: 10, order: 1 });
    const participant = await post(request, `/${key}/participants`, { fullName: "Участник без нагрузки", role: "DEV", rate: 1, userStreams: [] });
    const task = await post(request, `/${key}/tasks`, { title: "Без оценки", workspace: "BACKLOG", status: "backlog", initialQuarterId: q.id, participantIds: [participant.id], leaderId: participant.id, notes: { [participant.id]: "Сохранить заметку" } });
    const item = await post(request, `/${key}/planning-workbench/from-task/${task.id}`, {});
    expect(item.planningDemands).toEqual([expect.objectContaining({ participantId: participant.id, days: 0 })]);
    expect(item.notes[participant.id]).toBe("Сохранить заметку");
    expect(item.leaderId).toBe(participant.id);
    await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Regression"));
    await page.goto(`/#/${key}/planning`);
    const card = page.getByTestId(`planning-item-${item.id}`);
    await card.getByRole("button", { name: "Изменить", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await card.getByRole("button", { name: "В план", exact: true }).click();
    await page.getByTestId("planning-run-preview").click();
    const previewCard = page.getByTestId(`planning-preview-task-${item.id}`);
    await expect(previewCard.getByText("Участник без нагрузки", { exact: true })).toBeVisible();
    await previewCard.getByRole("button", { name: "Заметка: Участник без нагрузки", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("textbox", { name: "Заметка", exact: true })).toHaveValue("Сохранить заметку");
    await page.getByRole("dialog").getByRole("button", { name: "Отмена", exact: true }).click();
    await page.getByTestId("planning-preview-apply").click();
    await expect.poll(async () => {
      const response = await request.get(`${api}/${key}/planning-workbench/backlog`);
      return (await response.json()).content.length;
    }).toBe(0);
    const response = await request.get(`${api}/${key}/tasks/${task.id}`);
    const applied = await response.json();
    expect(applied.participantIds).toEqual([participant.id]);
    expect(applied.allocations).toEqual({});
    expect(applied.loads).toEqual({});
    expect(applied.notes[participant.id]).toBe("Сохранить заметку");
    expect(applied.leaderId).toBe(participant.id);
  } finally { await clean(request, key); }
});

test("linked apply distinguishes omitted metadata from explicit clearing", async ({ request }) => {
  const key = await team(request);
  try {
    const participant = await post(request, `/${key}/participants`, { fullName: "Исполнитель", role: "DEV", rate: 1, userStreams: [] });
    for (const clear of [false, true]) {
      const task = await post(request, `/${key}/tasks`, { title: "Метаданные", workspace: "BACKLOG", status: "backlog", participantIds: [participant.id], leaderId: participant.id, notes: { [participant.id]: "Заметка" } });
      const item = await post(request, `/${key}/planning-workbench/from-task/${task.id}`, {});
      const [applied] = await post(request, `/${key}/planning-workbench/apply`, { itemIds: [item.id], allocations: {},
        ...(clear ? { itemPatches: { [item.id]: { title: item.title, priority: item.priority, leaderId: "", notes: { [participant.id]: "" } } } } : {}) });
      expect(applied.participantIds).toEqual([participant.id]);
      expect(applied.leaderId).toBe(clear ? null : participant.id);
      expect(applied.notes).toEqual(clear ? {} : { [participant.id]: "Заметка" });
    }
  } finally { await clean(request, key); }
});

test("deleting a backlog source clears cached planning selection and preserves other drafts", async ({ page, request }) => {
  const key = await team(request);
  try {
    const q = await post(request, `/${key}/quarters`, { year: 2032, number: 1, name: "Q1 2032", startDate: "2032-01-01", endDate: "2032-03-31" });
    const source = await post(request, `/${key}/tasks`, { title: "Связанная задача", priority: 2, workspace: "BACKLOG", status: "backlog", participantIds: [], initialQuarterId: q.id });
    const independent = await post(request, `/${key}/planning-workbench/items`, { title: "Самостоятельная заготовка", priority: 2, customers: [], streams: [], planningDemands: [], initialQuarterId: q.id });
    await page.addInitScript(({ quarterId }) => {
      localStorage.setItem("sprints-planning-user-name", "E2E User");
      localStorage.setItem("uiState_v1", JSON.stringify({ todo: { selectedQuarterIds: [quarterId] } }));
    }, { quarterId: q.id });
    const planningReads: string[] = [];
    page.on("request", r => {
      if (r.method() === "GET" && new URL(r.url()).pathname.endsWith("/planning-workbench/backlog")) planningReads.push(r.url());
    });
    await page.goto(`/#/${key}/backlog`);
    const transferred = page.waitForResponse(r => r.url().endsWith(`/planning-workbench/from-task/${source.id}`) && r.ok());
    await page.getByTestId(`transfer-to-planning-${source.id}`).click();
    const linked = await (await transferred).json();
    await expect(page.getByTestId(`transfer-to-planning-${source.id}`)).toHaveAccessibleName(/Убрать из планирования/);
    await page.getByRole("banner").getByRole("link", { name: "Планирование", exact: true }).click();
    await expect(page.getByTestId(`planning-item-${independent.id}`)).toBeVisible();
    await page.getByTestId("planning-move-all-to-plan").click();
    await expect(page.getByTestId("planning-selected-count")).toHaveText("2");
    const initialReads = planningReads.length;
    await page.getByRole("banner").getByRole("link", { name: "Бэклог", exact: true }).click();
    page.once("dialog", dialog => dialog.accept());
    const deleted = page.waitForResponse(r => r.url().endsWith("/tasks/delete") && r.ok());
    await page.getByTestId(`remove-task-${source.id}`).click();
    await deleted;
    await expect(page.getByTestId(`backlog-task-${source.id}`)).toHaveCount(0);
    await page.getByRole("banner").getByRole("link", { name: "Планирование", exact: true }).click();
    await expect(page.getByTestId("planning-selected-count")).toHaveText("1");
    await expect(page.getByTestId(`planning-item-${linked.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`planning-item-${independent.id}`)).toBeVisible();
    expect(planningReads).toHaveLength(initialReads + 1);
    const response = await request.get(`${api}/${key}/planning-workbench/backlog?size=20`);
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).content.map((item: { id: string }) => item.id)).toEqual([independent.id]);
  } finally { await clean(request, key); }
});
