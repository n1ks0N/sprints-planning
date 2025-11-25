import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { UndoItem } from "../types/undo";
import { api } from "./api";
import type { RootState, AppDispatch } from "./store";
import { runUndoItem } from "./undoSlice";
import { selectHistoryQuery } from "./historySelectors";

type HistoryState = {
  currentUser: string;
};

const loadUser = (): string => {
  if (typeof localStorage === "undefined") return "Аноним";
  try {
    const raw = localStorage.getItem("history-user");
    if (raw) return raw;
  } catch (e) {
    console.warn("Failed to load history user", e);
  }
  return "Аноним";
};

const initialState: HistoryState = {
  currentUser: loadUser(),
};

const historySlice = createSlice({
  name: "history",
  initialState,
  reducers: {
    setCurrentUser(state, action: PayloadAction<string>) {
      state.currentUser = action.payload.trim() || "Аноним";
    },
  },
});

export const {
  setCurrentUser,
} = historySlice.actions;

export default historySlice.reducer;

export const selectHistoryUser = (state: RootState) => state.history.currentUser;

export const selectHistoryGroups = (state: RootState) =>
  selectHistoryQuery(state)?.data ?? [];

export const revertHistoryGroup = (groupId: string) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const groups = selectHistoryGroups(getState());
    const group = groups.find((g) => g.id === groupId);
    if (!group || !group.changes.length) return;

    const withUndo = group.changes.filter((c) => c.undo).reverse();
    for (const change of withUndo) {
      try {
        if (change.undo) await runUndoItem(change.undo, dispatch);
      } catch (e) {
        console.error("Undo failed", e);
        break;
      }
    }

    await dispatch(api.endpoints.markHistoryRolledBack.initiate({ id: groupId })).unwrap();
  };
