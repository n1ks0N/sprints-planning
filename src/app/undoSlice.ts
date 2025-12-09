import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type {
  Participant,
  Quarter,
  Sprint,
  BacklogItem,
} from "../types";
import { api } from "./api";
import type { AppDispatch, RootState } from "./store";

type UndoItem =
  | { kind: "participants/delete"; id: string }
  | { kind: "participants/add"; participant: Participant }
  | { kind: "participants/update"; participant: Participant }
  | { kind: "participants/reorder"; orders: { id: string; order: number }[] }
  | { kind: "quarters/delete"; id: string }
  | { kind: "quarters/add"; quarter: Quarter }
  | { kind: "quarters/update"; quarter: Quarter }
  | { kind: "sprints/delete"; id: string }
  | { kind: "sprints/add"; sprint: Sprint }
  | { kind: "sprints/update"; sprint: Sprint }
  | { kind: "tasks/delete"; id: string }
  | { kind: "tasks/add"; task: BacklogItem }
  | { kind: "tasks/update"; task: BacklogItem }
  | {
      kind: "taskallocation/set";
      taskId: string;
      participantId: string;
      sprintId: string;
      days: number;
    }
  | { kind: "taskload/set"; taskId: string; sprintId: string; days: number };

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

export const undoLast =
  () => async (dispatch: AppDispatch, getState: () => RootState) => {
    const item = getState().undo.stack[getState().undo.stack.length - 1];
    if (!item) return;

    try {
      switch (item.kind) {
        case "participants/delete":
          await dispatch(
            api.endpoints.deleteParticipant.initiate({ id: item.id })
          ).unwrap();
          break;
        case "participants/add":
          await dispatch(
            api.endpoints.addParticipant.initiate(item.participant)
          ).unwrap();
          break;
        case "participants/update":
          await dispatch(
            api.endpoints.updateParticipant.initiate(item.participant)
          ).unwrap();
          break;
        case "participants/reorder":
          await dispatch(
            api.endpoints.reorderParticipants.initiate({ orders: item.orders })
          ).unwrap();
          break;

        case "quarters/delete":
          await dispatch(
            api.endpoints.deleteQuarter.initiate({ id: item.id })
          ).unwrap();
          break;
        case "quarters/add":
          await dispatch(
            api.endpoints.addQuarter.initiate(item.quarter)
          ).unwrap();
          break;
        case "quarters/update":
          await dispatch(
            api.endpoints.updateQuarter.initiate(item.quarter)
          ).unwrap();
          break;

        case "sprints/delete":
          await dispatch(
            api.endpoints.deleteSprint.initiate({ id: item.id })
          ).unwrap();
          break;
        case "sprints/add":
          await dispatch(
            api.endpoints.addSprint.initiate(item.sprint)
          ).unwrap();
          break;
        case "sprints/update":
          await dispatch(
            api.endpoints.updateSprint.initiate(item.sprint)
          ).unwrap();
          break;

        case "tasks/delete":
          await dispatch(
            api.endpoints.deleteTask.initiate({ id: item.id })
          ).unwrap();
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
        case "taskload/set":
          await dispatch(
            api.endpoints.upsertTaskLoad.initiate({
              taskId: item.taskId,
              sprintId: item.sprintId,
              days: item.days,
            })
          ).unwrap();
          break;
      }
    } finally {
      dispatch(popUndo());
    }
  };
