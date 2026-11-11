import * as React from "react";
import type { PlanningWorkbenchItem } from "../types";
import { api } from "../app/api";
import { planningCacheListener, taskMutationFulfilled } from "../app/planningCacheListener";
import { invalidatePlanningWorkbenchSource } from "../views/planningWorkbenchPreviewStore";

type PlanningSelection = {
  selectedItemIds: string[];
  setSelectedItemIds: React.Dispatch<React.SetStateAction<string[]>>;
  itemCacheById: Map<string, PlanningWorkbenchItem>;
  setItemCacheById: React.Dispatch<React.SetStateAction<Map<string, PlanningWorkbenchItem>>>;
  addTransferredItem: (item: PlanningWorkbenchItem) => void;
  removeItemsFromPlan: (ids: string[]) => void;
  isSourceSelected: (taskId: string) => boolean;
  removeSourceFromPlan: (taskId: string) => void;
};

const PlanningSelectionContext = React.createContext<PlanningSelection | null>(null);

type SelectionState = { selectedItemIds: string[]; itemCacheById: Map<string, PlanningWorkbenchItem> };
type SelectionAction =
  | { type: "select"; value: React.SetStateAction<string[]> }
  | { type: "cache"; value: React.SetStateAction<Map<string, PlanningWorkbenchItem>> }
  | { type: "add"; item: PlanningWorkbenchItem }
  | { type: "remove"; ids: string[] }
  | { type: "removeSource"; taskId: string }
  | { type: "deleteSource"; taskId: string };

function removeItems(state: SelectionState, ids: string[]): SelectionState {
  if (!ids.length) return state;
  const removed = new Set(ids);
  const remaining = state.selectedItemIds.filter(id => !removed.has(id));
  const selectedItemIds = remaining.length === state.selectedItemIds.length ? state.selectedItemIds : remaining;
  const cached = ids.some(id => state.itemCacheById.has(id));
  if (selectedItemIds.length === state.selectedItemIds.length && !cached) return state;
  const itemCacheById = cached ? new Map(state.itemCacheById) : state.itemCacheById;
  if (cached) ids.forEach(id => itemCacheById.delete(id));
  return { selectedItemIds, itemCacheById };
}

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "select": {
      const next = typeof action.value === "function" ? action.value(state.selectedItemIds) : action.value;
      return next.length === state.selectedItemIds.length && next.every((id, index) => id === state.selectedItemIds[index])
        ? state : { ...state, selectedItemIds: next };
    }
    case "cache": {
      const next = typeof action.value === "function" ? action.value(state.itemCacheById) : action.value;
      return next === state.itemCacheById ? state : { ...state, itemCacheById: next };
    }
    case "add": {
      const selectedItemIds = state.selectedItemIds.includes(action.item.id) ? state.selectedItemIds : [...state.selectedItemIds, action.item.id];
      const itemCacheById = state.itemCacheById.get(action.item.id) === action.item ? state.itemCacheById : new Map(state.itemCacheById).set(action.item.id, action.item);
      return selectedItemIds === state.selectedItemIds && itemCacheById === state.itemCacheById ? state : { selectedItemIds, itemCacheById };
    }
    case "remove": return removeItems(state, action.ids);
    case "removeSource": return removeItems(state, state.selectedItemIds.filter(id => state.itemCacheById.get(id)?.sourceTaskId === action.taskId));
    case "deleteSource": return removeItems(state, [...state.itemCacheById.values()]
      .filter(item => item.sourceTaskId === action.taskId).map(item => item.id));
  }
}

/** Team-scoped selection survives navigation; actions remain stable as item data changes. */
export function PlanningSelectionProvider({ children }: { children: React.ReactNode }) {
  const [{ selectedItemIds, itemCacheById }, dispatch] = React.useReducer(selectionReducer, undefined, () => ({
    selectedItemIds: [], itemCacheById: new Map<string, PlanningWorkbenchItem>(),
  }));
  React.useEffect(() => planningCacheListener.startListening({
    matcher: taskMutationFulfilled,
    effect: action => {
      const args = action.meta.arg.originalArgs;
      const taskId = "id" in args ? args.id : args.taskId;
      invalidatePlanningWorkbenchSource(taskId);
      if (api.endpoints.deleteTask.matchFulfilled(action)) dispatch({ type: "deleteSource", taskId });
    },
  }), []);
  const setSelectedItemIds = React.useCallback((value: React.SetStateAction<string[]>) => dispatch({ type: "select", value }), []);
  const setItemCacheById = React.useCallback((value: React.SetStateAction<Map<string, PlanningWorkbenchItem>>) => dispatch({ type: "cache", value }), []);
  const addTransferredItem = React.useCallback((item: PlanningWorkbenchItem) => dispatch({ type: "add", item }), []);
  const removeItemsFromPlan = React.useCallback((ids: string[]) => dispatch({ type: "remove", ids }), []);
  const removeSourceFromPlan = React.useCallback((taskId: string) => dispatch({ type: "removeSource", taskId }), []);
  const selectedSourceIds = React.useMemo(() => new Set(selectedItemIds
    .map(id => itemCacheById.get(id)?.sourceTaskId).filter((id): id is string => Boolean(id))),
  [selectedItemIds, itemCacheById]);
  const isSourceSelected = React.useCallback((taskId: string) => selectedSourceIds.has(taskId), [selectedSourceIds]);
  const value = React.useMemo(() => ({ selectedItemIds, setSelectedItemIds, itemCacheById, setItemCacheById,
    addTransferredItem, removeItemsFromPlan, removeSourceFromPlan, isSourceSelected }),
  [selectedItemIds, itemCacheById, setSelectedItemIds, setItemCacheById, addTransferredItem, removeItemsFromPlan, removeSourceFromPlan, isSourceSelected]);
  return <PlanningSelectionContext.Provider value={value}>{children}</PlanningSelectionContext.Provider>;
}

export function usePlanningSelection() {
  const value = React.useContext(PlanningSelectionContext);
  if (!value) throw new Error("PlanningSelectionProvider is required");
  return value;
}
