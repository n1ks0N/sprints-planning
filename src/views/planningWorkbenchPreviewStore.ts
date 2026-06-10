import type { Allocations, BacklogItem, PlanningWorkbenchPreview } from "../types";

const PREVIEW_STORAGE_KEY = "planning-workbench-preview";
const REVIEW_STATE_STORAGE_KEY = "planning-workbench-review-state";

export type PlanningWorkbenchReviewState = {
  preview: PlanningWorkbenchPreview;
  selectedItemIds: string[];
  draftTasks: BacklogItem[];
  draftAllocations: Allocations;
};

let currentPreview: PlanningWorkbenchPreview | null = null;
let currentReviewState: PlanningWorkbenchReviewState | null = null;
let currentPreviewKey: string | null = null;
let currentReviewStateKey: string | null = null;

const storageKey = (baseKey: string) => {
  if (typeof window === "undefined") return baseKey;
  const hash = window.location.hash || "";
  const match = hash.match(/^#\/([\w-]+)/i);
  const teamKey = match?.[1]?.toLowerCase() || "default";
  return `${baseKey}:${teamKey}`;
};

const readSessionValue = <T,>(key: string): T | null => {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(storageKey(key));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    window.sessionStorage.removeItem(storageKey(key));
    return null;
  }
};

const writeSessionValue = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(storageKey(key), JSON.stringify(value));
};

const removeSessionValue = (key: string) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(storageKey(key));
};

export const setPlanningWorkbenchPreview = (preview: PlanningWorkbenchPreview) => {
  currentPreviewKey = storageKey(PREVIEW_STORAGE_KEY);
  currentReviewStateKey = null;
  currentPreview = preview;
  currentReviewState = null;
  writeSessionValue(PREVIEW_STORAGE_KEY, preview);
  removeSessionValue(REVIEW_STATE_STORAGE_KEY);
};

export const consumePlanningWorkbenchPreview = (): PlanningWorkbenchPreview | null => {
  const previewKey = storageKey(PREVIEW_STORAGE_KEY);
  if (currentPreview && currentPreviewKey === previewKey) {
    return currentPreview;
  }
  currentPreview = readSessionValue<PlanningWorkbenchPreview>(PREVIEW_STORAGE_KEY);
  currentPreviewKey = currentPreview ? previewKey : null;
  return currentPreview;
};

export const savePlanningWorkbenchReviewState = (state: PlanningWorkbenchReviewState) => {
  currentPreviewKey = storageKey(PREVIEW_STORAGE_KEY);
  currentReviewStateKey = storageKey(REVIEW_STATE_STORAGE_KEY);
  currentPreview = state.preview;
  currentReviewState = state;
  writeSessionValue(PREVIEW_STORAGE_KEY, state.preview);
  writeSessionValue(REVIEW_STATE_STORAGE_KEY, state);
};

export const loadPlanningWorkbenchReviewState = (): PlanningWorkbenchReviewState | null => {
  const reviewStateKey = storageKey(REVIEW_STATE_STORAGE_KEY);
  if (currentReviewState && currentReviewStateKey === reviewStateKey) {
    return currentReviewState;
  }
  currentReviewState = readSessionValue<PlanningWorkbenchReviewState>(REVIEW_STATE_STORAGE_KEY);
  currentReviewStateKey = currentReviewState ? reviewStateKey : null;
  if (currentReviewState?.preview) {
    currentPreview = currentReviewState.preview;
    currentPreviewKey = storageKey(PREVIEW_STORAGE_KEY);
  }
  return currentReviewState;
};

export const clearPlanningWorkbenchPreview = () => {
  currentPreview = null;
  currentReviewState = null;
  currentPreviewKey = null;
  currentReviewStateKey = null;
  removeSessionValue(PREVIEW_STORAGE_KEY);
  removeSessionValue(REVIEW_STATE_STORAGE_KEY);
};
