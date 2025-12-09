import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { DEFAULT_TEAM_KEY, TEAM_OPTIONS, TeamOption } from "../teams";

type TeamState = {
  currentTeam: string;
  availableTeams: TeamOption[];
};

const parseTeamFromLocation = (): string => {
  if (typeof window === "undefined") return DEFAULT_TEAM_KEY;
  const hash = window.location.hash || "";
  // HashRouter keeps the path after the `#` symbol.
  const match = hash.match(/^#\/(\w[\w-]*)/i);
  return match?.[1]?.toLowerCase() || DEFAULT_TEAM_KEY;
};

const initialState: TeamState = {
  currentTeam: parseTeamFromLocation(),
  availableTeams: TEAM_OPTIONS,
};

const teamSlice = createSlice({
  name: "team",
  initialState,
  reducers: {
    setAvailableTeams(state, action: PayloadAction<TeamOption[]>) {
      state.availableTeams = action.payload.length
        ? action.payload
        : TEAM_OPTIONS;

      if (!state.availableTeams.some((team) => team.key === state.currentTeam)) {
        state.currentTeam = state.availableTeams[0].key;
      }
    },
    setCurrentTeam(state, action: PayloadAction<string>) {
      state.currentTeam = (action.payload || DEFAULT_TEAM_KEY).toLowerCase();
    },
  },
});

export const { setCurrentTeam, setAvailableTeams } = teamSlice.actions;

export const selectCurrentTeamKey = (state: { team?: TeamState }) =>
  state.team?.currentTeam ?? DEFAULT_TEAM_KEY;

export const selectAvailableTeams = (state: { team?: TeamState }) =>
  state.team?.availableTeams ?? TEAM_OPTIONS;

export default teamSlice.reducer;
