import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { TaskStatus } from "../types";

export type UIState = {
  backlog: {
    quarterId: string; // "all" | qid
    releaseSprintFilter: string; // "all" | "" | sprintId
    priorityFilter: number[]; // [1,2,3]
    streamFilter: string;
    statusFilter: TaskStatus[];
  };
  capacity: {
    selectedQuarterIds: string[];
  };
  team: {
    filterRoles: string[];
    filterRates: string[]; // строки "1.00", "0.75" и т.п.
  };
  time: {
    selectedQuarterIds: string[];
  };
  participantWorkload: {
    quarterId: string; // "all" | qid
    selectedParticipantIds: string[];
    rolesFilter: string[];
    priorityFilter: number[]; // [1,2,3]
  };
};

const STORAGE_KEY = "uiState_v1";

const BACKLOG_PRIORITIES = new Set([1, 2, 3]);
const BACKLOG_STATUSES: TaskStatus[] = [
  "inprogress",
  "done",
  "notdone",
  "canceled",
  "partial",
];

function defaultState(): UIState {
  return {
    backlog: {
      quarterId: "all",
      releaseSprintFilter: "all",
      priorityFilter: [],
      streamFilter: "",
      statusFilter: [],
    },
    capacity: { selectedQuarterIds: [] },
    team: { filterRoles: [], filterRates: [] },
    time: { selectedQuarterIds: [] },
    participantWorkload: {
      quarterId: "all",
      selectedParticipantIds: [],
      rolesFilter: [],
      priorityFilter: [1, 2, 3],
    },
  };
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
    ? input.statusFilter.filter((s: any): s is TaskStatus =>
        typeof s === "string" ? BACKLOG_STATUSES.includes(s as TaskStatus) : false
      )
    : defaults.statusFilter.slice();

  return {
    quarterId:
      typeof input?.quarterId === "string"
        ? input.quarterId
        : defaults.quarterId,
    releaseSprintFilter:
      typeof input?.releaseSprintFilter === "string"
        ? input.releaseSprintFilter
        : defaults.releaseSprintFilter,
    priorityFilter,
    streamFilter:
      typeof input?.streamFilter === "string"
        ? input.streamFilter
        : defaults.streamFilter,
    statusFilter,
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
    quarterId:
      typeof input?.quarterId === "string"
        ? input.quarterId
        : defaults.quarterId,
    selectedParticipantIds: Array.isArray(input?.selectedParticipantIds)
      ? input.selectedParticipantIds.filter(
          (id: any): id is string => typeof id === "string"
        )
      : defaults.selectedParticipantIds.slice(),
    rolesFilter: Array.isArray(input?.rolesFilter)
      ? input.rolesFilter.filter((s: any): s is string => typeof s === "string")
      : defaults.rolesFilter.slice(),
    priorityFilter:
      priorityFilter.length > 0 ? priorityFilter : defaults.priorityFilter,
  };
}

function loadInitial(): UIState {
  const defaults = defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
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
    setBacklogFilters(
      state,
      action: PayloadAction<Partial<UIState["backlog"]>>
    ) {
      state.backlog = { ...state.backlog, ...action.payload };
    },
    setCapacitySelectedQuarterIds(
      state,
      action: PayloadAction<string[]>
    ) {
      state.capacity.selectedQuarterIds = action.payload;
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
  setBacklogFilters,
  setCapacitySelectedQuarterIds,
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
