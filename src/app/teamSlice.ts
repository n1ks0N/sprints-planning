import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { DEFAULT_TEAM_KEY, TEAM_OPTIONS, TeamOption } from "../teams";

type TeamState = {
  currentTeam: string;
  availableTeams: TeamOption[];
};

const initialState: TeamState = {
  currentTeam: DEFAULT_TEAM_KEY,
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
      if (!state.availableTeams.some((team) => team.key === state.currentTeam)) {
        state.availableTeams = [
          ...state.availableTeams,
          { key: state.currentTeam, label: state.currentTeam },
        ];
      }
    },
  },
});

export const { setCurrentTeam, setAvailableTeams } = teamSlice.actions;

export const selectCurrentTeamKey = (state: { team?: TeamState }) =>
  state.team?.currentTeam ?? DEFAULT_TEAM_KEY;

export const selectAvailableTeams = (state: { team?: TeamState }) =>
  state.team?.availableTeams ?? TEAM_OPTIONS;

export default teamSlice.reducer;
