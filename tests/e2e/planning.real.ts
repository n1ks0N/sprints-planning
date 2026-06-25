import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

const API_PREFIX = "/api/v1/sprints-planning";
const USER_NAME_STORAGE_KEY = "sprints-planning-user-name";

type QuarterDto = {
  id: string;
  year: number;
  number: number;
  name: string;
  startDate: string;
  endDate: string;
};

type SprintDto = {
  id: string;
  quarterId: string;
  name: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  order: number;
};

type ParticipantDto = {
  id: string;
  fullName: string;
  role: string;
  rate: number;
  userStreams: string[];
  jiraLogin?: string | null;
};

type ReleaseDto = {
  id: string;
  name?: string | null;
  promDate: string;
};

type PlanningDemandRequest = {
  kind: "ROLE" | "PARTICIPANT";
  role?: string | null;
  participantId?: string | null;
  stream?: string | null;
  days: number;
};

type PlanningWorkbenchItemDto = {
  id: string;
  title: string;
  priority: number;
};

type BacklogTaskDto = {
  id: string;
  title: string;
  priority: number;
  status: string;
  loads: Record<string, number>;
  allocations?: Record<string, Record<string, number>>;
  participantIds: string[];
  planningDemands?: PlanningDemandRequest[];
};

type TaskPageDto = {
  content: BacklogTaskDto[];
};

type PlanningBaseSeed = {
  quarter: QuarterDto;
  sprint1: SprintDto;
  sprint2: SprintDto;
  dev: ParticipantDto;
  qa: ParticipantDto;
  release: ReleaseDto;
};

type SingleSprintSeed = {
  quarter: QuarterDto;
  sprint: SprintDto;
  dev: ParticipantDto;
  release: ReleaseDto;
};

const uniqueTeamKey = (suffix: string) =>
  `pwreal-${suffix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const planningPath = (teamKey: string) => `/#/${teamKey}/planning`;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ensureOk = async (response: APIResponse, action: string) => {
  if (response.ok()) {
    return;
  }
  throw new Error(`${action} failed with ${response.status()}: ${await response.text()}`);
};

const getJson = async <T>(response: APIResponse): Promise<T> => {
  return (await response.json()) as T;
};

const apiGet = async <T>(request: APIRequestContext, path: string): Promise<T> => {
  const response = await request.get(`${API_PREFIX}${path}`);
  await ensureOk(response, `GET ${path}`);
  return getJson<T>(response);
};

const apiPost = async <T>(
  request: APIRequestContext,
  path: string,
  data: unknown
): Promise<T> => {
  const response = await request.post(`${API_PREFIX}${path}`, { data });
  await ensureOk(response, `POST ${path}`);
  return getJson<T>(response);
};

const prepareBrowser = async (page: Page) => {
  await page.addInitScript((key: string) => {
    window.localStorage.setItem(key, "Playwright Real E2E");
  }, USER_NAME_STORAGE_KEY);
};

const createTeam = async (request: APIRequestContext, teamKey: string) => {
  await apiPost<{ key: string; name: string }>(request, "/teams", {
    key: teamKey,
    name: `Playwright ${teamKey}`,
  });
};

const cleanupTeam = async (request: APIRequestContext, teamKey: string) => {
  try {
    const backlogResponse = await request.get(`${API_PREFIX}/${teamKey}/planning-workbench/backlog`);
    if (backlogResponse.ok()) {
      const planningItems = await getJson<PlanningWorkbenchItemDto[]>(backlogResponse);
      for (const item of planningItems) {
        await request.delete(`${API_PREFIX}/${teamKey}/planning-workbench/items/${item.id}`);
      }
    }
  } catch (error) {
    console.warn(`Cleanup backlog failed for ${teamKey}`, error);
  }
  try {
    const response = await request.delete(`${API_PREFIX}/teams/${teamKey}`, {
      params: { deleteData: true },
    });
    if (response.status() === 404 || response.status() === 204) {
      return;
    }
    await ensureOk(response, `DELETE /teams/${teamKey}`);
  } catch (error) {
    console.warn(`Cleanup team failed for ${teamKey}`, error);
  }
};

const seedBasePlanningTeam = async (
  request: APIRequestContext,
  teamKey: string
): Promise<PlanningBaseSeed> => {
  const quarter = await apiPost<QuarterDto>(request, `/${teamKey}/quarters`, {
    year: 2026,
    number: 2,
    name: "Q2 2026",
    startDate: "2026-04-01",
    endDate: "2026-06-30",
  });
  const sprint1 = await apiPost<SprintDto>(request, `/${teamKey}/sprints`, {
    quarterId: quarter.id,
    name: "Sprint 1",
    startDate: "2026-04-01",
    endDate: "2026-04-14",
    workingDays: 8,
    order: 1,
  });
  const sprint2 = await apiPost<SprintDto>(request, `/${teamKey}/sprints`, {
    quarterId: quarter.id,
    name: "Sprint 2",
    startDate: "2026-04-15",
    endDate: "2026-04-28",
    workingDays: 8,
    order: 2,
  });
  const dev = await apiPost<ParticipantDto>(request, `/${teamKey}/participants`, {
    fullName: "Dev Core",
    role: "DEV",
    rate: 1,
    userStreams: ["Core"],
    jiraLogin: "dev.core",
  });
  const qa = await apiPost<ParticipantDto>(request, `/${teamKey}/participants`, {
    fullName: "QA Core",
    role: "QA",
    rate: 1,
    userStreams: ["Core"],
    jiraLogin: "qa.core",
  });
  const release = await apiPost<ReleaseDto>(request, `/${teamKey}/releases`, {
    name: "Release Q2",
    promDate: "2026-05-20",
  });
  return { quarter, sprint1, sprint2, dev, qa, release };
};

const seedSingleSprintTeam = async (
  request: APIRequestContext,
  teamKey: string,
  workingDays: number
): Promise<SingleSprintSeed> => {
  const quarter = await apiPost<QuarterDto>(request, `/${teamKey}/quarters`, {
    year: 2026,
    number: 2,
    name: "Q2 2026",
    startDate: "2026-04-01",
    endDate: "2026-06-30",
  });
  const sprint = await apiPost<SprintDto>(request, `/${teamKey}/sprints`, {
    quarterId: quarter.id,
    name: "Sprint 1",
    startDate: "2026-04-01",
    endDate: "2026-04-14",
    workingDays,
    order: 1,
  });
  const dev = await apiPost<ParticipantDto>(request, `/${teamKey}/participants`, {
    fullName: "Dev Core",
    role: "DEV",
    rate: 1,
    userStreams: ["Core"],
    jiraLogin: "dev.core",
  });
  const release = await apiPost<ReleaseDto>(request, `/${teamKey}/releases`, {
    name: "Release Q2",
    promDate: "2026-05-20",
  });
  return { quarter, sprint, dev, release };
};

const createTask = async (
  request: APIRequestContext,
  teamKey: string,
  payload: Record<string, unknown>
) => apiPost<BacklogTaskDto>(request, `/${teamKey}/tasks`, payload);

const createPlanningItem = async (
  request: APIRequestContext,
  teamKey: string,
  payload: Record<string, unknown>
) => apiPost<PlanningWorkbenchItemDto>(request, `/${teamKey}/planning-workbench/items`, payload);

const openPreview = async (page: Page, teamKey: string, selectedCount: string) => {
  await page.goto(planningPath(teamKey));
  await expect(page.getByTestId("planning-backlog-count")).toHaveText(selectedCount);
  await page.getByTestId("planning-move-all-to-plan").click();
  await expect(page.getByTestId("planning-selected-count")).toHaveText(selectedCount);
  await page.getByTestId("planning-run-preview").click();
  await expect(page).toHaveURL(new RegExp(`#/${escapeRegExp(teamKey)}/planning/review$`));
  await expect(page.getByTestId("planning-preview-page")).toBeVisible();
};

const editPreviewAllocation = async (
  page: Page,
  itemId: string,
  participantId: string,
  sprintId: string,
  value: string
) => {
  const input = page.getByTestId(`planning-preview-allocation-${itemId}-${participantId}-${sprintId}`);
  await input.click();
  await input.fill(value);
  await input.blur();
  await expect(input).toHaveText(value);
};

test.describe("Planning Workbench Real Backend", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }) => {
    const response = await request.get(`${API_PREFIX}/teams`);
    await ensureOk(response, "GET /teams");
  });

  test("persists real preview and applies solver allocations into backlog tasks", async ({ page, request }) => {
    const teamKey = uniqueTeamKey("apply");

    try {
      await createTeam(request, teamKey);
      const seed = await seedBasePlanningTeam(request, teamKey);

      await createTask(request, teamKey, {
        title: "Busy Sprint 1",
        description: "Committed load for preview",
        dod: "Ready",
        priority: 2,
        status: "inprogress",
        customers: ["Core Bank"],
        streams: ["Core"],
        participantIds: [seed.dev.id],
        planningDemands: [
          {
            kind: "PARTICIPANT",
            participantId: seed.dev.id,
            stream: "Core",
            days: 4,
          } satisfies PlanningDemandRequest,
        ],
        planningQuarterIds: [seed.quarter.id],
        planningSprintIds: [seed.sprint1.id],
        loads: {
          [seed.sprint1.id]: 4,
        },
        allocations: {
          [seed.dev.id]: {
            [seed.sprint1.id]: 4,
          },
        },
        releaseDateId: seed.release.id,
        initialQuarterId: seed.quarter.id,
      });

      const criticalItem = await createPlanningItem(request, teamKey, {
        title: "Critical API",
        description: "Priority role-based task",
        dod: "DoD",
        priority: 1,
        customers: ["Core Bank"],
        streams: ["Core"],
        planningDemands: [
          {
            kind: "ROLE",
            role: "DEV",
            stream: "Core",
            days: 6,
          } satisfies PlanningDemandRequest,
        ],
        releaseDateId: seed.release.id,
        initialQuarterId: seed.quarter.id,
        planningQuarterIds: [seed.quarter.id],
        planningSprintIds: [],
      });

      const qaItem = await createPlanningItem(request, teamKey, {
        title: "QA Gate",
        description: "Specific participant task",
        dod: "DoD",
        priority: 2,
        customers: ["Core Bank"],
        streams: ["Core"],
        planningDemands: [
          {
            kind: "PARTICIPANT",
            participantId: seed.qa.id,
            stream: "Core",
            days: 2,
          } satisfies PlanningDemandRequest,
        ],
        releaseDateId: seed.release.id,
        initialQuarterId: seed.quarter.id,
        planningQuarterIds: [seed.quarter.id],
        planningSprintIds: [seed.sprint2.id],
      });

      await prepareBrowser(page);
      await openPreview(page, teamKey, "2");

      await expect(
        page.getByTestId(`planning-preview-allocation-${criticalItem.id}-${seed.dev.id}-${seed.sprint1.id}`)
      ).toHaveText("2");
      await expect(
        page.getByTestId(`planning-preview-allocation-${criticalItem.id}-${seed.dev.id}-${seed.sprint2.id}`)
      ).toHaveText("4");
      await expect(
        page.getByTestId(`planning-preview-allocation-${qaItem.id}-${seed.qa.id}-${seed.sprint2.id}`)
      ).toHaveText("2");
      await expect(page.getByTestId("planning-preview-apply")).toBeEnabled();

      await page.reload();
      await expect(page.getByTestId("planning-preview-page")).toBeVisible();
      await expect(
        page.getByTestId(`planning-preview-allocation-${criticalItem.id}-${seed.dev.id}-${seed.sprint1.id}`)
      ).toHaveText("2");
      await expect(
        page.getByTestId(`planning-preview-allocation-${criticalItem.id}-${seed.dev.id}-${seed.sprint2.id}`)
      ).toHaveText("4");

      await page.getByTestId("planning-preview-apply").click();
      await expect(page).toHaveURL(new RegExp(`#/${escapeRegExp(teamKey)}/$`));

      const planningBacklog = await apiGet<PlanningWorkbenchItemDto[]>(
        request,
        `/${teamKey}/planning-workbench/backlog`
      );
      expect(planningBacklog).toHaveLength(0);

      const tasks = await apiGet<TaskPageDto>(request, `/${teamKey}/tasks?page=0&size=50`);
      const criticalTask = tasks.content.find((task) => task.title === "Critical API");
      const qaTask = tasks.content.find((task) => task.title === "QA Gate");

      expect(criticalTask).toBeTruthy();
      expect(criticalTask?.participantIds).toEqual([seed.dev.id]);
      expect(criticalTask?.loads[seed.sprint1.id]).toBe(2);
      expect(criticalTask?.loads[seed.sprint2.id]).toBe(4);
      expect(criticalTask?.allocations?.[seed.dev.id]?.[seed.sprint1.id]).toBe(2);
      expect(criticalTask?.allocations?.[seed.dev.id]?.[seed.sprint2.id]).toBe(4);

      expect(qaTask).toBeTruthy();
      expect(qaTask?.participantIds).toEqual([seed.qa.id]);
      expect(qaTask?.loads[seed.sprint2.id]).toBe(2);
      expect(qaTask?.allocations?.[seed.qa.id]?.[seed.sprint2.id]).toBe(2);
    } finally {
      await cleanupTeam(request, teamKey);
    }
  });

  test("blocks apply on solver warning and allows continue after removing impossible task", async ({
    page,
    request,
  }) => {
    const teamKey = uniqueTeamKey("warning");

    try {
      await createTeam(request, teamKey);
      const seed = await seedSingleSprintTeam(request, teamKey, 4);

      const plannedItem = await createPlanningItem(request, teamKey, {
        title: "Core Task",
        description: "Fits exactly into one sprint",
        dod: "DoD",
        priority: 1,
        customers: ["Core Bank"],
        streams: ["Core"],
        planningDemands: [
          {
            kind: "ROLE",
            role: "DEV",
            stream: "Core",
            days: 3,
          } satisfies PlanningDemandRequest,
        ],
        releaseDateId: seed.release.id,
        initialQuarterId: seed.quarter.id,
        planningQuarterIds: [seed.quarter.id],
        planningSprintIds: [seed.sprint.id],
      });

      const missingItem = await createPlanningItem(request, teamKey, {
        title: "Missing QA",
        description: "No matching participant",
        dod: "DoD",
        priority: 1,
        customers: ["Core Bank"],
        streams: ["Core"],
        planningDemands: [
          {
            kind: "ROLE",
            role: "QA",
            stream: "Core",
            days: 2,
          } satisfies PlanningDemandRequest,
        ],
        releaseDateId: seed.release.id,
        initialQuarterId: seed.quarter.id,
        planningQuarterIds: [seed.quarter.id],
        planningSprintIds: [seed.sprint.id],
      });

      await prepareBrowser(page);
      await openPreview(page, teamKey, "2");

      await expect(
        page.getByText("Задача 'Missing QA' не имеет доступных участников по роли/стриму")
      ).toBeVisible();
      await expect(page.getByTestId("planning-preview-apply")).toBeEnabled();
      await expect(
        page.getByTestId(`planning-preview-allocation-${plannedItem.id}-${seed.dev.id}-${seed.sprint.id}`)
      ).toHaveText("3");

      await page.getByTestId(`planning-preview-remove-task-${missingItem.id}`).click();
      await expect(page.getByTestId(`planning-preview-task-${missingItem.id}`)).toHaveCount(0);
      await page.getByTestId("planning-preview-recalculate").click();

      await expect(
        page.getByText("Задача 'Missing QA' не имеет доступных участников по роли/стриму")
      ).toHaveCount(0);
      await expect(page.getByTestId("planning-preview-apply")).toBeEnabled();

      await page.getByTestId("planning-preview-apply").click();
      await expect(page).toHaveURL(new RegExp(`#/${escapeRegExp(teamKey)}/$`));

      const tasks = await apiGet<TaskPageDto>(request, `/${teamKey}/tasks?page=0&size=50`);
      expect(tasks.content.filter((task) => task.title === "Core Task")).toHaveLength(1);
      expect(tasks.content.some((task) => task.title === "Missing QA")).toBeFalsy();
    } finally {
      await cleanupTeam(request, teamKey);
    }
  });

  test("gives shared capacity to higher priority task on the real solver path", async ({ page, request }) => {
    const teamKey = uniqueTeamKey("priority");

    try {
      await createTeam(request, teamKey);
      const seed = await seedSingleSprintTeam(request, teamKey, 8);

      const highItem = await createPlanningItem(request, teamKey, {
        title: "Critical First",
        description: "Should consume shared capacity first",
        dod: "DoD",
        priority: 1,
        customers: ["Core Bank"],
        streams: ["Core"],
        planningDemands: [
          {
            kind: "ROLE",
            role: "DEV",
            stream: "Core",
            days: 6,
          } satisfies PlanningDemandRequest,
        ],
        releaseDateId: seed.release.id,
        initialQuarterId: seed.quarter.id,
        planningQuarterIds: [seed.quarter.id],
        planningSprintIds: [seed.sprint.id],
      });

      const lowItem = await createPlanningItem(request, teamKey, {
        title: "Can Wait",
        description: "Should stay unplanned",
        dod: "DoD",
        priority: 3,
        customers: ["Core Bank"],
        streams: ["Core"],
        planningDemands: [
          {
            kind: "ROLE",
            role: "DEV",
            stream: "Core",
            days: 6,
          } satisfies PlanningDemandRequest,
        ],
        releaseDateId: seed.release.id,
        initialQuarterId: seed.quarter.id,
        planningQuarterIds: [seed.quarter.id],
        planningSprintIds: [seed.sprint.id],
      });

      await prepareBrowser(page);
      await openPreview(page, teamKey, "2");

      await expect(
        page.getByTestId(`planning-preview-allocation-${highItem.id}-${seed.dev.id}-${seed.sprint.id}`)
      ).toHaveText("6");
      await expect(page.getByText("Задача 'Can Wait' не распределена полностью: 6 дн.")).toBeVisible();
      await expect(page.getByText("Нагрузка 0/6 дн. (-6 дн.)")).toBeVisible();
      await expect(page.getByTestId("planning-preview-apply")).toBeEnabled();
    } finally {
      await cleanupTeam(request, teamKey);
    }
  });

  test("allows editing task metadata participants and allocations on preview before apply", async ({
    page,
    request,
  }) => {
    const teamKey = uniqueTeamKey("manual-preview");

    try {
      await createTeam(request, teamKey);
      const seed = await seedBasePlanningTeam(request, teamKey);

      const item = await createPlanningItem(request, teamKey, {
        title: "Manual Preview Source",
        description: "Original description",
        dod: "Original DoD",
        priority: 2,
        customers: ["Core Bank"],
        streams: ["Core"],
        planningDemands: [
          {
            kind: "ROLE",
            role: "DEV",
            stream: "Core",
            days: 4,
          } satisfies PlanningDemandRequest,
        ],
        releaseDateId: seed.release.id,
        initialQuarterId: seed.quarter.id,
        planningQuarterIds: [seed.quarter.id],
        planningSprintIds: [seed.sprint1.id, seed.sprint2.id],
      });

      await prepareBrowser(page);
      await openPreview(page, teamKey, "1");

      await page.getByTestId(`planning-preview-title-${item.id}`).click();
      await page.getByTestId(`planning-preview-title-${item.id}-input`).fill("Manual Preview Final");
      await page.getByTestId(`planning-preview-title-${item.id}-input`).press("Tab");
      await expect(page.getByTestId(`planning-preview-title-${item.id}`)).toContainText("Manual Preview Final");

      await page.getByTestId(`planning-preview-priority-${item.id}`).click();
      await page.getByRole("option", { name: "1" }).click();
      await page.getByTestId(`planning-preview-status-${item.id}`).click();
      await page.getByRole("option", { name: "Выполнена" }).click();

      const taskCard = page.getByTestId(`planning-preview-task-${item.id}`);
      await taskCard.getByLabel("Добавить участника").click();
      await page.getByRole("option", { name: /QA Core \(QA\)/ }).click();

      await editPreviewAllocation(page, item.id, seed.dev.id, seed.sprint1.id, "1");
      await editPreviewAllocation(page, item.id, seed.dev.id, seed.sprint2.id, "2");
      await editPreviewAllocation(page, item.id, seed.qa.id, seed.sprint1.id, "0");
      await editPreviewAllocation(page, item.id, seed.qa.id, seed.sprint2.id, "1");

      await expect(page.getByText("Нагрузка 4/4 дн.")).toHaveCount(0);

      await page.reload();
      await expect(page.getByTestId("planning-preview-page")).toBeVisible();
      await expect(page.getByTestId(`planning-preview-title-${item.id}`)).toContainText("Manual Preview Final");
      await expect(
        page.getByTestId(`planning-preview-allocation-${item.id}-${seed.dev.id}-${seed.sprint1.id}`)
      ).toHaveText("1");
      await expect(
        page.getByTestId(`planning-preview-allocation-${item.id}-${seed.dev.id}-${seed.sprint2.id}`)
      ).toHaveText("2");
      await expect(
        page.getByTestId(`planning-preview-allocation-${item.id}-${seed.qa.id}-${seed.sprint2.id}`)
      ).toHaveText("1");

      await page.getByTestId("planning-preview-apply").click();
      await expect(page).toHaveURL(new RegExp(`#/${escapeRegExp(teamKey)}/$`));

      const planningBacklog = await apiGet<PlanningWorkbenchItemDto[]>(
        request,
        `/${teamKey}/planning-workbench/backlog`
      );
      expect(planningBacklog).toHaveLength(0);

      const tasks = await apiGet<TaskPageDto>(request, `/${teamKey}/tasks?page=0&size=50`);
      const created = tasks.content.find((task) => task.title === "Manual Preview Final");
      expect(created).toBeTruthy();
      expect(created?.priority).toBe(1);
      expect(created?.status).toBe("done");
      expect(created?.participantIds).toEqual([seed.dev.id, seed.qa.id]);
      expect(created?.loads).toEqual({
        [seed.sprint1.id]: 1,
        [seed.sprint2.id]: 3,
      });
      expect(created?.allocations?.[seed.dev.id]).toEqual({
        [seed.sprint1.id]: 1,
        [seed.sprint2.id]: 2,
      });
      expect(created?.allocations?.[seed.qa.id]).toEqual({
        [seed.sprint2.id]: 1,
      });
    } finally {
      await cleanupTeam(request, teamKey);
    }
  });

  test("deletes team successfully even after browser requests created api history", async ({ page, request }) => {
    const teamKey = uniqueTeamKey("cleanup");

    try {
      await createTeam(request, teamKey);
      await seedSingleSprintTeam(request, teamKey, 8);

      await prepareBrowser(page);
      await page.goto(planningPath(teamKey));
      await expect(page.getByTestId("planning-backlog-count")).toBeVisible();

      const response = await request.delete(`${API_PREFIX}/teams/${teamKey}`, {
        params: { deleteData: true },
      });
      await ensureOk(response, `DELETE /teams/${teamKey}`);

      const teams = await apiGet<Array<{ key: string }>>(request, "/teams");
      expect(teams.some((team) => team.key === teamKey)).toBeFalsy();
    } finally {
      await cleanupTeam(request, teamKey);
    }
  });
});
