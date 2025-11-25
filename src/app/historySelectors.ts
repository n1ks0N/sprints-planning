import { api } from "./api";
import type { RootState } from "./store";

export const selectHistoryQuery = (state: RootState) =>
  api.endpoints.getHistory.select(undefined)(state);
