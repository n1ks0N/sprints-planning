import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { DEFAULT_TEAM_KEY, TEAM_OPTIONS } from "../teams";

type TeamState = {
  currentTeam: string;
  availableTeams: typeof TEAM_OPTIONS;
};

const initialState: TeamState = {
  currentTeam: DEFAULT_TEAM_KEY,
  availableTeams: TEAM_OPTIONS,
};

const teamSlice = createSlice({
  name: "team",
  initialState,
  reducers: {
    setCurrentTeam(state, action: PayloadAction<string>) {
      state.currentTeam = action.payload || DEFAULT_TEAM_KEY;
      if (!state.availableTeams.some((team) => team.key === state.currentTeam)) {
        state.availableTeams = [
          ...state.availableTeams,
          { key: state.currentTeam, label: state.currentTeam },
        ];
      }
    },
  },
});

export const { setCurrentTeam } = teamSlice.actions;

export const selectCurrentTeamKey = (state: { team?: TeamState }) =>
  state.team?.currentTeam ?? DEFAULT_TEAM_KEY;

export const selectAvailableTeams = (state: { team?: TeamState }) =>
  state.team?.availableTeams ?? TEAM_OPTIONS;

export default teamSlice.reducer;
