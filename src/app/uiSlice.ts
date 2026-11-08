import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { TaskStatus } from "../types";

export type UIState = {
  taskLists: Record<string, UIState["backlog"]>;
  todo: UIState["backlog"];
  backlog: {
    quarterId: string; // "all" | qid
    selectedQuarterIds: string[];
    withoutQuarterFilter: boolean;
    withoutStreamFilter: boolean;
    withoutCustomerFilter: boolean;
    releaseFilters: string[]; // ISO PROM dates; legacy release IDs are resolved by the filter
    priorityFilter: number[]; // [1,2,3]
    streamFilter: string[]; // multi-select
    customerFilter: string[]; // multi-select
    statusFilter: TaskStatus[];
    searchQuery: string;
    tasksPageSize: string;
    hideAllParticipants: boolean;
    sortBy: "manual" | "load" | "releaseDate" | "priority";
    sortDirection: "asc" | "desc";
  };
  capacity: {
    selectedQuarterIds: string[];
    selectedParticipantIds: string[];
    rolesFilter: string[];
    userStreamsFilter: string[];
  };
  team: {
    filterRoles: string[];
    filterRates: string[]; // строки "1.00", "0.75" и т.п.
    filterUserStreams: string[];
  };
  time: {
    selectedQuarterIds: string[];
  };
  participantWorkload: {
    selectedQuarterIds: string[];
    selectedParticipantIds: string[];
    rolesFilter: string[];
    userStreamsFilter: string[];
    priorityFilter: number[]; // [1,2,3]
    taskStreamFilter: string;
  };
};

const STORAGE_KEY = "uiState_v1";

const BACKLOG_PRIORITIES = new Set([1, 2, 3]);
const BACKLOG_STATUSES: TaskStatus[] = [
  "inprogress",
  "done",
  "canceled",
  "backlog",
];

function defaultState(): UIState {
  return {
    taskLists: {},
    todo: { quarterId: "all", selectedQuarterIds: [], withoutQuarterFilter: false, withoutStreamFilter: false,
      withoutCustomerFilter: false, releaseFilters: [], priorityFilter: [], streamFilter: [], customerFilter: [],
      statusFilter: [], searchQuery: "", tasksPageSize: "20", hideAllParticipants: false, sortBy: "manual", sortDirection: "asc" },
    backlog: {
      quarterId: "all",
      selectedQuarterIds: [],
      withoutQuarterFilter: false,
      withoutStreamFilter: false,
      withoutCustomerFilter: false,
      releaseFilters: [],
      priorityFilter: [],
      streamFilter: [],
      customerFilter: [],
      statusFilter: [],
      searchQuery: "",
      tasksPageSize: "20",
      hideAllParticipants: false,
      sortBy: "manual",
      sortDirection: "asc",
    },
    capacity: {
      selectedQuarterIds: [],
      selectedParticipantIds: [],
      rolesFilter: [],
      userStreamsFilter: [],
    },
    team: { filterRoles: [], filterRates: [], filterUserStreams: [] },
    time: { selectedQuarterIds: [] },
    participantWorkload: {
      selectedQuarterIds: [],
      selectedParticipantIds: [],
      rolesFilter: [],
      userStreamsFilter: [],
      priorityFilter: [1, 2, 3],
      taskStreamFilter: "",
    },
  };
}

function reuseArray<T>(next: T[], previous: T[]) {
  return next.length === previous.length && next.every((value, index) => value === previous[index]) ? previous : next;
}

function sanitizeBacklog(
  input: any,
  defaults: UIState["backlog"]
): UIState["backlog"] {
  const priorityFilter = Array.isArray(input?.priorityFilter)
    ? input.priorityFilter
        .map((v: any) => Number(v))
        .filter((n: number) => BACKLOG_PRIORITIES.has(n))
    : defaults.priorityFilter.slice();

  const statusFilter = Array.isArray(input?.statusFilter)
    ? Array.from(new Set(input.statusFilter.map((s: string) => s === "notdone" ? "canceled" : s === "partial" ? "done" : s))).filter((s: any): s is TaskStatus =>
        typeof s === "string" ? BACKLOG_STATUSES.includes(s as TaskStatus) : false
      )
    : defaults.statusFilter.slice();
  const tasksPageSize =
    typeof input?.tasksPageSize === "string"
      ? input.tasksPageSize
      : defaults.tasksPageSize;

  const streamFilter = Array.isArray(input?.streamFilter)
    ? input.streamFilter.filter((s: any): s is string => typeof s === "string")
    : typeof input?.streamFilter === "string" && input.streamFilter
    ? [input.streamFilter]
    : defaults.streamFilter.slice();

  const customerFilter = Array.isArray(input?.customerFilter)
    ? input.customerFilter.filter((s: any): s is string => typeof s === "string")
    : defaults.customerFilter.slice();

  const selectedQuarterIds = Array.isArray(input?.selectedQuarterIds)
    ? input.selectedQuarterIds.filter(
        (id: any): id is string => typeof id === "string"
      )
    : typeof input?.quarterId === "string" && input.quarterId !== "all"
    ? [input.quarterId]
    : defaults.selectedQuarterIds.slice();

  return {
    quarterId:
      typeof input?.quarterId === "string"
        ? input.quarterId
        : defaults.quarterId,
    releaseFilters: reuseArray(Array.isArray(input?.releaseFilters)
      ? [...new Set<string>(input.releaseFilters.filter((v: unknown): v is string => typeof v === "string" && !!v.trim()))]
      : typeof input?.releaseSprintFilter === "string" && input.releaseSprintFilter && input.releaseSprintFilter !== "all"
      ? [input.releaseSprintFilter] : defaults.releaseFilters.slice(), defaults.releaseFilters),
    withoutQuarterFilter:
      typeof input?.withoutQuarterFilter === "boolean"
        ? input.withoutQuarterFilter
        : defaults.withoutQuarterFilter,
    withoutStreamFilter:
      typeof input?.withoutStreamFilter === "boolean"
        ? input.withoutStreamFilter
        : defaults.withoutStreamFilter,
    withoutCustomerFilter:
      typeof input?.withoutCustomerFilter === "boolean"
        ? input.withoutCustomerFilter
        : defaults.withoutCustomerFilter,
    priorityFilter: reuseArray(priorityFilter, defaults.priorityFilter),
    streamFilter: reuseArray(streamFilter, defaults.streamFilter),
    customerFilter: reuseArray(customerFilter, defaults.customerFilter),
    statusFilter: reuseArray(statusFilter, defaults.statusFilter),
    searchQuery:
      typeof input?.searchQuery === "string"
        ? input.searchQuery
        : defaults.searchQuery,
    tasksPageSize,
    selectedQuarterIds: reuseArray(selectedQuarterIds, defaults.selectedQuarterIds),
    hideAllParticipants:
      typeof input?.hideAllParticipants === "boolean"
        ? input.hideAllParticipants
        : defaults.hideAllParticipants,
    sortBy:
      input?.sortBy === "load" ||
      input?.sortBy === "releaseDate" ||
      input?.sortBy === "priority" ||
      input?.sortBy === "manual"
        ? input.sortBy
        : defaults.sortBy,
    sortDirection:
      input?.sortDirection === "desc" || input?.sortDirection === "asc"
        ? input.sortDirection
        : defaults.sortDirection,
  };
}

function sanitizeTeam(
  input: any,
  defaults: UIState["team"]
): UIState["team"] {
  return {
    filterRoles: Array.isArray(input?.filterRoles)
      ? input.filterRoles.filter((s: any): s is string => typeof s === "string")
      : defaults.filterRoles.slice(),
    filterRates: Array.isArray(input?.filterRates)
      ? input.filterRates.filter((s: any): s is string => typeof s === "string")
      : defaults.filterRates.slice(),
    filterUserStreams: Array.isArray(input?.filterUserStreams)
      ? input.filterUserStreams.filter(
          (s: any): s is string => typeof s === "string"
        )
      : defaults.filterUserStreams.slice(),
  };
}

function sanitizeCapacity(
  input: any,
  defaults: UIState["capacity"]
): UIState["capacity"] {
  return {
    selectedQuarterIds: Array.isArray(input?.selectedQuarterIds)
      ? input.selectedQuarterIds.filter(
          (id: any): id is string => typeof id === "string"
        )
      : defaults.selectedQuarterIds.slice(),
    selectedParticipantIds: Array.isArray(input?.selectedParticipantIds)
      ? input.selectedParticipantIds.filter(
          (id: any): id is string => typeof id === "string"
        )
      : defaults.selectedParticipantIds.slice(),
    rolesFilter: Array.isArray(input?.rolesFilter)
      ? input.rolesFilter.filter((s: any): s is string => typeof s === "string")
      : defaults.rolesFilter.slice(),
    userStreamsFilter: Array.isArray(input?.userStreamsFilter)
      ? input.userStreamsFilter.filter(
          (s: any): s is string => typeof s === "string"
        )
      : defaults.userStreamsFilter.slice(),
  };
}

function sanitizeParticipantWorkload(
  input: any,
  defaults: UIState["participantWorkload"]
): UIState["participantWorkload"] {
  const priorityFilter = Array.isArray(input?.priorityFilter)
    ? input.priorityFilter
        .map((v: any) => Number(v))
        .filter((n: number) => BACKLOG_PRIORITIES.has(n))
    : defaults.priorityFilter.slice();

  return {
    selectedQuarterIds: Array.isArray(input?.selectedQuarterIds)
      ? input.selectedQuarterIds.filter(
          (id: any): id is string => typeof id === "string"
        )
      : typeof input?.quarterId === "string" && input.quarterId !== "all"
      ? [input.quarterId]
      : defaults.selectedQuarterIds.slice(),
    selectedParticipantIds: Array.isArray(input?.selectedParticipantIds)
      ? input.selectedParticipantIds.filter(
          (id: any): id is string => typeof id === "string"
        )
      : defaults.selectedParticipantIds.slice(),
    rolesFilter: Array.isArray(input?.rolesFilter)
      ? input.rolesFilter.filter((s: any): s is string => typeof s === "string")
      : defaults.rolesFilter.slice(),
    userStreamsFilter: Array.isArray(input?.userStreamsFilter)
      ? input.userStreamsFilter.filter(
          (s: any): s is string => typeof s === "string"
        )
      : defaults.userStreamsFilter.slice(),
    priorityFilter:
      priorityFilter.length > 0 ? priorityFilter : defaults.priorityFilter,
    taskStreamFilter:
      typeof input?.taskStreamFilter === "string"
        ? input.taskStreamFilter
        : defaults.taskStreamFilter,
  };
}

function loadInitial(): UIState {
  const defaults = defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      taskLists: Object.fromEntries(Object.entries(parsed?.taskLists || {}).map(([key, value]) => [key, sanitizeBacklog(value, defaults.backlog)])),
      todo: sanitizeBacklog(parsed?.todo, defaults.todo),
      backlog: sanitizeBacklog(parsed?.backlog, defaults.backlog),
      capacity: sanitizeCapacity(parsed?.capacity, defaults.capacity),
      team: sanitizeTeam(parsed?.team, defaults.team),
      time: {
        selectedQuarterIds: Array.isArray(parsed?.time?.selectedQuarterIds)
          ? parsed.time.selectedQuarterIds.filter(
              (id: any): id is string => typeof id === "string"
            )
          : defaults.time.selectedQuarterIds.slice(),
      },
      participantWorkload: sanitizeParticipantWorkload(
        parsed?.participantWorkload,
        defaults.participantWorkload
      ),
    };
  } catch {}
  return defaults;
}

const initialState: UIState = loadInitial();

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setTaskListFilters(state, action: PayloadAction<{ key: string; changes: Partial<UIState["backlog"]> }>) {
      const { key, changes } = action.payload;
      const current = state.taskLists[key] ?? (key.endsWith(":BACKLOG") ? state.todo : state.backlog);
      const next = sanitizeBacklog({ ...current, ...changes }, current);
      if ((Object.keys(next) as (keyof typeof next)[]).every(field => next[field] === current[field])) return;
      state.taskLists[key] = next;
    },
    setBacklogFilters(
      state,
      action: PayloadAction<Partial<UIState["backlog"]>>
    ) {
      const next = { ...state.backlog, ...action.payload };
      const syncLegacyQuarterId =
        Object.prototype.hasOwnProperty.call(
          action.payload,
          "selectedQuarterIds"
        ) ||
        Object.prototype.hasOwnProperty.call(
          action.payload,
          "withoutQuarterFilter"
        );

      if (
        syncLegacyQuarterId &&
        !Object.prototype.hasOwnProperty.call(action.payload, "quarterId")
      ) {
        next.quarterId = next.selectedQuarterIds[0] ?? "all";
      }

      state.backlog = next;
    },
    setCapacitySelectedQuarterIds(
      state,
      action: PayloadAction<string[]>
    ) {
      state.capacity.selectedQuarterIds = action.payload;
    },
    setCapacityFilters(
      state,
      action: PayloadAction<Partial<UIState["capacity"]>>
    ) {
      state.capacity = { ...state.capacity, ...action.payload };
    },
    setTeamFilters(state, action: PayloadAction<Partial<UIState["team"]>>) {
      state.team = { ...state.team, ...action.payload };
    },
    setTimeSelectedQuarterIds(state, action: PayloadAction<string[]>) {
      state.time.selectedQuarterIds = action.payload;
    },
    setParticipantWorkloadFilters(
      state,
      action: PayloadAction<Partial<UIState["participantWorkload"]>>
    ) {
      state.participantWorkload = {
        ...state.participantWorkload,
        ...action.payload,
      };
    },
  },
});

export const {
  setTaskListFilters,
  setBacklogFilters,
  setCapacitySelectedQuarterIds,
  setCapacityFilters,
  setTeamFilters,
  setTimeSelectedQuarterIds,
  setParticipantWorkloadFilters,
} = uiSlice.actions;

export default uiSlice.reducer;

// Утилита для сохранения в localStorage
export function persistUIState(state: UIState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}
