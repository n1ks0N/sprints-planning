import * as React from "react";

import type { BacklogItem } from "../types";

type JiraExportContextValue = {
  selectedTasks: BacklogItem[];
  selectedCount: number;
  dialogOpen: boolean;
  isSelected: (taskId: string) => boolean;
  addTask: (task: BacklogItem) => void;
  addTasks: (tasks: BacklogItem[]) => void;
  syncTasks: (tasks: BacklogItem[]) => void;
  removeTask: (taskId: string) => void;
  toggleTask: (task: BacklogItem) => void;
  clearTasks: () => void;
  openDialog: () => void;
  closeDialog: () => void;
};

const JiraExportContext = React.createContext<JiraExportContextValue | null>(null);

type JiraExportProviderProps = {
  children: React.ReactNode;
  scopeKey: string;
};

function mergeTasks(prev: BacklogItem[], incoming: BacklogItem[]) {
  if (incoming.length === 0) return prev;

  const indexById = new Map(prev.map((task, index) => [task.id, index]));
  const next = prev.slice();
  let changed = false;

  for (const task of incoming) {
    const existingIndex = indexById.get(task.id);
    if (existingIndex == null) {
      indexById.set(task.id, next.length);
      next.push(task);
      changed = true;
      continue;
    }

    if (next[existingIndex] !== task) {
      next[existingIndex] = task;
      changed = true;
    }
  }

  return changed ? next : prev;
}

export function JiraExportProvider({
  children,
  scopeKey,
}: JiraExportProviderProps) {
  const [selectedTasks, setSelectedTasks] = React.useState<BacklogItem[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  React.useEffect(() => {
    setSelectedTasks([]);
    setDialogOpen(false);
  }, [scopeKey]);

  const selectedTaskIds = React.useMemo(
    () => new Set(selectedTasks.map((task) => task.id)),
    [selectedTasks]
  );

  const addTask = React.useCallback((task: BacklogItem) => {
    setSelectedTasks((prev) => mergeTasks(prev, [task]));
  }, []);

  const addTasks = React.useCallback((tasks: BacklogItem[]) => {
    setSelectedTasks((prev) => mergeTasks(prev, tasks));
  }, []);

  const syncTasks = React.useCallback((tasks: BacklogItem[]) => {
    if (tasks.length === 0) return;
    setSelectedTasks((prev) => {
      const byId = new Map(tasks.map((task) => [task.id, task]));
      let changed = false;
      const next = prev.map((task) => {
        const replacement = byId.get(task.id);
        if (!replacement) return task;
        if (replacement === task) {
          return task;
        }
        changed = true;
        return replacement;
      });
      return changed ? next : prev;
    });
  }, []);

  const removeTask = React.useCallback((taskId: string) => {
    setSelectedTasks((prev) => prev.filter((task) => task.id !== taskId));
  }, []);

  const toggleTask = React.useCallback((task: BacklogItem) => {
    setSelectedTasks((prev) => {
      if (prev.some((entry) => entry.id === task.id)) {
        return prev.filter((entry) => entry.id !== task.id);
      }
      return [...prev, task];
    });
  }, []);

  const clearTasks = React.useCallback(() => {
    setSelectedTasks([]);
  }, []);

  const openDialog = React.useCallback(() => {
    setDialogOpen(true);
  }, []);

  const closeDialog = React.useCallback(() => {
    setDialogOpen(false);
  }, []);

  const value = React.useMemo<JiraExportContextValue>(
    () => ({
      selectedTasks,
      selectedCount: selectedTasks.length,
      dialogOpen,
      isSelected: (taskId: string) => selectedTaskIds.has(taskId),
      addTask,
      addTasks,
      syncTasks,
      removeTask,
      toggleTask,
      clearTasks,
      openDialog,
      closeDialog,
    }),
    [
      addTask,
      addTasks,
      clearTasks,
      closeDialog,
      dialogOpen,
      openDialog,
      removeTask,
      selectedTaskIds,
      selectedTasks,
      syncTasks,
      toggleTask,
    ]
  );

  return (
    <JiraExportContext.Provider value={value}>
      {children}
    </JiraExportContext.Provider>
  );
}

export function useJiraExport() {
  const context = React.useContext(JiraExportContext);
  if (!context) {
    throw new Error("useJiraExport must be used within JiraExportProvider");
  }
  return context;
}
