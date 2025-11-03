import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type UIState = {
  backlog: {
    quarterId: string; // "all" | qid
    releaseSprintFilter: string; // "all" | "" | sprintId
    priorityFilter: number[]; // [1,2,3]
  };
  capacity: {
    quarterId: string | null;
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

function loadInitial(): UIState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as UIState;
  } catch {}
  return {
    backlog: {
      quarterId: "all",
      releaseSprintFilter: "all",
      priorityFilter: [1, 2, 3],
    },
    capacity: { quarterId: null },
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
    setCapacityQuarter(state, action: PayloadAction<string | null>) {
      state.capacity.quarterId = action.payload;
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
  setCapacityQuarter,
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
