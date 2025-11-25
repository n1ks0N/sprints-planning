import {
  createListenerMiddleware,
  isAnyOf,
  type TypedStartListening,
} from "@reduxjs/toolkit";
import { api } from "./api";
import type { RootState, AppDispatch } from "./store";
import { pushUndo, type UndoItem } from "./undoSlice";
import type { BacklogItem, Participant, Quarter, RunVacation, Sprint, Release } from "../types";

const listener = createListenerMiddleware();

type StartListening = TypedStartListening<RootState, AppDispatch>;

const startListening = listener.startListening as StartListening;

function findFromList<T extends { id: string }>(list: T[] | undefined, id: string) {
  return list?.find((x) => x.id === id);
}

function getCachedList<T>(state: RootState, endpointName: string): T[] | undefined {
  const queries = (state.api as any).queries || {};
  for (const q of Object.values<any>(queries)) {
    if (q?.endpointName === endpointName && q.status === "fulfilled") {
      return q.data as T[];
    }
  }
  return undefined;
}

function findSprint(state: RootState, id: string): Sprint | undefined {
  const fromSelector = api.endpoints.getSprints.select(undefined)(state)?.data;
  const direct = findFromList(fromSelector, id);
  if (direct) return direct;
  const cached = getCachedList<Sprint>(state, "getSprints");
  return findFromList(cached, id);
}

function findParticipant(state: RootState, id: string): Participant | undefined {
  const list = api.endpoints.getParticipants.select(undefined)(state)?.data;
  return findFromList(list, id);
}

function findQuarter(state: RootState, id: string): Quarter | undefined {
  const list = api.endpoints.getQuarters.select(undefined)(state)?.data;
  return findFromList(list, id);
}

function findTask(state: RootState, id: string): BacklogItem | undefined {
  const all = api.endpoints.getTasks.select(undefined)(state)?.data;
  const direct = findFromList(all, id);
  if (direct) return direct;
  const cached = getCachedList<BacklogItem>(state, "getTasks");
  return findFromList(cached, id);
}

function findRunVacSnapshot(
  state: RootState,
  participantId: string,
  sprintId: string
): RunVacation | undefined {
  const list = getCachedList<RunVacation>(state, "getRunVacation");
  return list?.find((rv) => rv.participantId === participantId && rv.sprintId === sprintId);
}

function findRelease(state: RootState, id: string): Release | undefined {
  const list = api.endpoints.getReleases.select()(state)?.data;
  return findFromList(list, id);
}

type PendingSnapshot = Record<string, any>;
const pendingMap = new Map<string, PendingSnapshot>();

startListening({
  matcher: isAnyOf(
    api.endpoints.updateQuarter.matchPending,
    api.endpoints.deleteQuarter.matchPending,
    api.endpoints.updateSprint.matchPending,
    api.endpoints.deleteSprint.matchPending,
    api.endpoints.updateParticipant.matchPending,
    api.endpoints.deleteParticipant.matchPending,
    api.endpoints.reorderParticipants.matchPending,
    api.endpoints.updateTask.matchPending,
    api.endpoints.deleteTask.matchPending,
    api.endpoints.upsertTaskAllocation.matchPending,
    api.endpoints.upsertTaskAllocationBulk.matchPending,
    api.endpoints.upsertTaskLoad.matchPending,
    api.endpoints.upsertRunVacation.matchPending,
    api.endpoints.bulkRunVacation.matchPending,
    api.endpoints.updateRelease.matchPending,
    api.endpoints.deleteRelease.matchPending
  ),
  effect: (action, apiHandler) => {
    const state = apiHandler.getState();
    const args = action.meta.arg.originalArgs;

    switch (action.meta.arg.endpointName) {
      case "updateQuarter":
      case "deleteQuarter": {
        const prev = args?.id ? findQuarter(state, args.id) : undefined;
        if (prev) pendingMap.set(action.meta.requestId, { prevQuarter: prev });
        break;
      }
      case "updateSprint":
      case "deleteSprint": {
        const prev = args?.id ? findSprint(state, args.id) : undefined;
        if (prev) pendingMap.set(action.meta.requestId, { prevSprint: prev });
        break;
      }
      case "updateParticipant":
      case "deleteParticipant": {
        const prev = args?.id ? findParticipant(state, args.id) : undefined;
        if (prev) pendingMap.set(action.meta.requestId, { prevParticipant: prev });
        break;
      }
      case "reorderParticipants": {
        const list = api.endpoints.getParticipants.select(undefined)(state)?.data;
        if (list?.length) {
          pendingMap.set(action.meta.requestId, {
            participantOrders: list.map((p, idx) => ({ id: p.id, order: idx })),
          });
        }
        break;
      }
      case "updateTask":
      case "deleteTask": {
        const prev = args?.id ? findTask(state, args.id) : undefined;
        if (prev) pendingMap.set(action.meta.requestId, { prevTask: prev });
        break;
      }
      case "upsertTaskAllocation": {
        const { taskId, participantId, sprintId } = args || {};
        const task = taskId ? findTask(state, taskId) : undefined;
        const prevDays =
          task?.allocations?.[participantId]?.[sprintId] ?? 0;
        pendingMap.set(action.meta.requestId, { prevDays });
        break;
      }
      case "upsertTaskAllocationBulk": {
        const allocations = (args?.allocations as any[]) || [];
        const snapshots = allocations.map((a) => {
          const task = a.taskId ? findTask(state, a.taskId) : undefined;
          const prevDays = task?.allocations?.[a.participantId]?.[a.sprintId] ?? 0;
          return { ...a, prevDays };
        });
        pendingMap.set(action.meta.requestId, { bulkAllocations: snapshots });
        break;
      }
      case "upsertTaskLoad": {
        const { taskId, sprintId } = args || {};
        const task = taskId ? findTask(state, taskId) : undefined;
        const prevDays = task?.loads?.[sprintId] ?? 0;
        pendingMap.set(action.meta.requestId, { prevDays });
        break;
      }
      case "upsertRunVacation": {
        const { participantId, sprintId } = args || {};
        if (participantId && sprintId) {
          const prev = findRunVacSnapshot(state, participantId, sprintId);
          pendingMap.set(action.meta.requestId, { prevRunVac: prev });
        }
        break;
      }
      case "bulkRunVacation": {
        const quarterId = args?.quarterId;
        const cached = quarterId
          ? api.endpoints.getRunVacation.select({ quarterId })(state)?.data
          : undefined;
        if (cached?.length) pendingMap.set(action.meta.requestId, { prevBulk: cached });
        break;
      }
      case "updateRelease":
      case "deleteRelease": {
        const prev = args?.id ? findRelease(state, args.id) : undefined;
        if (prev) pendingMap.set(action.meta.requestId, { prevRelease: prev });
        break;
      }
    }
  },
});

startListening({
  matcher: isAnyOf(
    api.endpoints.addQuarter.matchFulfilled,
    api.endpoints.updateQuarter.matchFulfilled,
    api.endpoints.deleteQuarter.matchFulfilled,
    api.endpoints.addSprint.matchFulfilled,
    api.endpoints.updateSprint.matchFulfilled,
    api.endpoints.deleteSprint.matchFulfilled,
    api.endpoints.addParticipant.matchFulfilled,
    api.endpoints.updateParticipant.matchFulfilled,
    api.endpoints.deleteParticipant.matchFulfilled,
    api.endpoints.reorderParticipants.matchFulfilled,
    api.endpoints.addTask.matchFulfilled,
    api.endpoints.updateTask.matchFulfilled,
    api.endpoints.deleteTask.matchFulfilled,
    api.endpoints.upsertTaskAllocation.matchFulfilled,
    api.endpoints.upsertTaskAllocationBulk.matchFulfilled,
    api.endpoints.upsertTaskLoad.matchFulfilled,
    api.endpoints.upsertRunVacation.matchFulfilled,
    api.endpoints.bulkRunVacation.matchFulfilled,
    api.endpoints.addRelease.matchFulfilled,
    api.endpoints.updateRelease.matchFulfilled,
    api.endpoints.deleteRelease.matchFulfilled
  ),
  effect: (action, apiHandler) => {
    const { dispatch, getState } = apiHandler;
    const state = getState();
    const endpoint = action.meta.arg.endpointName;
    const args = action.meta.arg.originalArgs;
    const payload = action.payload as any;
    const snapshot = pendingMap.get(action.meta.requestId) || {};
    pendingMap.delete(action.meta.requestId);

    const now = new Date().toISOString();
    let undo: UndoItem | undefined;
    let actionTitle: string | undefined;

    switch (endpoint) {
      case "addQuarter":
        undo = { kind: "quarters/delete", id: payload.id };
        actionTitle = `Добавлен квартал ${payload.name || payload.id}`;
        break;
      case "updateQuarter":
        if (snapshot.prevQuarter)
          undo = { kind: "quarters/update", quarter: snapshot.prevQuarter };
        actionTitle = `Изменён квартал ${payload.name || payload.id}`;
        break;
      case "deleteQuarter":
        if (snapshot.prevQuarter)
          undo = { kind: "quarters/add", quarter: snapshot.prevQuarter };
        actionTitle = `Удалён квартал ${snapshot.prevQuarter?.name || args?.id}`;
        break;

      case "addSprint":
        undo = { kind: "sprints/delete", id: payload.id };
        actionTitle = `Добавлен спринт ${payload.name || payload.id}`;
        break;
      case "updateSprint":
        if (snapshot.prevSprint)
          undo = { kind: "sprints/update", sprint: snapshot.prevSprint };
        actionTitle = `Изменён спринт ${payload.name || payload.id}`;
        break;
      case "deleteSprint":
        if (snapshot.prevSprint)
          undo = { kind: "sprints/add", sprint: snapshot.prevSprint };
        actionTitle = `Удалён спринт ${snapshot.prevSprint?.name || args?.id}`;
        break;

      case "addParticipant":
        undo = { kind: "participants/delete", id: payload.id };
        actionTitle = `Добавлен участник ${payload.fullName}`;
        break;
      case "updateParticipant":
        if (snapshot.prevParticipant)
          undo = { kind: "participants/update", participant: snapshot.prevParticipant };
        actionTitle = `Обновлён участник ${payload.fullName || args?.id}`;
        break;
      case "deleteParticipant":
        if (snapshot.prevParticipant)
          undo = { kind: "participants/add", participant: snapshot.prevParticipant };
        actionTitle = `Удалён участник ${snapshot.prevParticipant?.fullName || args?.id}`;
        break;
      case "reorderParticipants":
        if (snapshot.participantOrders)
          undo = { kind: "participants/reorder", orders: snapshot.participantOrders };
        actionTitle = "Изменён порядок участников";
        break;

      case "addTask":
        undo = { kind: "tasks/delete", id: payload.id };
        actionTitle = `Создана задача ${payload.title}`;
        break;
      case "updateTask":
        if (snapshot.prevTask) undo = { kind: "tasks/update", task: snapshot.prevTask };
        actionTitle = `Обновлена задача ${payload.title || args?.id}`;
        break;
      case "deleteTask":
        if (snapshot.prevTask) undo = { kind: "tasks/add", task: snapshot.prevTask };
        actionTitle = `Удалена задача ${snapshot.prevTask?.title || args?.id}`;
        break;

      case "upsertTaskAllocation": {
        const prevDays = snapshot.prevDays ?? 0;
        undo = {
          kind: "taskallocation/set",
          taskId: args.taskId,
          participantId: args.participantId,
          sprintId: args.sprintId,
          days: prevDays,
        };
        actionTitle = `Нагрузка задачи ${args.taskId} (${args.participantId})`;
        break;
      }
      case "upsertTaskAllocationBulk": {
        const prevAllocations = (snapshot.bulkAllocations || []).map((item: any) => ({
          taskId: item.taskId,
          participantId: item.participantId,
          sprintId: item.sprintId,
          days: item.prevDays ?? 0,
        }));
        if (prevAllocations.length)
          undo = { kind: "taskallocation/bulk", allocations: prevAllocations };
        actionTitle = "Массовое обновление аллокаций";
        break;
      }
      case "upsertTaskLoad": {
        undo = {
          kind: "taskload/set",
          taskId: args.taskId,
          sprintId: args.sprintId,
          days: snapshot.prevDays ?? 0,
        };
        actionTitle = `Оценка задачи ${args.taskId} для спринта ${args.sprintId}`;
        break;
      }

      case "upsertRunVacation": {
        const prev = snapshot.prevRunVac || {
          participantId: args.participantId,
          sprintId: args.sprintId,
          runDays: 0,
          vacationNormDays: 0,
        };
        undo = { kind: "runvac/set", rv: prev };
        actionTitle = `Загрузка/отпуск ${args.participantId} (${args.sprintId})`;
        break;
      }
      case "bulkRunVacation": {
        if (snapshot.prevBulk)
          undo = { kind: "runvac/bulk-restore", items: snapshot.prevBulk };
        actionTitle = `Массовое обновление отпусков для квартала ${args.quarterId}`;
        break;
      }

      case "addRelease":
        undo = { kind: "releases/delete", id: payload.id };
        actionTitle = `Создан релиз ${payload.name || payload.id}`;
        break;
      case "updateRelease":
        if (snapshot.prevRelease)
          undo = { kind: "releases/update", release: snapshot.prevRelease };
        actionTitle = `Обновлён релиз ${payload.name || args?.id}`;
        break;
      case "deleteRelease":
        if (snapshot.prevRelease)
          undo = { kind: "releases/add", release: snapshot.prevRelease };
        actionTitle = `Удалён релиз ${snapshot.prevRelease?.name || args?.id}`;
        break;
    }

    if (!actionTitle) return;

    if (undo) dispatch(pushUndo(undo));
    const user = getState().history.currentUser || "Аноним";
    dispatch(
      api.endpoints.addHistoryChange.initiate({
        user,
        action: actionTitle,
        createdAt: now,
        undo,
      })
    );
  },
});

startListening({
  matcher: isAnyOf(
    api.endpoints.updateQuarter.matchRejected,
    api.endpoints.deleteQuarter.matchRejected,
    api.endpoints.updateSprint.matchRejected,
    api.endpoints.deleteSprint.matchRejected,
    api.endpoints.updateParticipant.matchRejected,
    api.endpoints.deleteParticipant.matchRejected,
    api.endpoints.reorderParticipants.matchRejected,
    api.endpoints.updateTask.matchRejected,
    api.endpoints.deleteTask.matchRejected,
    api.endpoints.upsertTaskAllocation.matchRejected,
    api.endpoints.upsertTaskAllocationBulk.matchRejected,
    api.endpoints.upsertTaskLoad.matchRejected,
    api.endpoints.upsertRunVacation.matchRejected,
    api.endpoints.bulkRunVacation.matchRejected,
    api.endpoints.updateRelease.matchRejected,
    api.endpoints.deleteRelease.matchRejected
  ),
  effect: (action) => {
    pendingMap.delete(action.meta.requestId);
  },
});

export const historyMiddleware = listener.middleware;
