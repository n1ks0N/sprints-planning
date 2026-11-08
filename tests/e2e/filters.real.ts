import { expect, test, type APIRequestContext } from "@playwright/test";
import { installReactAudit, readReactAudit, readCellAudit, readParticipantAudit } from "./react-audit";

test.use({ actionTimeout: 10_000 });

const prefix = "/api/v1/sprints-planning";
async function get(request: APIRequestContext, path: string) {
  const response = await request.get(prefix + path);
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
async function post(request: APIRequestContext, path: string, data: unknown) {
  const response = await request.post(prefix + path, { data });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
function quarterAt(offset: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + offset * 3, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
  const year = start.getUTCFullYear();
  const number = start.getUTCMonth() / 3 + 1;
  return { year, number, name: `Q${number} ${year}`, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}
async function seed(request: APIRequestContext) {
  const team = `filters-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await post(request, "/teams", { key: team, name: team });
  const quarters = [];
  for (const offset of [-1, 0, 1, 2]) quarters.push(await post(request, `/${team}/quarters`, quarterAt(offset)));
  const old = await post(request, `/${team}/quarters`, { year: 2020, number: 1, name: "Q1 2020", startDate: "2020-01-01", endDate: "2020-03-31" });
  return { team, previous: quarters[0], current: quarters[1], next: quarters[2], future: quarters[3], old };
}
async function cleanup(request: APIRequestContext, team: string) {
  expect([204, 404]).toContain((await request.delete(`${prefix}/teams/${team}?deleteData=true`)).status());
}

test.describe("Shared filters and creation preferences against PostgreSQL", () => {
  test.setTimeout(90_000);

  for (const saved of [false, true]) {
    test(`home resolves its scope before one options/tasks request (${saved ? "saved filters" : "empty storage"})`, async ({ page, request }) => {
      const { team, current, next } = await seed(request);
      try {
        const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const releaseDate = tomorrow.toISOString().slice(0, 10);
        const nextReleaseDate = next.startDate.slice(0, 8) + "15";
        await post(request, `/${team}/releases`, { promDate: releaseDate });
        await post(request, `/${team}/releases`, { promDate: nextReleaseDate });
        for (const title of ["Карточка A", "Карточка B"]) {
          await post(request, `/${team}/tasks`, { title, workspace: "ROADMAP", status: "inprogress", initialQuarterId: current.id });
        }
        await installReactAudit(page);
        await page.addInitScript(({ saved, quarterId }) => {
          localStorage.setItem("sprints-planning-user-name", "React/API performance regression");
          if (saved) localStorage.setItem("uiState_v1", JSON.stringify({ backlog: { selectedQuarterIds: [quarterId] } }));
        }, { saved, quarterId: current.id });
        // A slow dictionary must not allow a request with unresolved/default-empty filters.
        await page.route(`**/${team}/quarters`, async route => {
          await new Promise(resolve => setTimeout(resolve, 150));
          await route.continue();
        });
        const requests: URL[] = [];
        page.on("request", request => { if (request.url().includes(`/${team}/`)) requests.push(new URL(request.url())); });
        const releaseRequests = () => requests.filter(url => url.pathname.endsWith("/releases/options"));
        const taskRequests = () => requests.filter(url => url.pathname.endsWith("/tasks"));
        await page.goto(`/#/${team}/`);
        const cards = page.locator('[data-testid^="backlog-task-"]');
        await expect(cards).toHaveCount(2);
        await page.waitForLoadState("networkidle");
        expect(releaseRequests()).toHaveLength(1);
        expect(releaseRequests()[0].searchParams.get("quarterId")).toBe(current.id);
        expect(releaseRequests()[0].searchParams.has("fromDate")).toBeFalsy();
        expect(taskRequests()).toHaveLength(1);
        expect(taskRequests()[0].searchParams.get("quarterId")).toBe(current.id);
        expect(requests.filter(url => url.pathname.endsWith("/quarters/options"))).toHaveLength(1);
        if (saved) return;

        const beforeCreation = await readReactAudit(page);
        await page.getByRole("combobox", { name: "Квартал задачи", exact: true }).click();
        await page.getByRole("option", { name: next.name, exact: true }).click();
        const afterCreation = await readReactAudit(page);
        for (const component of ["BacklogPage", "TaskCardsList", "QuarterFilter", "ReleaseFilter"]) {
          expect(afterCreation[component], component).toBe(beforeCreation[component]);
        }
        expect(taskRequests()).toHaveLength(1);
        expect(releaseRequests()).toHaveLength(1);

        const filter = page.getByRole("combobox", { name: "Релиз", exact: true }).first();
        const beforeSearch = await readReactAudit(page);
        await filter.fill("20"); await filter.fill("209"); await filter.fill("2099");
        await expect.poll(() => releaseRequests().filter(url => url.searchParams.get("search") === "2099").length).toBe(1);
        await page.waitForLoadState("networkidle");
        const afterSearch = await readReactAudit(page);
        for (const component of ["BacklogPage", "TaskCardsList", "QuarterFilter"]) {
          expect(afterSearch[component], component).toBe(beforeSearch[component]);
        }
        expect(taskRequests()).toHaveLength(1);
        await filter.press("Escape");
        await page.waitForLoadState("networkidle");
        expect(releaseRequests()).toHaveLength(2); // Returning to empty search reuses the initial cache.

        const assignment = cards.first().getByRole("combobox", { name: "Релиз", exact: true });
        await assignment.click();
        await page.getByRole("option", { name: nextReleaseDate.split("-").reverse().join("."), exact: true }).waitFor();
        expect(releaseRequests().filter(url => url.searchParams.has("fromDate"))).toHaveLength(1);
        await assignment.press("Escape");
        const secondAssignment = cards.nth(1).getByRole("combobox", { name: "Релиз", exact: true });
        await secondAssignment.click();
        await page.getByRole("option", { name: nextReleaseDate.split("-").reverse().join("."), exact: true }).waitFor();
        expect(releaseRequests().filter(url => url.searchParams.has("fromDate"))).toHaveLength(1);
        await secondAssignment.press("Escape");
      } finally { await cleanup(request, team); }
    });
  }

  test("planning starts with resolved filters and loads the assignment dictionary only for its editor", async ({ page, request }) => {
    const { team, current, next } = await seed(request);
    try {
      const release = await post(request, `/${team}/releases`, { promDate: next.startDate.slice(0, 8) + "15" });
      const item = await post(request, `/${team}/planning-workbench/items`, {
        title: "Дата из самой заготовки", priority: 1, initialQuarterId: current.id, releaseDateId: release.id,
      });
      await installReactAudit(page);
      await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Planning performance regression"));
      const requests: URL[] = [];
      page.on("request", req => { if (req.url().includes(`/${team}/`)) requests.push(new URL(req.url())); });
      await page.goto(`/#/${team}/planning`);
      await expect(page.getByTestId(`planning-item-${item.id}`)).toContainText(release.promDate.split("-").reverse().join("."));
      await page.waitForLoadState("networkidle");
      const options = () => requests.filter(url => url.pathname.endsWith("/releases/options"));
      const backlog = requests.filter(url => url.pathname.endsWith("/planning-workbench/backlog"));
      expect(backlog).toHaveLength(1);
      expect(backlog[0].searchParams.get("quarterIds")).toBe(current.id);
      expect(options()).toHaveLength(1);
      expect(options()[0].searchParams.get("quarterId")).toBe(current.id);
      const search = page.getByRole("textbox", { name: "Поиск по названию/описанию/DOD", exact: true });
      const beforeSearch = await readReactAudit(page);
      await search.fill("Д"); await search.fill("Да"); await search.fill("Дата");
      expect((await readReactAudit(page)).PlanningWorkbenchPage).toBe(beforeSearch.PlanningWorkbenchPage);
      await expect.poll(() => requests.filter(url => url.pathname.endsWith("/planning-workbench/backlog") && url.searchParams.get("search") === "Дата").length).toBe(1);
      await page.waitForLoadState("networkidle");
      expect(requests.filter(url => url.pathname.endsWith("/planning-workbench/backlog"))).toHaveLength(2);
      await page.getByRole("button", { name: "Очистить", exact: true }).click();
      await expect(search).toHaveValue("");
      await page.waitForLoadState("networkidle");
      expect(requests.filter(url => url.pathname.endsWith("/planning-workbench/backlog"))).toHaveLength(2);
      await page.getByTestId("planning-create-backlog").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect.poll(() => options().filter(url => url.searchParams.has("fromDate")).length).toBe(1);
      await page.getByRole("dialog").getByRole("button", { name: "Отмена", exact: true }).click();
    } finally { await cleanup(request, team); }
  });

  test("history resolves its own historical release labels after opening", async ({ page, request }) => {
    const { team, current } = await seed(request);
    try {
      const before = await post(request, `/${team}/releases`, { promDate: "2020-01-20" });
      const after = await post(request, `/${team}/releases`, { promDate: "2030-01-15" });
      const task = await post(request, `/${team}/tasks`, { title: "История релизов", workspace: "ROADMAP", status: "inprogress", initialQuarterId: current.id, releaseDateId: before.id });
      const updated = await request.post(`${prefix}/${team}/tasks/update`, {
        data: { id: task.id, releaseDateId: after.id },
        headers: { "X-Session-Id": `history-${team}`, "X-User-Name": "History regression" },
      });
      expect(updated.ok()).toBeTruthy();
      await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "History performance regression"));
      const lookups: URL[] = [];
      page.on("request", req => {
        const url = new URL(req.url());
        if (url.pathname.endsWith(`/${team}/releases/options`) && url.searchParams.has("ids")) lookups.push(url);
      });
      await page.goto(`/#/${team}/`);
      const card = page.getByTestId(`backlog-task-${task.id}`);
      await expect(card).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(lookups).toHaveLength(0);
      await card.getByTestId(`task-options-${task.id}`).click();
      await page.getByRole("menuitem", { name: "История изменений", exact: true }).click();
      const history = page.getByRole("dialog");
      await expect(history).toContainText("20.01.2020");
      await expect(history).toContainText("15.01.2030");
      expect(lookups).toHaveLength(1);
      expect(lookups[0].searchParams.get("ids")?.split(",").sort()).toEqual([before.id, after.id].sort());
      await history.getByRole("button", { name: "Закрыть", exact: true }).click();
    } finally { await cleanup(request, team); }
  });

  test("capacity resolves its initial quarter once and reuses cache for reordered selections", async ({ page, request }) => {
    const { team, current, next } = await seed(request);
    try {
      await post(request, `/${team}/participants`, { fullName: "Участник ёмкости", role: "DEV", rate: 1 });
      await post(request, `/${team}/sprints`, { quarterId: current.id, name: "Спринт ёмкости", startDate: current.startDate, endDate: current.startDate.slice(0, 8) + "14", workingDays: 10, order: 1 });
      await installReactAudit(page);
      await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Capacity audit"));
      const requests: URL[] = [];
      page.on("request", req => { const url = new URL(req.url()); if (url.pathname.endsWith(`/${team}/capacity`)) requests.push(url); });
      await page.goto(`/#/${team}/capacity`);
      await expect(page.getByText("Участник ёмкости", { exact: true })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(requests).toHaveLength(1);
      expect(requests[0].searchParams.get("quarterId")).toBe(current.id);
      const quarters = page.getByRole("combobox", { name: "Фильтр по кварталам", exact: true });
      const beforeSearch = await readReactAudit(page);
      await quarters.fill(next.name);
      await page.getByRole("option", { name: next.name, exact: true }).waitFor();
      expect((await readReactAudit(page)).CapacityTable).toBe(beforeSearch.CapacityTable);
      await page.getByRole("option", { name: next.name, exact: true }).click();
      await page.keyboard.press("Escape");
      await page.waitForLoadState("networkidle");
      expect(requests).toHaveLength(2);
      await quarters.focus();
      await quarters.locator('xpath=ancestor::div[contains(@class,"MuiAutocomplete-root")]').getByRole("button", { name: "Clear", exact: true }).click();
      await page.keyboard.press("Escape");
      await page.waitForLoadState("networkidle");
      expect(requests).toHaveLength(3);
      expect(requests[2].searchParams.has("quarterId")).toBeFalsy();
      await quarters.fill(next.name);
      await page.getByRole("option", { name: next.name, exact: true }).click();
      await page.keyboard.press("Escape");
      await page.waitForLoadState("networkidle");
      expect(requests).toHaveLength(4);
      await quarters.fill(current.name);
      await page.getByRole("option", { name: current.name, exact: true }).click();
      await page.keyboard.press("Escape");
      await page.waitForLoadState("networkidle");
      expect(requests).toHaveLength(4);
    } finally { await cleanup(request, team); }
  });

  test("editing workload leaves unrelated allocation cells untouched", async ({ page, request }) => {
    const { team, current } = await seed(request);
    try {
      const participants = [];
      for (const fullName of ["Первый участник", "Второй участник"]) participants.push(await post(request, `/${team}/participants`, { fullName, role: "DEV", rate: 1 }));
      const sprints = [];
      for (const [start, end] of [["01", "14"], ["15", "28"]]) sprints.push(await post(request, `/${team}/sprints`, {
        quarterId: current.id, name: `Спринт ${start}`, startDate: current.startDate.slice(0, 8) + start,
        endDate: current.startDate.slice(0, 8) + end, workingDays: 10, order: sprints.length + 1,
      }));
      const tasks = [];
      for (const title of ["Нагрузка A", "Нагрузка B"]) tasks.push(await post(request, `/${team}/tasks`, {
        title, workspace: "ROADMAP", status: "inprogress", priority: 1, initialQuarterId: current.id,
        participantIds: participants.map(p => p.id), allocations: Object.fromEntries(participants.map(p => [p.id, Object.fromEntries(sprints.map(s => [s.id, 1]))])),
      }));
      await installReactAudit(page);
      await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Allocation render audit"));
      await page.goto(`/#/${team}/participant-work`);
      await expect(page.getByText("Загружено 2 из 2 сотрудников", { exact: true })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const before = await readCellAudit(page);
      expect(Object.keys(before)).toHaveLength(8);
      const panel = page.getByText(participants[0].fullName, { exact: true }).locator('xpath=ancestor::div[contains(@class,"MuiPaper-root")][1]');
      const row = panel.getByRole("row").filter({ has: page.getByRole("link", { name: tasks[0].title, exact: true }) });
      const cell = row.getByRole("cell").nth(1);
      await cell.getByText("1", { exact: true }).click();
      await cell.getByRole("spinbutton").fill("4");
      expect(await readCellAudit(page)).toEqual(before); // Draft typing belongs to the editor itself.
      await cell.getByRole("spinbutton").press("Tab");
      await expect.poll(async () => (await get(request, `/${team}/tasks/${tasks[0].id}`)).allocations[participants[0].id][sprints[0].id]).toBe(4);
      await page.waitForLoadState("networkidle");
      const after = await readCellAudit(page);
      const changed = `${tasks[0].id}:${participants[0].id}:${sprints[0].id}`;
      expect(after[changed]).toBeGreaterThan(before[changed]);
      for (const key of Object.keys(before).filter(key => key !== changed)) expect(after[key], key).toBe(before[key]);
    } finally { await cleanup(request, team); }
  });

  test("history pagination and focus refresh do not duplicate sessions", async ({ page, request }) => {
    const { team } = await seed(request);
    try {
      for (let i = 0; i < 11; i++) {
        const result = await request.post(`${prefix}/${team}/tasks`, { data: { title: `History ${i}` }, headers: {
          "X-Session-Id": `history-${team}-${i}`, "X-User-Name": "History audit",
        } });
        expect(result.ok()).toBeTruthy();
      }
      await expect.poll(async () => (await get(request, `/${team}/history?page=0&size=20`)).length).toBeGreaterThanOrEqual(11);
      await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "History page audit"));
      const requests: string[] = [];
      page.on("request", req => { if (new URL(req.url()).pathname.endsWith(`/${team}/history`)) requests.push(req.url()); });
      await page.goto(`/#/${team}/history`);
      const sessions = page.getByText(/^Сессия:/);
      await expect(sessions).toHaveCount(10);
      await page.getByRole("button", { name: "Загрузить еще", exact: true }).click();
      await expect.poll(() => sessions.count()).toBeGreaterThan(10);
      await page.waitForLoadState("networkidle");
      const ids = await sessions.allTextContents();
      expect(new Set(ids).size).toBe(ids.length);
      const before = requests.length;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => requests.length).toBe(before + 1);
      await page.waitForLoadState("networkidle");
      const refreshed = await sessions.allTextContents();
      expect(new Set(refreshed).size).toBe(refreshed.length);
    } finally { await cleanup(request, team); }
  });

  test("participant forms keep typing local and preserve create/edit/deactivate behavior", async ({ page, request }) => {
    const { team } = await seed(request);
    try {
      const participants = [];
      for (const fullName of ["Участник A", "Участник B", "Участник C"]) participants.push(await post(request, `/${team}/participants`, { fullName, role: "DEV", rate: 1 }));
      await installReactAudit(page);
      await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Participant render audit"));
      await page.goto(`/#/${team}/team`);
      const row = page.getByTestId(`participant-${participants[0].id}`);
      await expect(row).toBeVisible();
      await page.waitForLoadState("networkidle");
      const beforeCreate = await readReactAudit(page);
      const rowsBefore = await readParticipantAudit(page);
      await page.getByRole("textbox", { name: "ФИО", exact: true }).fill("Новый черновик");
      expect((await readReactAudit(page)).TeamPage).toBe(beforeCreate.TeamPage);
      expect(await readParticipantAudit(page)).toEqual(rowsBefore);
      await row.getByRole("button", { name: "edit", exact: true }).click();
      const beforeEdit = await readReactAudit(page);
      const beforeEditRows = await readParticipantAudit(page);
      await row.getByRole("textbox", { name: "ФИО", exact: true }).fill("Переименованный участник");
      expect((await readReactAudit(page)).TeamPage).toBe(beforeEdit.TeamPage);
      const afterEditRows = await readParticipantAudit(page);
      for (const participant of participants.slice(1)) expect(afterEditRows[participant.id]).toBe(beforeEditRows[participant.id]);
      await row.getByRole("button", { name: "save", exact: true }).click();
      await expect(row).toContainText("Переименованный участник");
      await expect.poll(async () => (await get(request, `/${team}/participants`)).find((p: any) => p.id === participants[0].id).fullName).toBe("Переименованный участник");
      await page.getByRole("textbox", { name: "ФИО", exact: true }).fill("Созданный участник");
      await page.getByRole("combobox", { name: "Роль", exact: true }).fill("DEV");
      await page.keyboard.press("Tab");
      await page.getByRole("button", { name: "Добавить", exact: true }).click();
      await expect(page.getByText("Созданный участник", { exact: true })).toBeVisible();
      const created = (await get(request, `/${team}/participants`)).find((p: any) => p.fullName === "Созданный участник");
      page.once("dialog", dialog => dialog.accept());
      await page.getByTestId(`participant-${created.id}`).getByRole("button", { name: "Деактивировать участника", exact: true }).click();
      await expect(page.getByTestId(`participant-${created.id}`)).toHaveCount(0);
      expect((await get(request, `/${team}/participants?includeInactive=true`)).find((p: any) => p.id === created.id).active).toBe(false);
    } finally { await cleanup(request, team); }
  });

  test("server suggestions search outside the window and release filters combine IDs and dates", async ({ request }) => {
    const { team, previous, current, next, future, old } = await seed(request);
    try {
      expect((await get(request, `/${team}/quarters/options`)).map((q: any) => q.id)).toEqual([previous.id, current.id, next.id]);
      const searched = await get(request, `/${team}/quarters/options?search=Q1`);
      expect(searched.some((q: any) => q.id === old.id)).toBeTruthy();
      expect((await get(request, `/${team}/quarters/options?search=${encodeURIComponent(future.name)}`)).map((q: any) => q.id)).toEqual([future.id]);
      expect(await get(request, `/${team}/quarters/options?search=%25`)).toEqual([]);
      const release = await post(request, `/${team}/releases`, { name: "В квартале", promDate: current.startDate.slice(0, 8) + "15" });
      const oldRelease = await post(request, `/${team}/releases`, { name: "Исторический", promDate: "2020-01-20" });
      expect((await get(request, `/${team}/releases/options?quarterId=${current.id}`)).map((r: any) => r.id)).toEqual([release.id]);
      for (const search of ["20.01.2020", "2020-01"]) {
        expect((await get(request, `/${team}/releases/options?quarterId=${current.id}&search=${search}`)).map((r: any) => r.id)).toEqual([oldRelease.id]);
      }
      const tasks = [];
      const items = [];
      for (const r of [release, oldRelease]) {
        tasks.push(await post(request, `/${team}/tasks`, { title: r.name, workspace: "ROADMAP", status: "inprogress", releaseDateId: r.id }));
        items.push(await post(request, `/${team}/planning-workbench/items`, { title: r.name, priority: 1, releaseDateId: r.id }));
      }
      await post(request, `/${team}/tasks`, { title: "Без релиза", workspace: "ROADMAP", status: "inprogress" });
      const filter = `releaseDateIds=${release.id}&releasePromDates=2020-01-20,2099-01-01`;
      const filteredTasks = await get(request, `/${team}/tasks?workspace=ROADMAP&${filter}&size=1&page=0`);
      expect(filteredTasks.page.totalElements).toBe(2);
      const page2 = await get(request, `/${team}/tasks?workspace=ROADMAP&${filter}&size=1&page=1`);
      expect([...filteredTasks.content, ...page2.content].map((t: any) => t.id).sort()).toEqual(tasks.map(t => t.id).sort());
      const filteredItems = await get(request, `/${team}/planning-workbench/backlog?${filter}`);
      expect(filteredItems.content.map((i: any) => i.id).sort()).toEqual(items.map(i => i.id).sort());
      const invalid = await request.get(`${prefix}/${team}/tasks?releasePromDates=2026-02-30`);
      expect(invalid.status()).toBe(400);
      const excel = await request.get(`${prefix}/${team}/export/excel?workspace=ROADMAP&${filter}`);
      expect(excel.status()).toBe(200);
      expect(excel.headers()["content-type"]).toContain("spreadsheetml");
    } finally { await cleanup(request, team); }
  });

  test("creation remembers successful selections across roadmap and backlog, including no quarter", async ({ page, request }, testInfo) => {
    const { team, previous, current, future } = await seed(request);
    try {
      await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Filter regression"));
      await page.goto(`/#/${team}/`);
      const creationQuarter = page.getByRole("combobox", { name: "Квартал задачи", exact: true });
      await expect(creationQuarter).toHaveText(current.name);
      await creationQuarter.click();
      await expect(page.getByRole("option", { name: previous.name, exact: true })).toHaveCount(0);
      await page.getByRole("option", { name: future.name, exact: true }).click();
      await page.getByRole("button", { name: "Добавить задачу", exact: true }).click();
      await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), `task.creationQuarter.v1:${team}`)).toBe(future.id);
      await page.getByRole("link", { name: "Бэклог", exact: true }).click();
      await expect(creationQuarter).toHaveText(future.name);
      await creationQuarter.click();
      await page.getByRole("option", { name: "Без квартала", exact: true }).click();
      await page.getByRole("button", { name: "Добавить задачу", exact: true }).click();
      await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), `task.creationQuarter.v1:${team}`)).toBe("__NO_INITIAL_QUARTER__");
      await page.reload();
      await expect(creationQuarter).toHaveText("Без квартала");
      const quarterFilter = page.getByRole("combobox", { name: "Фильтр по кварталам", exact: true });
      await quarterFilter.focus();
      await quarterFilter.locator('xpath=ancestor::div[contains(@class,"MuiAutocomplete-root")]').getByRole("button", { name: "Clear", exact: true }).click();
      await page.keyboard.press("Escape");
      const card = page.locator('[data-testid^="backlog-task-"]').first();
      await expect(card.getByRole("textbox", { name: "Описание", exact: true })).toHaveCount(0);
      await expect(card.getByText("Описание", { exact: true })).toHaveCount(0);
      await card.getByRole("button", { name: "Описание:", exact: true }).click();
      const description = card.getByRole("textbox", { name: "Описание", exact: true });
      const descriptionText = "Первая строка описания\nВторая строка описания";
      await description.fill(descriptionText);
      await description.press("Tab");
      const displayedDescription = card.getByText("Первая строка описания Вторая строка описания", { exact: true });
      await expect(displayedDescription).toHaveCSS("color", "rgb(51, 51, 51)");
      await card.getByRole("button", { name: "DOD:", exact: true }).click();
      const dod = card.getByRole("textbox", { name: "Definition of Done", exact: true });
      const dodText = "Первый критерий\nВторой критерий";
      await dod.fill(dodText);
      await dod.press("Tab");
      const displayedDod = card.getByText("Первый критерий Второй критерий", { exact: true });
      for (const display of [displayedDescription, displayedDod]) {
        const lineTops = await display.evaluate(element => {
          const text = element.firstChild!;
          const newline = text.textContent!.indexOf("\n");
          const range = document.createRange();
          range.setStart(text, 0); range.setEnd(text, 1);
          const first = range.getBoundingClientRect().top;
          range.setStart(text, newline + 1); range.setEnd(text, newline + 2);
          return [first, range.getBoundingClientRect().top];
        });
        expect(lineTops[1]).toBeGreaterThan(lineTops[0]);
      }
      const taskId = (await card.getAttribute("data-testid"))!.replace("backlog-task-", "");
      await expect.poll(async () => (await get(request, `/${team}/tasks/${taskId}`)).description).toBe(descriptionText);
      expect((await get(request, `/${team}/tasks/${taskId}`)).dod).toBe(dodText);
      const widths = await card.locator(":scope > .MuiStack-root").first().evaluate(element =>
        Array.from(element.children).map(child => child.getBoundingClientRect().width));
      expect(widths[0] / widths[1]).toBeCloseTo(2 / 3, 1);
      await expect(page.getByText("Все поля редактируются по клику.", { exact: false })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath("task-card.png"), fullPage: true });
      await creationQuarter.click();
      await page.getByRole("option", { name: current.name, exact: true }).click();
      await page.route(`**/${team}/tasks`, route => route.request().method() === "POST"
        ? route.fulfill({ status: 500, json: { message: "Test creation failure" } }) : route.continue());
      const failureDialog = page.waitForEvent("dialog");
      await page.getByRole("button", { name: "Добавить задачу", exact: true }).click();
      const dialog = await failureDialog;
      expect(dialog.message()).toContain("Не удалось создать задачу");
      await dialog.accept();
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), `task.creationQuarter.v1:${team}`)).toBe("__NO_INITIAL_QUARTER__");
    } finally { await cleanup(request, team); }
  });

  test("quarter search, name-only chips and multiple manual release dates work on the shared filter", async ({ page, request }) => {
    const { team, current, old } = await seed(request);
    try {
      await post(request, `/${team}/releases`, { promDate: "2020-01-20", name: "Исторический" });
      await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Filter regression"));
      await page.goto(`/#/${team}/backlog`);
      const quarters = page.getByRole("combobox", { name: "Фильтр по кварталам", exact: true });
      const control = quarters.locator('xpath=ancestor::div[contains(@class,"MuiAutocomplete-root")]');
      await expect(control.getByText(current.name, { exact: true })).toBeVisible();
      await expect(control).not.toContainText(current.startDate);
      await expect(quarters).not.toHaveAttribute("placeholder", /.+/);
      await quarters.focus();
      await control.getByRole("button", { name: "Clear", exact: true }).click();
      await expect(quarters).toHaveAttribute("placeholder", "Название квартала");
      await quarters.fill("Q1 2020");
      await page.getByRole("option", { name: old.name, exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(quarters).not.toHaveAttribute("placeholder", /.+/);
      const release = page.getByRole("combobox", { name: "Релиз", exact: true }).first();
      await expect(release).toHaveAttribute("placeholder", "ДД.ММ.ГГГГ");
      await release.fill("20.01.2020");
      await page.getByRole("option", { name: "20.01.2020", exact: true }).click();
      await release.fill("19.02.2099");
      await release.press("Enter");
      const releaseControl = release.locator('xpath=ancestor::div[contains(@class,"MuiAutocomplete-root")]');
      await expect(releaseControl.getByText("20.01.2020", { exact: true })).toBeVisible();
      await expect(releaseControl.getByText("19.02.2099", { exact: true })).toBeVisible();
      await expect(release).not.toHaveAttribute("placeholder", /.+/);
      await expect.poll(async () => {
        const state = await page.evaluate(() => JSON.parse(localStorage.getItem("uiState_v1") || "{}"));
        return state.taskLists?.[`${team}:BACKLOG`]?.releaseFilters;
      }).toEqual(["2020-01-20", "2099-02-19"]);
      await page.reload();
      await expect(releaseControl.getByText("20.01.2020", { exact: true })).toBeVisible();
      await release.focus();
      await releaseControl.getByRole("button", { name: "Clear", exact: true }).click();
      await expect(release).toHaveAttribute("placeholder", "ДД.ММ.ГГГГ");
      expect((await get(request, `/${team}/releases`)).map((r: any) => r.promDate)).toEqual(["2020-01-20"]);
    } finally { await cleanup(request, team); }
  });

  test("quarter names can be edited, canceled and retained when dates are changed", async ({ page, request }, testInfo) => {
    const { team, current } = await seed(request);
    try {
      await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Quarter rename regression"));
      await page.goto(`/#/${team}/time`);
      const edit = page.getByRole("button", { name: "Редактировать квартал", exact: true });
      await edit.click();
      const name = page.getByRole("textbox", { name: "Название квартала", exact: true });
      const save = page.getByRole("button", { name: "Сохранить", exact: true });
      await expect(name).toHaveValue(current.name);
      await name.fill("   ");
      await expect(save).toBeDisabled();
      await name.fill("Имя без сохранения");
      await page.getByRole("button", { name: "Отмена", exact: true }).click();
      expect((await get(request, `/${team}/quarters`)).find((q: any) => q.id === current.id).name).toBe(current.name);
      await edit.click();
      const customName = "План команды — осенний квартал";
      await name.fill(`  ${customName}  `);
      await save.click();
      await expect(edit).toBeVisible();
      await expect(page.getByRole("button", { name: customName, exact: true })).toBeVisible();
      const renamed = (await get(request, `/${team}/quarters`)).find((q: any) => q.id === current.id);
      expect(renamed).toEqual({ ...current, name: customName });
      await page.reload();
      await edit.click();
      await expect(name).toHaveValue(customName);
      await page.getByLabel("Дата начала", { exact: true }).fill(current.startDate.slice(0, 8) + "02");
      await save.click();
      await expect(edit).toBeVisible();
      expect((await get(request, `/${team}/quarters`)).find((q: any) => q.id === current.id).name).toBe(customName);
      await page.screenshot({ path: testInfo.outputPath("renamed-quarter.png"), fullPage: true });
      await page.getByRole("link", { name: "Бэклог", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Квартал задачи", exact: true })).toHaveText(customName);
    } finally { await cleanup(request, team); }
  });

  test("legacy release filters restore a date outside suggestions and an expired creation quarter falls back to current", async ({ page, request }) => {
    const { team, current, old } = await seed(request);
    try {
      const release = await post(request, `/${team}/releases`, { promDate: "2020-01-20" });
      await page.addInitScript(({ team, currentId, oldId, releaseId }) => {
        if (localStorage.getItem("legacy-filter-test-initialized")) return;
        localStorage.setItem("legacy-filter-test-initialized", "true");
        localStorage.setItem("sprints-planning-user-name", "Legacy regression");
        localStorage.setItem(`task.creationQuarter.v1:${team}`, JSON.stringify(oldId));
        localStorage.setItem("uiState_v1", JSON.stringify({ todo: { selectedQuarterIds: [currentId], releaseSprintFilter: releaseId } }));
        localStorage.setItem(`planning-workbench.filters.v1:${team}`, JSON.stringify({ quarterFilterIds: [currentId], releaseFilterValue: releaseId }));
      }, { team, currentId: current.id, oldId: old.id, releaseId: release.id });
      await page.goto(`/#/${team}/backlog`);
      await expect(page.getByRole("combobox", { name: "Квартал задачи", exact: true })).toHaveText(current.name);
      await expect(page.getByRole("button", { name: "20.01.2020", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Планирование", exact: true }).click();
      await expect(page.getByRole("button", { name: "20.01.2020", exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || "{}").releaseFilterValues, `planning-workbench.filters.v1:${team}`)).toEqual(["2020-01-20"]);
      await page.reload();
      await expect(page.getByRole("button", { name: "20.01.2020", exact: true })).toBeVisible();
    } finally { await cleanup(request, team); }
  });

  test("employee workload appends pages on scroll, reports totals and refreshes the loaded prefix", async ({ page, request }, testInfo) => {
    const { team, current, next } = await seed(request);
    try {
      const sprint = await post(request, `/${team}/sprints`, { quarterId: current.id, name: "Спринт", startDate: current.startDate,
        endDate: current.startDate.slice(0, 8) + "14", workingDays: 10, order: 1 });
      const participants = [];
      for (let i = 0; i < 13; i++) participants.push(await post(request, `/${team}/participants`, { fullName: `Сотрудник ${String(i + 1).padStart(2, "0")}`, role: "DEV", rate: 1 }));
      const task = await post(request, `/${team}/tasks`, { title: "Нагрузка после догрузки", workspace: "ROADMAP", status: "done", priority: 1,
        initialQuarterId: current.id, participantIds: [participants[0].id], allocations: { [participants[0].id]: { [sprint.id]: 2 } } });
      const pages: number[] = [];
      page.on("request", req => { if (req.url().includes("/participant-workload?")) pages.push(Number(new URL(req.url()).searchParams.get("page") || 0)); });
      await page.addInitScript(() => localStorage.setItem("sprints-planning-user-name", "Pagination regression"));
      await page.goto(`/#/${team}/participant-work`);
      await expect(page.getByText("Загружено 10 из 13 сотрудников", { exact: true })).toBeAttached();
      const loadMore = page.getByRole("button", { name: "Загрузить еще", exact: true });
      await loadMore.scrollIntoViewIfNeeded();
      await expect(page.getByText("Загружено 13 из 13 сотрудников", { exact: true })).toBeVisible();
      expect(pages).toEqual([0, 1]);
      await expect(loadMore).toBeDisabled();
      await expect(page.getByText(participants[0].fullName, { exact: true })).toHaveCount(1);
      await expect(page.getByText(participants[12].fullName, { exact: true })).toHaveCount(1);
      const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: task.title, exact: true }) });
      const cell = row.getByRole("cell").nth(1);
      await cell.getByText("2", { exact: true }).click();
      await cell.getByRole("spinbutton").fill("3");
      await cell.getByRole("spinbutton").press("Tab");
      await expect.poll(() => pages.length).toBeGreaterThanOrEqual(4);
      expect(pages.slice(-2)).toEqual([0, 1]);
      await expect(page.getByText("Загружено 13 из 13 сотрудников", { exact: true })).toBeAttached();
      expect((await get(request, `/${team}/tasks/${task.id}`)).allocations[participants[0].id][sprint.id]).toBe(3);
      await page.screenshot({ path: testInfo.outputPath("employee-infinite-scroll.png"), fullPage: true });
      const quarters = page.getByRole("combobox", { name: "Фильтр по кварталам", exact: true });
      const quarterControl = quarters.locator('xpath=ancestor::div[contains(@class,"MuiAutocomplete-root")]');
      await page.waitForLoadState("networkidle");
      const requestsBeforeClear = pages.length;
      await quarters.focus();
      await quarterControl.getByRole("button", { name: "Clear", exact: true }).click();
      await expect(page.getByRole("alert")).toHaveText("Квартал обязателен");
      await expect(page.getByText("Нет участников по выбранным фильтрам", { exact: true })).toHaveCount(0);
      await expect(loadMore).toHaveCount(0);
      await page.waitForLoadState("networkidle");
      expect(pages).toHaveLength(requestsBeforeClear);
      await quarters.fill(next.name);
      await page.getByRole("option", { name: next.name, exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByText("Квартал обязателен", { exact: true })).toHaveCount(0);
      await expect.poll(() => pages.at(-1)).toBe(0);
    } finally { await cleanup(request, team); }
  });
});
