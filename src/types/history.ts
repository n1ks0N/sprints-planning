import type { UndoItem } from "./undo";

export type HistoryChange = {
  id: string;
  action: string;
  createdAt: string;
  undo?: UndoItem;
};

export type HistoryGroup = {
  id: string;
  user: string;
  createdAt: string;
  description?: string | null;
  locked: boolean;
  rolledBackAt?: string | null;
  changes: HistoryChange[];
};

export type HistoryChangeInput = {
  user?: string;
  action: string;
  createdAt: string;
  undo?: UndoItem;
};
