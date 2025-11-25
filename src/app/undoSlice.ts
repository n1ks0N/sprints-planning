import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { UndoItem } from "../types/undo";
import { api } from "./api";
import type { AppDispatch, RootState } from "./store";

type UndoState = {
  stack: UndoItem[];
};

const initialState: UndoState = {
  stack: [],
};

const undoSlice = createSlice({
  name: "undo",
  initialState,
  reducers: {
    pushUndo(state, action: PayloadAction<UndoItem>) {
      state.stack.push(action.payload);
    },
    popUndo(state) {
      state.stack.pop();
    },
    clearUndo(state) {
      state.stack = [];
    },
  },
});

export const { pushUndo, popUndo, clearUndo } = undoSlice.actions;
export default undoSlice.reducer;

export const runUndoItem = async (item: UndoItem, dispatch: AppDispatch) => {
  switch (item.kind) {
    case "participants/delete":
      await dispatch(api.endpoints.deleteParticipant.initiate({ id: item.id })).unwrap();
      break;
    case "participants/add":
      await dispatch(api.endpoints.addParticipant.initiate(item.participant)).unwrap();
      break;
    case "participants/update":
      await dispatch(api.endpoints.updateParticipant.initiate(item.participant)).unwrap();
      break;
    case "participants/reorder":
      await dispatch(
        api.endpoints.reorderParticipants.initiate({ orders: item.orders })
      ).unwrap();
      break;

    case "quarters/delete":
      await dispatch(api.endpoints.deleteQuarter.initiate({ id: item.id })).unwrap();
      break;
    case "quarters/add":
      await dispatch(api.endpoints.addQuarter.initiate(item.quarter)).unwrap();
      break;
    case "quarters/update":
      await dispatch(api.endpoints.updateQuarter.initiate(item.quarter)).unwrap();
      break;

    case "sprints/delete":
      await dispatch(api.endpoints.deleteSprint.initiate({ id: item.id })).unwrap();
      break;
    case "sprints/add":
      await dispatch(api.endpoints.addSprint.initiate(item.sprint)).unwrap();
      break;
    case "sprints/update":
      await dispatch(api.endpoints.updateSprint.initiate(item.sprint)).unwrap();
      break;

    case "tasks/delete":
      await dispatch(api.endpoints.deleteTask.initiate({ id: item.id })).unwrap();
      break;
    case "tasks/add":
      await dispatch(api.endpoints.addTask.initiate(item.task)).unwrap();
      break;
    case "tasks/update":
      await dispatch(api.endpoints.updateTask.initiate(item.task)).unwrap();
      break;

    case "taskallocation/set":
      await dispatch(
        api.endpoints.upsertTaskAllocation.initiate({
          taskId: item.taskId,
          participantId: item.participantId,
          sprintId: item.sprintId,
          days: item.days,
        })
      ).unwrap();
      break;
    case "taskallocation/bulk":
      await dispatch(
        api.endpoints.upsertTaskAllocationBulk.initiate({ allocations: item.allocations })
      ).unwrap();
      break;
    case "taskload/set":
      await dispatch(
        api.endpoints.upsertTaskLoad.initiate({
          taskId: item.taskId,
          sprintId: item.sprintId,
          days: item.days,
        })
      ).unwrap();
      break;

    case "runvac/set":
      await dispatch(api.endpoints.upsertRunVacation.initiate(item.rv)).unwrap();
      break;
    case "runvac/bulk-restore":
      for (const rv of item.items) {
        await dispatch(api.endpoints.upsertRunVacation.initiate(rv)).unwrap();
      }
      break;

    case "releases/delete":
      await dispatch(api.endpoints.deleteRelease.initiate({ id: item.id })).unwrap();
      break;
    case "releases/add":
      await dispatch(api.endpoints.addRelease.initiate(item.release)).unwrap();
      break;
    case "releases/update":
      await dispatch(api.endpoints.updateRelease.initiate(item.release)).unwrap();
      break;
  }
};

export const undoLast =
  () => async (dispatch: AppDispatch, getState: () => RootState) => {
    const item = getState().undo.stack[getState().undo.stack.length - 1];
    if (!item) return;

    try {
      await runUndoItem(item, dispatch);
    } finally {
      dispatch(popUndo());
    }
  };
