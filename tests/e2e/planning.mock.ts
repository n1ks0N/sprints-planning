import type { Page } from "@playwright/test";

type PlanningMockDemand = {
  kind: "ROLE" | "PARTICIPANT";
  role?: string | null;
  participantId?: string | null;
  stream?: string | null;
  days: number;
};

type PlanningMockItem = {
  id: string;
  title: string;
  description?: string;
  dod?: string;
  priority: number;
  customers?: string[];
  streams?: string[];
  estimateDays?: number;
  planningDemands?: PlanningMockDemand[];
  planningQuarterIds?: string[];
  planningSprintIds?: string[];
  loads?: Record<string, number>;
  allocations?: Record<string, Record<string, number>>;
  releaseDateId?: string | null;
  initialQuarterId?: string | null;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
};

type PlanningMockParticipant = {
  id: string;
  fullName: string;
  role?: string | null;
  rate?: number;
  displayOrder?: number;
  userStreams?: string[];
  jiraLogin?: string | null;
};

type PlanningMockQuarter = {
  id: string;
  year: number;
  number: number;
  name: string;
  startDate: string;
  endDate: string;
};

type PlanningMockSprint = {
  id: string;
  quarterId: string;
  name: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  order: number;
};

type PlanningMockRelease = {
  id: string;
  name?: string | null;
  promDate: string;
  createdAt?: string;
  updatedAt?: string;
};

type PlanningMockFilters = {
  quarters: { id: string; name: string }[];
  statuses: string[];
  priorities: number[];
  streams: string[];
  customers: string[];
  releases: { id: string; promDate: string }[];
  participantRoles: string[];
  participantStreams: string[];
};

type PlanningMockScenario = {
  teamKey: string;
  now: string;
  quarterId: string;
  quarters: PlanningMockQuarter[];
  sprints: PlanningMockSprint[];
  participants: PlanningMockParticipant[];
  releases: PlanningMockRelease[];
  filters: PlanningMockFilters;
  planningItems: PlanningMockItem[];
  committedLoad: Record<string, Record<string, number>>;
  capacities: Record<string, number>;
  backlogTasks: any[];
};

const TEAM_KEY = "customlab";
const NOW = "2026-04-17T10:00:00.000Z";

const clone = <T,>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
};

const uniqueStrings = (values: (string | null | undefined)[]) =>
  Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );

const defaultScenario: PlanningMockScenario = {
  teamKey: TEAM_KEY,
  now: NOW,
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
  ],
  sprints: [
    {
      id: "sprint-1",
      quarterId: "quarter-q2",
      name: "Sprint 1",
      startDate: "2026-04-01",
      endDate: "2026-04-14",
      workingDays: 10,
      order: 1,
    },
    {
      id: "sprint-2",
      quarterId: "quarter-q2",
      name: "Sprint 2",
      startDate: "2026-04-15",
      endDate: "2026-04-28",
      workingDays: 10,
      order: 2,
    },
  ],
  participants: [
    {
      id: "participant-1",
      fullName: "Иван Иванов",
      role: "Backend",
      rate: 100,
      displayOrder: 1,
      userStreams: ["Core"],
      jiraLogin: "ivanov",
    },
    {
      id: "participant-2",
      fullName: "Мария Петрова",
      role: "QA",
      rate: 100,
      displayOrder: 2,
      userStreams: ["Mobile"],
      jiraLogin: "petrova",
    },
  ],
  releases: [
    {
      id: "release-1",
      name: "Release 1",
      promDate: "2026-06-30",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  filters: {
    quarters: [{ id: "quarter-q2", name: "Q2 2026" }],
    statuses: ["backlog", "inprogress", "done", "notdone", "canceled", "partial"],
    priorities: [1, 2, 3],
    streams: ["Core", "Mobile"],
    customers: ["Acme", "Beta"],
    releases: [{ id: "release-1", promDate: "2026-06-30" }],
    participantRoles: ["Backend", "QA"],
    participantStreams: ["Core", "Mobile"],
  },
  planningItems: [
    {
      id: "item-1",
      title: "Task Alpha",
      description: "Первый элемент планирования",
      dod: "DoD Alpha",
      priority: 1,
      customers: ["Acme"],
      streams: ["Core"],
      estimateDays: 3,
      planningDemands: [
        {
          kind: "ROLE",
          role: "Backend",
          participantId: null,
          stream: "Core",
          days: 3,
        },
      ],
      planningQuarterIds: ["quarter-q2"],
      planningSprintIds: [],
      loads: {},
      allocations: {},
      releaseDateId: "release-1",
      initialQuarterId: "quarter-q2",
      order: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "item-2",
      title: "Task Beta",
      description: "Второй элемент планирования",
      dod: "DoD Beta",
      priority: 2,
      customers: ["Beta"],
      streams: ["Mobile"],
      estimateDays: 2,
      planningDemands: [
        {
          kind: "PARTICIPANT",
          role: null,
          participantId: "participant-2",
          stream: "Mobile",
          days: 2,
        },
      ],
      planningQuarterIds: ["quarter-q2"],
      planningSprintIds: [],
      loads: {},
      allocations: {},
      releaseDateId: "release-1",
      initialQuarterId: "quarter-q2",
      order: 2,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  committedLoad: {
    "participant-1": {
      "sprint-1": 1,
      "sprint-2": 0,
    },
    "participant-2": {
      "sprint-1": 0,
      "sprint-2": 1,
    },
  },
  capacities: {
    "participant-1": 5,
    "participant-2": 5,
  },
  backlogTasks: [],
};

const deriveFilters = (scenario: PlanningMockScenario): PlanningMockFilters => ({
  quarters: scenario.quarters.map((quarter) => ({ id: quarter.id, name: quarter.name })),
  statuses: ["backlog", "inprogress", "done", "notdone", "canceled", "partial"],
  priorities: [1, 2, 3],
  streams: uniqueStrings([
    ...scenario.planningItems.flatMap((item) => item.streams || []),
    ...scenario.participants.flatMap((participant) => participant.userStreams || []),
  ]),
  customers: uniqueStrings(scenario.planningItems.flatMap((item) => item.customers || [])),
  releases: scenario.releases.map((release) => ({ id: release.id, promDate: release.promDate })),
  participantRoles: uniqueStrings(scenario.participants.map((participant) => participant.role)),
  participantStreams: uniqueStrings(scenario.participants.flatMap((participant) => participant.userStreams || [])),
});

export const buildPlanningScenario = (
  overrides: Partial<PlanningMockScenario> = {}
): PlanningMockScenario => {
  const scenario: PlanningMockScenario = {
    ...clone(defaultScenario),
    ...clone(overrides),
    filters: clone(defaultScenario.filters),
    backlogTasks: clone(overrides.backlogTasks ?? defaultScenario.backlogTasks),
  };

  scenario.teamKey = (overrides.teamKey || defaultScenario.teamKey).toLowerCase();
  scenario.now = overrides.now || defaultScenario.now;
  scenario.quarterId = overrides.quarterId || scenario.quarters[0]?.id || defaultScenario.quarterId;
  scenario.quarters = clone(overrides.quarters ?? defaultScenario.quarters);
  scenario.sprints = clone(overrides.sprints ?? defaultScenario.sprints);
  scenario.participants = clone(overrides.participants ?? defaultScenario.participants);
  scenario.releases = clone(overrides.releases ?? defaultScenario.releases);
  scenario.planningItems = clone(overrides.planningItems ?? defaultScenario.planningItems);
  scenario.committedLoad = clone(overrides.committedLoad ?? defaultScenario.committedLoad);
  scenario.capacities = clone(overrides.capacities ?? defaultScenario.capacities);

  const derivedFilters = deriveFilters(scenario);
  scenario.filters = {
    ...derivedFilters,
    ...(clone(overrides.filters) || {}),
  };

  return scenario;
};

export const installPlanningApiMocks = async (
  page: Page,
  overrides: Partial<PlanningMockScenario> = {}
) => {
  const scenario = buildPlanningScenario(overrides);
  await page.addInitScript((mockScenario) => {
    const cloneValue = (value: any) => {
      if (value === undefined || value === null) {
        return value;
      }
      return JSON.parse(JSON.stringify(value));
    };
    const whole = (value: any) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return 0;
      return Math.max(0, Math.round(numeric));
    };
    const sumDemandDays = (item: any) =>
      (item.planningDemands || []).reduce((sum: number, demand: any) => sum + whole(demand.days), 0);
    const sumDraftBySprint = (allocations: Record<string, Record<string, number>>) => {
      const result: Record<string, number> = {};
      Object.values(allocations || {}).forEach((row) => {
        Object.entries(row || {}).forEach(([sprintId, days]) => {
          const nextDays = whole(days);
          if (nextDays <= 0) return;
          result[sprintId] = (result[sprintId] || 0) + nextDays;
        });
      });
      return result;
    };
    const orderedSprints = [...mockScenario.sprints].sort(
      (left, right) =>
        Number(left.order || 0) - Number(right.order || 0)
        || String(left.startDate || "").localeCompare(String(right.startDate || ""))
        || String(left.id || "").localeCompare(String(right.id || ""))
    );
    const orderedParticipants = [...mockScenario.participants].sort(
      (left, right) =>
        Number(left.displayOrder || 0) - Number(right.displayOrder || 0)
        || String(left.fullName || "").localeCompare(String(right.fullName || ""), "ru")
    );
    const sprintsById = Object.fromEntries(orderedSprints.map((sprint: any) => [sprint.id, sprint]));

    const state = {
      planningItems: cloneValue(mockScenario.planningItems),
      backlogTasks: cloneValue(mockScenario.backlogTasks || []),
      lastPreviewItemIds: [] as string[],
      lastPreviewResponse: null as any,
      lastApplyBody: null as any,
      lastApplyResponse: null as any,
      nextPlanningItemId:
        Math.max(
          0,
          ...cloneValue(mockScenario.planningItems).map((item: any) => {
            const match = String(item.id || "").match(/item-(\d+)$/);
            return match ? Number(match[1]) : 0;
          })
        ) + 1,
      requestUrls: [] as string[],
      handledBacklogRequests: 0,
      pageErrors: [] as string[],
    };

    (window as any).__planningMockState = state;

    window.localStorage.setItem("sprints-planning-user-name", "E2E User");
    window.localStorage.setItem(
      `planning-workbench-initial-quarter:${mockScenario.teamKey}`,
      mockScenario.quarterId
    );

    window.addEventListener("error", (event) => {
      state.pageErrors.push(String(event.error || event.message || "window error"));
    });
    window.addEventListener("unhandledrejection", (event) => {
      state.pageErrors.push(String(event.reason || "unhandled rejection"));
    });

    const resolveAllowedSprintIds = (item: any) => {
      const explicitSprintIds = (item.planningSprintIds || []).filter((value: any) => Boolean(value));
      if (explicitSprintIds.length > 0) {
        return orderedSprints.filter((sprint: any) => explicitSprintIds.includes(sprint.id)).map((sprint: any) => sprint.id);
      }
      const quarterIds = (item.planningQuarterIds || []).filter((value: any) => Boolean(value));
      if (quarterIds.length > 0) {
        return orderedSprints.filter((sprint: any) => quarterIds.includes(sprint.quarterId)).map((sprint: any) => sprint.id);
      }
      if (item.initialQuarterId) {
        return orderedSprints
          .filter((sprint: any) => sprint.quarterId === item.initialQuarterId)
          .map((sprint: any) => sprint.id);
      }
      return [];
    };

    const resolveCandidates = (demand: any) => {
      if (demand.kind === "PARTICIPANT") {
        return orderedParticipants.filter((participant: any) => {
          if (participant.id !== demand.participantId) return false;
          if (!demand.stream) return true;
          return (participant.userStreams || []).includes(demand.stream);
        });
      }

      return orderedParticipants.filter((participant: any) => {
        if (demand.role && participant.role !== demand.role) return false;
        if (!demand.stream) return true;
        return (participant.userStreams || []).includes(demand.stream);
      });
    };

    const buildPreview = (itemIds: string[]) => {
      const warnings: string[] = [];
      const remainingCapacity: Record<string, Record<string, number>> = {};
      const draftLoadByParticipantAndSprint: Record<string, Record<string, number>> = {};

      orderedParticipants.forEach((participant: any) => {
        remainingCapacity[participant.id] = {};
        draftLoadByParticipantAndSprint[participant.id] = {};
        orderedSprints.forEach((sprint: any) => {
          const committed = whole(mockScenario.committedLoad?.[participant.id]?.[sprint.id] || 0);
          const capacity = whole(mockScenario.capacities?.[participant.id] ?? sprint.workingDays ?? 0);
          remainingCapacity[participant.id][sprint.id] = Math.max(0, capacity - committed);
          draftLoadByParticipantAndSprint[participant.id][sprint.id] = 0;
        });
      });

      const selectedSourceItems = state.planningItems.filter((item: any) => itemIds.includes(item.id));
      const selectedSorted = [...selectedSourceItems].sort(
        (left: any, right: any) =>
          Number(left.priority || 0) - Number(right.priority || 0)
          || Number(left.order || 0) - Number(right.order || 0)
          || String(left.id || "").localeCompare(String(right.id || ""))
      );
      const previewById = new Map<string, any>();

      selectedSorted.forEach((sourceItem: any) => {
        const item = {
          ...cloneValue(sourceItem),
          estimateDays: sumDemandDays(sourceItem),
          allocations: {} as Record<string, Record<string, number>>,
          loads: {} as Record<string, number>,
        };
        const allowedSprintIds = resolveAllowedSprintIds(sourceItem);
        const allowedSprints = allowedSprintIds.map((sprintId: string) => sprintsById[sprintId]).filter(Boolean);

        if (item.estimateDays > 0 && allowedSprints.length === 0) {
          warnings.push(`Задача '${item.title}' не имеет доступных спринтов`);
          previewById.set(item.id, item);
          return;
        }

        (sourceItem.planningDemands || []).forEach((rawDemand: any) => {
          const demand = {
            ...rawDemand,
            days: whole(rawDemand.days),
          };
          if (demand.days <= 0) return;

          const candidates = resolveCandidates(demand);
          if (candidates.length === 0) {
            warnings.push(
              demand.kind === "PARTICIPANT"
                ? `Задача '${item.title}' не имеет доступных участников`
                : `Задача '${item.title}' не имеет доступных участников по роли/стриму`
            );
            return;
          }

          let unplannedDays = 0;
          for (let dayIndex = 0; dayIndex < demand.days; dayIndex += 1) {
            let chosen: { participantId: string; sprintId: string } | null = null;

            for (const sprint of allowedSprints) {
              const candidateOrder = [...candidates].sort((left: any, right: any) => {
                const leftSprintLoad = whole(mockScenario.committedLoad?.[left.id]?.[sprint.id] || 0)
                  + whole(draftLoadByParticipantAndSprint[left.id]?.[sprint.id] || 0);
                const rightSprintLoad = whole(mockScenario.committedLoad?.[right.id]?.[sprint.id] || 0)
                  + whole(draftLoadByParticipantAndSprint[right.id]?.[sprint.id] || 0);
                if (leftSprintLoad !== rightSprintLoad) return leftSprintLoad - rightSprintLoad;

                const leftTotalLoad = allowedSprints.reduce(
                  (sum: number, currentSprint: any) =>
                    sum
                    + whole(mockScenario.committedLoad?.[left.id]?.[currentSprint.id] || 0)
                    + whole(draftLoadByParticipantAndSprint[left.id]?.[currentSprint.id] || 0),
                  0
                );
                const rightTotalLoad = allowedSprints.reduce(
                  (sum: number, currentSprint: any) =>
                    sum
                    + whole(mockScenario.committedLoad?.[right.id]?.[currentSprint.id] || 0)
                    + whole(draftLoadByParticipantAndSprint[right.id]?.[currentSprint.id] || 0),
                  0
                );
                if (leftTotalLoad !== rightTotalLoad) return leftTotalLoad - rightTotalLoad;

                const leftRemaining = whole(remainingCapacity[left.id]?.[sprint.id] || 0);
                const rightRemaining = whole(remainingCapacity[right.id]?.[sprint.id] || 0);
                if (leftRemaining !== rightRemaining) return rightRemaining - leftRemaining;

                return Number(left.displayOrder || 0) - Number(right.displayOrder || 0)
                  || String(left.fullName || "").localeCompare(String(right.fullName || ""), "ru");
              });

              for (const candidate of candidateOrder) {
                if (whole(remainingCapacity[candidate.id]?.[sprint.id] || 0) <= 0) continue;
                chosen = {
                  participantId: candidate.id,
                  sprintId: sprint.id,
                };
                break;
              }

              if (chosen) break;
            }

            if (!chosen) {
              unplannedDays += 1;
              continue;
            }

            item.allocations[chosen.participantId] ??= {};
            item.allocations[chosen.participantId][chosen.sprintId] =
              whole(item.allocations[chosen.participantId][chosen.sprintId] || 0) + 1;
            remainingCapacity[chosen.participantId][chosen.sprintId] =
              whole(remainingCapacity[chosen.participantId][chosen.sprintId] || 0) - 1;
            draftLoadByParticipantAndSprint[chosen.participantId][chosen.sprintId] =
              whole(draftLoadByParticipantAndSprint[chosen.participantId][chosen.sprintId] || 0) + 1;
          }

          if (unplannedDays > 0) {
            warnings.push(`Задача '${item.title}' не распределена полностью: ${unplannedDays} дн.`);
          }
        });

        item.loads = sumDraftBySprint(item.allocations || {});
        previewById.set(item.id, item);
      });

      const previewItems = selectedSourceItems.map((item: any) => previewById.get(item.id) || {
        ...cloneValue(item),
        estimateDays: sumDemandDays(item),
        allocations: {},
        loads: {},
      });

      const participantSummary = orderedParticipants.map((participant: any) => {
        const cells = orderedSprints.map((sprint: any) => {
          const committed = whole(mockScenario.committedLoad?.[participant.id]?.[sprint.id] || 0);
          const draft = previewItems.reduce(
            (sum: number, item: any) => sum + whole(item.allocations?.[participant.id]?.[sprint.id] || 0),
            0
          );
          const capacity = whole(mockScenario.capacities?.[participant.id] ?? sprint.workingDays ?? 0);
          const total = committed + draft;
          const overload = Math.max(0, total - capacity);
          const free = Math.max(0, capacity - total);
          return {
            participantId: participant.id,
            sprintId: sprint.id,
            capacity,
            committed,
            draft,
            total,
            overload,
            free,
            availableDays: capacity,
            workloadDays: total,
            capacityFactor: 0.85,
          };
        });

        return {
          participant,
          cells,
          totalCapacity: cells.reduce((sum: number, cell: any) => sum + cell.capacity, 0),
          totalCommitted: cells.reduce((sum: number, cell: any) => sum + cell.committed, 0),
          totalDraft: cells.reduce((sum: number, cell: any) => sum + cell.draft, 0),
          totalLoad: cells.reduce((sum: number, cell: any) => sum + cell.total, 0),
          totalOverload: cells.reduce((sum: number, cell: any) => sum + cell.overload, 0),
          totalFree: cells.reduce((sum: number, cell: any) => sum + cell.free, 0),
        };
      });

      const plannedDays = previewItems.reduce(
        (sum: number, item: any) => sum + Object.values(item.loads || {}).reduce((acc: number, days: any) => acc + whole(days), 0),
        0
      );
      const estimateDays = previewItems.reduce((sum: number, item: any) => sum + whole(item.estimateDays || 0), 0);
      const unplannedDays = Math.max(0, estimateDays - plannedDays);
      const uniqueWarnings = Array.from(new Set(warnings));
      if (uniqueWarnings.length === 0 && unplannedDays > 0) {
        uniqueWarnings.push("Не все дни распределены. Проверьте выбранные задачи и ограничения.");
      }

      return {
        selectedItemIds: itemIds,
        sprintIds: orderedSprints.map((sprint: any) => sprint.id),
        summary: {
          taskCount: previewItems.length,
          participantCount: participantSummary.filter((row: any) => row.totalDraft > 0).length,
          plannedDays,
          unplannedDays,
          overloadedCells: participantSummary.reduce(
            (sum: number, row: any) => sum + row.cells.filter((cell: any) => whole(cell.overload) > 0).length,
            0
          ),
        },
        warnings: uniqueWarnings,
        items: previewItems,
        participantSummary,
        canApply: previewItems.length > 0 && unplannedDays === 0 && uniqueWarnings.length === 0,
      };
    };

    const deriveAppliedQuarterIds = (item: any, allocations: Record<string, Record<string, number>>) => {
      const explicitQuarterIds = (item.planningQuarterIds || []).filter((value: any) => Boolean(value));
      if (explicitQuarterIds.length > 0) {
        return explicitQuarterIds;
      }
      const quarterIds = new Set<string>();
      Object.values(allocations || {}).forEach((row: any) => {
        Object.entries(row || {}).forEach(([sprintId, days]) => {
          if (whole(days) <= 0) return;
          const sprint = sprintsById[sprintId];
          if (sprint?.quarterId) {
            quarterIds.add(sprint.quarterId);
          }
        });
      });
      if (quarterIds.size > 0) {
        return Array.from(quarterIds);
      }
      return item.initialQuarterId ? [item.initialQuarterId] : [];
    };

    const createBacklogTaskFromApply = (item: any, patch: any, allocations: Record<string, Record<string, number>>) => {
      const merged = {
        ...item,
        ...(patch || {}),
      };
      const mergedPlanningDemands = cloneValue(merged.planningDemands || []);
      const hasRoleDemand = mergedPlanningDemands.some((demand: any) => demand?.kind === "ROLE");
      const materializedPlanningDemands = hasRoleDemand
        ? Object.entries(allocations || {}).flatMap(([participantId, sprintRows]) => {
            const totalDays = Object.values(sprintRows || {}).reduce(
              (sum: number, days: any) => sum + whole(days),
              0
            );
            if (totalDays <= 0) return [];
            const explicitParticipantDemand = mergedPlanningDemands.find(
              (demand: any) => demand?.kind === "PARTICIPANT" && demand?.participantId === participantId
            );
            const roleStreams = uniqueStrings(
              mergedPlanningDemands
                .filter((demand: any) => demand?.kind === "ROLE")
                .map((demand: any) => demand?.stream)
            );
            return [
              {
                kind: "PARTICIPANT",
                role: null,
                participantId,
                stream: explicitParticipantDemand?.stream ?? (roleStreams.length === 1 ? roleStreams[0] : null),
                days: totalDays,
              },
            ];
          })
        : mergedPlanningDemands;
      const participantIds = Array.from(
        new Set([
          ...Object.keys(allocations || {}),
          ...((patch?.participantIds as string[] | undefined) || []),
          ...materializedPlanningDemands
            .filter((demand: any) => demand.kind === "PARTICIPANT" && demand.participantId)
            .map((demand: any) => String(demand.participantId)),
        ])
      );
      const loads = sumDraftBySprint(allocations);
      return {
        id: `task-${item.id}`,
        title: merged.title,
        description: merged.description || "",
        dod: merged.dod || "",
        priority: merged.priority,
        status: merged.status || (Object.keys(loads).length > 0 ? "inprogress" : "backlog"),
        customers: cloneValue(merged.customers || []),
        streams: cloneValue(merged.streams || []),
        participantIds,
        estimateDays: sumDemandDays(merged),
        planningDemands: materializedPlanningDemands,
        planningQuarterIds: deriveAppliedQuarterIds(merged, allocations),
        planningSprintIds: cloneValue(merged.planningSprintIds || []),
        loads,
        allocations: cloneValue(allocations || {}),
        notes: cloneValue(merged.notes || {}),
        jiraIssues: {},
        quarterIds: deriveAppliedQuarterIds(merged, allocations),
        releaseDateId: merged.releaseDateId ?? null,
        initialQuarterId: merged.initialQuarterId ?? null,
        leaderId: merged.leaderId ?? null,
        order: merged.order ?? item.order,
        createdAt: mockScenario.now,
        updatedAt: mockScenario.now,
      };
    };

    const buildPage = (content: any[], page = 0, size = content.length || 1) => {
      const safePage = Math.max(0, page);
      const safeSize = Math.max(1, size);
      const start = safePage * safeSize;
      const pageContent = content.slice(start, start + safeSize);
      const totalPages = Math.max(1, Math.ceil(content.length / safeSize));
      return {
        content: pageContent,
        page: {
          size: safeSize,
          number: safePage,
          totalElements: content.length,
          totalPages,
        },
        numberOfElements: pageContent.length,
        first: safePage === 0,
        last: safePage + 1 >= totalPages,
        empty: pageContent.length === 0,
        _links: {},
      };
    };

    const parseBody = async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = init?.body;
      if (typeof raw === "string" && raw.length > 0) {
        return JSON.parse(raw);
      }
      if (raw instanceof URLSearchParams) {
        return Object.fromEntries(raw.entries());
      }
      if (!(input instanceof URL) && typeof input !== "string") {
        const text = await input.clone().text();
        if (text) {
          return JSON.parse(text);
        }
      }
      return null;
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method =
        (init?.method || (!(input instanceof URL) && typeof input !== "string" ? input.method : undefined) || "GET").toUpperCase();

      if (!requestUrl.includes("/sprints-planning")) {
        return originalFetch(input, init);
      }

      const url = new URL(requestUrl, window.location.origin);
      const apiMarker = "/sprints-planning";
      const markerIndex = url.pathname.indexOf(apiMarker);
      const pathname = markerIndex >= 0 ? url.pathname.slice(markerIndex + apiMarker.length) : url.pathname;
      state.requestUrls.push(`${method} ${pathname}`);

      const respond = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
          status,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        });

      if (pathname === "/teams" && method === "GET") {
        return respond([{ key: mockScenario.teamKey, name: "CustomLab" }]);
      }
      if (pathname === `/${mockScenario.teamKey}/quarters` && method === "GET") {
        return respond(mockScenario.quarters);
      }
      if (pathname === `/${mockScenario.teamKey}/sprints` && method === "GET") {
        return respond(mockScenario.sprints);
      }
      if (pathname === `/${mockScenario.teamKey}/participants` && method === "GET") {
        return respond(mockScenario.participants);
      }
      if (pathname === `/${mockScenario.teamKey}/releases` && method === "GET") {
        return respond(mockScenario.releases);
      }
      if (pathname === `/${mockScenario.teamKey}/filters` && method === "GET") {
        return respond(mockScenario.filters);
      }
      if (pathname === `/${mockScenario.teamKey}/planning-workbench/backlog` && method === "GET") {
        state.handledBacklogRequests += 1;
        const splitParam = (name: string) =>
          (url.searchParams.get(name) || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
        const selectedQuarterIds = new Set(splitParam("quarterIds"));
        const selectedPriorities = new Set(splitParam("priority"));
        const selectedStreams = new Set(splitParam("streams"));
        const selectedCustomers = new Set(splitParam("customers"));
        const releaseDateId = (url.searchParams.get("releaseDateId") || "").trim();
        const search = (url.searchParams.get("search") || "").trim().toLowerCase();
        const includeWithoutStream = url.searchParams.get("withoutStream") === "true";
        const includeWithoutCustomer = url.searchParams.get("withoutCustomer") === "true";
        const releasePromDateById = new Map(mockScenario.releases.map((release: any) => [release.id, release.promDate || ""]));
        const quarterBySprintId = new Map(mockScenario.sprints.map((sprint: any) => [sprint.id, sprint.quarterId]));
        const itemQuarterIds = (item: any) => {
          const ids = new Set<string>();
          (item.planningQuarterIds || []).forEach((id: string) => id && ids.add(id));
          (item.planningSprintIds || []).forEach((id: string) => {
            const quarterId = quarterBySprintId.get(id);
            if (quarterId) ids.add(String(quarterId));
          });
          if (ids.size === 0 && item.initialQuarterId) ids.add(item.initialQuarterId);
          return ids;
        };
        const itemLoad = (item: any) =>
          (item.planningDemands || []).reduce((sum: number, demand: any) => sum + Number(demand.days || 0), 0);
        const matchesCollection = (itemValues: string[] = [], selectedValues: Set<string>, includeEmpty: boolean) => {
          if (itemValues.length === 0) return includeEmpty;
          if (selectedValues.size === 0) return false;
          return itemValues.some((value) => selectedValues.has(value));
        };
        const sortBy = (url.searchParams.get("sortBy") || "manual").trim();
        const sortDirection = (url.searchParams.get("sortDirection") || "asc").trim() === "desc" ? -1 : 1;
        const ordered = [...state.planningItems]
          .filter((item: any) => {
            if (selectedQuarterIds.size > 0 && !Array.from(itemQuarterIds(item)).some((id) => selectedQuarterIds.has(id))) {
              return false;
            }
            if (selectedPriorities.size > 0 && !selectedPriorities.has(String(item.priority))) {
              return false;
            }
            if (releaseDateId && item.releaseDateId !== releaseDateId) {
              return false;
            }
            if ((selectedStreams.size > 0 || includeWithoutStream) && !matchesCollection(item.streams || [], selectedStreams, includeWithoutStream)) {
              return false;
            }
            if ((selectedCustomers.size > 0 || includeWithoutCustomer) && !matchesCollection(item.customers || [], selectedCustomers, includeWithoutCustomer)) {
              return false;
            }
            if (search) {
              const haystack = `${item.title || ""} ${item.description || ""} ${item.dod || ""}`.toLowerCase();
              if (!haystack.includes(search)) return false;
            }
            return true;
          })
          .sort((a: any, b: any) => {
            let result = 0;
            if (sortBy === "load") {
              result = itemLoad(a) - itemLoad(b);
            } else if (sortBy === "releaseDate") {
              result = String(releasePromDateById.get(a.releaseDateId) || "").localeCompare(String(releasePromDateById.get(b.releaseDateId) || ""));
            } else if (sortBy === "priority") {
              result = Number(a.priority || 0) - Number(b.priority || 0);
            } else {
              result = Number(a.order || 0) - Number(b.order || 0);
            }
            if (result !== 0) return result * sortDirection;
            return Number(a.order || 0) - Number(b.order || 0);
          });
        const page = Number(url.searchParams.get("page") || 0);
        const size = Number(url.searchParams.get("size") || ordered.length || 1);
        return respond(buildPage(ordered, page, size));
      }
      if (pathname === `/${mockScenario.teamKey}/planning-workbench/items` && method === "POST") {
        const body = (await parseBody(input, init)) || {};
        const nextItem = {
          id: `item-${state.nextPlanningItemId}`,
          title: body.title,
          description: body.description || "",
          dod: body.dod || "",
          priority: body.priority || 1,
          customers: cloneValue(body.customers || []),
          streams: cloneValue(body.streams || []),
          estimateDays: (body.planningDemands || []).reduce((sum: number, demand: any) => sum + whole(demand.days || 0), 0),
          planningDemands: cloneValue(body.planningDemands || []),
          planningQuarterIds: cloneValue(body.planningQuarterIds || []),
          planningSprintIds: cloneValue(body.planningSprintIds || []),
          loads: {},
          allocations: {},
          releaseDateId: body.releaseDateId ?? null,
          initialQuarterId: body.initialQuarterId ?? null,
          order: state.nextPlanningItemId,
          createdAt: mockScenario.now,
          updatedAt: mockScenario.now,
        };
        state.nextPlanningItemId += 1;
        state.planningItems.push(nextItem);
        return respond(nextItem);
      }

      const itemMatch = pathname.match(/\/planning-workbench\/items\/([^/]+)$/);
      if (itemMatch && method === "PUT") {
        const itemId = itemMatch[1];
        const body = (await parseBody(input, init)) || {};
        const item = state.planningItems.find((candidate: any) => candidate.id === itemId);
        if (!item) {
          return respond({ message: "Not found" }, 404);
        }
        Object.assign(item, {
          ...body,
          estimateDays: (body.planningDemands || []).reduce((sum: number, demand: any) => sum + whole(demand.days || 0), 0),
          updatedAt: mockScenario.now,
        });
        return respond(item);
      }
      if (itemMatch && method === "DELETE") {
        const itemId = itemMatch[1];
        state.planningItems = state.planningItems.filter((item: any) => item.id !== itemId);
        return respond(null);
      }
      if (pathname === `/${mockScenario.teamKey}/planning-workbench/preview` && method === "POST") {
        const body = (await parseBody(input, init)) || {};
        state.lastPreviewItemIds = cloneValue(body.itemIds || []);
        state.lastPreviewResponse = buildPreview(body.itemIds || []);
        return respond(state.lastPreviewResponse);
      }
      if (pathname === `/${mockScenario.teamKey}/planning-workbench/apply` && method === "POST") {
        const body = (await parseBody(input, init)) || {};
        state.lastApplyBody = cloneValue(body);
        const itemIds = body.itemIds || [];
        const selectedItems = state.planningItems.filter((item: any) => itemIds.includes(item.id));
        const createdTasks = selectedItems.map((item: any) =>
          createBacklogTaskFromApply(item, body.itemPatches?.[item.id], cloneValue(body.allocations?.[item.id] || {}))
        );
        state.lastApplyResponse = cloneValue(createdTasks);
        state.backlogTasks.push(...createdTasks);
        state.planningItems = state.planningItems.filter((item: any) => !itemIds.includes(item.id));
        return respond(createdTasks);
      }
      if (pathname === `/${mockScenario.teamKey}/tasks` && method === "GET") {
        return respond(buildPage(state.backlogTasks));
      }

      return respond({ message: `Unexpected mocked request: ${method} ${pathname}` }, 500);
    };
  }, scenario);
};

export const readPlanningMockState = async (page: Page) =>
  page.evaluate(() => (window as any).__planningMockState);

export const urls = {
  planning: `/#/${TEAM_KEY}/planning`,
  planningPreview: `/#/${TEAM_KEY}/planning/review`,
  backlog: `/#/${TEAM_KEY}/`,
};
