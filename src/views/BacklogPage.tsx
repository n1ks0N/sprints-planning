import * as React from "react";
import {
  Paper,
  Typography,
  Stack,
  Box,
  TextField,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Autocomplete,
  Button,
  Tooltip,
  Divider,
  InputBase,
  CircularProgress,
  FormControl,
  InputLabel,
  FormHelperText,
  Select,
  MenuItem,
} from "@mui/material";
import {
  Add,
  Delete,
  ContentCopy,
  ArrowBack,
  ArrowForward,
  Star,
  StarBorder,
  ArrowUpward,
  ArrowDownward,
  DragIndicator,
} from "@mui/icons-material";
import moment from "moment";
import "moment/locale/ru";

import {
  api,
  useGetParticipantsQuery,
  useGetQuartersQuery,
  useGetSprintsQuery,
  useGetTasksQuery,
  useAddTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useUpsertTaskAllocationMutation,
  useUpsertTaskAllocationBulkMutation,
  useGetReleasesQuery,
} from "../app/api";
import type {
  BacklogItem,
  Participant,
  Sprint,
  TaskPriority,
  Quarter,
  TaskStatus,
} from "../types";
import { setBacklogFilters } from "../app/uiSlice";
import { useAppDispatch, useAppSelector } from "./hooks";
import FilterAutocomplete from "../components/filters/FilterAutocomplete";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragOverlay,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

moment.locale("ru");

function byEnd(a: Sprint, b: Sprint) {
  return a.endDate.localeCompare(b.endDate);
}

function toInt(n: number) {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function isISOWithin(iso: string, startISO: string, endISO: string) {
  return iso >= startISO && iso <= endISO;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function shallowArrayEqual<T>(a: readonly T[], b: readonly T[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Упрощённый редактируемый текст: внешнее состояние обновляется только при завершении редактирования (blur) */
type EditableTextProps = {
  value: string;
  onCommit?: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  sx?: any;
  isEditing?: boolean;
  onStartEditing?: () => void;
  onStopEditing?: () => void;
  multiline?: boolean;
  minRows?: number;
  maxRows?: number;
  displaySx?: any;
  inputSx?: any;
};

const EditableText = React.memo(function EditableText({
  value,
  onCommit,
  onBlur,
  placeholder,
  sx,
  isEditing,
  onStartEditing,
  onStopEditing,
  multiline,
  minRows,
  maxRows,
  displaySx,
  inputSx,
}: EditableTextProps) {
  const [internalEditing, setInternalEditing] = React.useState(false);
  const editing = isEditing ?? internalEditing;
  const inputId = React.useId();

  // Локальное состояние ввода, не дергающее родителя
  const [inputValue, setInputValue] = React.useState<string>(value ?? "");

  // Когда не редактируем — синхронизируемся с внешним value
  React.useEffect(() => {
    if (!editing) {
      setInputValue(value ?? "");
    }
  }, [value, editing]);

  const handleStart = React.useCallback(() => {
    if (isEditing === undefined) {
      setInternalEditing(true);
    }
    setInputValue(value ?? "");
    onStartEditing?.();
  }, [isEditing, onStartEditing, value]);

  const handleClose = React.useCallback(() => {
    if (!editing) return;
    const finalValue = inputValue ?? "";
    if (isEditing === undefined) {
      setInternalEditing(false);
    }
    onStopEditing?.();
    onCommit?.(finalValue);
    onBlur?.();
  }, [editing, inputValue, isEditing, onCommit, onBlur, onStopEditing]);

  return (
    <>
      {!editing ? (
        <Box
          component="span"
          sx={{
            cursor: "text",
            display: "inline-block",
            minWidth: 8,
            ...sx,
            ...displaySx,
          }}
          onClick={handleStart}
          title="Нажмите, чтобы редактировать"
        >
          {value?.trim() ? (
            value
          ) : (
            <Typography
              component="span"
              color="text.secondary"
              sx={{ fontStyle: "italic" }}
            >
              {placeholder || "—"}
            </Typography>
          )}
        </Box>
      ) : (
        <InputBase
          multiline={multiline}
          minRows={minRows}
          maxRows={maxRows}
          autoFocus
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
          }}
          onBlur={handleClose}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !multiline) {
              (e.currentTarget as HTMLInputElement).blur();
              return;
            }
            if (e.key === "Escape") {
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          sx={{
            px: 0.5,
            borderRadius: 1,
            bgcolor: "background.paper",
            outline: "1px solid",
            outlineColor: "divider",
            fontSize: "inherit",
            lineHeight: "inherit",
            ...sx,
            ...inputSx,
          }}
          inputProps={{
            id: inputId,
            "aria-label": placeholder || "Редактируемое поле",
          }}
        />
      )}
    </>
  );
});
const MemoEditableText = EditableText;

/** Упрощённая редактируемая числовая ячейка */
type EditableNumberCellProps = {
  value: number;
  onChange: (next: number) => void;
  onCommit?: () => void;
  title?: string;
  isEditing?: boolean;
  onStartEditing?: () => void;
  onStopEditing?: () => void;
};

function EditableNumberCell({
  value,
  onChange,
  onCommit,
  title,
  isEditing,
  onStartEditing,
  onStopEditing,
}: EditableNumberCellProps) {
  const [internalEditing, setInternalEditing] = React.useState(false);
  const editing = isEditing ?? internalEditing;
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const prevEditingRef = React.useRef(editing);
  const inputId = React.useId();

  React.useEffect(() => {
    if (editing && !prevEditingRef.current && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    prevEditingRef.current = editing;
  }, [editing]);

  const handleStart = React.useCallback(() => {
    if (isEditing === undefined) {
      setInternalEditing(true);
    }
    onStartEditing?.();
  }, [isEditing, onStartEditing]);

  const handleClose = React.useCallback(() => {
    if (!editing) return;
    if (isEditing === undefined) {
      setInternalEditing(false);
    }
    onStopEditing?.();
    onCommit?.();
  }, [editing, isEditing, onCommit, onStopEditing]);

  if (!editing) {
    return (
      <Box
        sx={{
          minWidth: 48,
          textAlign: "center",
          cursor: "pointer",
        }}
        title={title || "Клик для редактирования"}
        onClick={handleStart}
      >
        <Typography component="span">{toInt(value)}</Typography>
      </Box>
    );
  }

  return (
    <InputBase
      inputRef={inputRef}
      type="number"
      autoFocus
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const v = Number(e.target.value);
        onChange(Number.isFinite(v) ? v : 0);
      }}
      onBlur={handleClose}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      sx={{
        textAlign: "center",
        px: 0.5,
        borderRadius: 1,
        bgcolor: "background.paper",
        outline: "1px solid",
        outlineColor: "divider",
        width: "100%",
      }}
      inputProps={{
        id: inputId,
        name: title || "allocation-value",
        "aria-label": title || "Значение нагрузки",
      }}
    />
  );
}

const LS_STATUS = "backlog.statusMap";
const LS_TASK_ORDER = "backlog.orderMap";
const LS_TASK_QUARTERS = "backlog.quartersMap";

const STATUS_LABEL: Record<TaskStatus, string> = {
  inprogress: "В работе",
  done: "Выполнена",
  notdone: "Не сделана",
  canceled: "Отменена",
  partial: "Частично",
};

const STATUS_COLOR: Record<
  TaskStatus,
  "default" | "success" | "error" | "warning" | "info"
> = {
  inprogress: "default",
  done: "success",
  notdone: "error",
  canceled: "info",
  partial: "warning",
};

const PRIORITY_VALUES: readonly number[] = [1, 2, 3];

type StatusMap = Record<string, TaskStatus>;
type OrderMap = Record<string, number>;

type TaskDraftField = "title" | "description" | "dod" | "customer" | "stream";
type TaskDraftState = Record<string, Partial<Record<TaskDraftField, string>>>;

type DragHandleProps = {
  listeners: any;
  attributes: any;
};

function readLS<T>(key: string, def: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
}

function writeLS<T>(key: string, val: T) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

function deriveTaskQuarters(
  task: BacklogItem,
  allSprints: Sprint[],
  currentQuarterId?: string
): string[] {
  const explicit = Array.isArray((task as any).quarterIds)
    ? ((task as any).quarterIds as string[]).filter(Boolean)
    : [];
  if (explicit.length) return Array.from(new Set(explicit));

  const fromAllocations = new Set<string>();

  if (task.allocations) {
    for (const row of Object.values(task.allocations)) {
      for (const sid of Object.keys(row)) {
        const sprint = allSprints.find((s) => s.id === sid);
        if (sprint) fromAllocations.add(sprint.quarterId);
      }
    }
  }

  if (task.loads) {
    for (const [sid, days] of Object.entries(task.loads)) {
      if (Number(days) > 0) {
        const sprint = allSprints.find((s) => s.id === sid);
        if (sprint) fromAllocations.add(sprint.quarterId);
      }
    }
  }

  if (fromAllocations.size) return Array.from(fromAllocations);
  return currentQuarterId ? [currentQuarterId] : [];
}

type Allocations = Record<string, Record<string, Record<string, number>>>;

export default function BacklogPage() {
  const { data: quarters = [] } = useGetQuartersQuery();
  const { data: participants = [] } = useGetParticipantsQuery();
  const allSprints = useGetSprintsQuery(undefined).data ?? [];
  const { data: releases = [] } = useGetReleasesQuery();
  const quarterIdSet = React.useMemo(
    () => new Set(quarters.map((q) => q.id)),
    [quarters]
  );

  const currentQ = React.useMemo<Quarter | undefined>(() => {
    const today = todayISO();
    return quarters.find((q) => isISOWithin(today, q.startDate, q.endDate));
  }, [quarters]);

  const dispatch = useAppDispatch();
  const {
    priorityFilter,
    streamFilter,
    statusFilter,
    releaseSprintFilter,
    selectedQuarterIds,
  } = useAppSelector((s) => s.ui.backlog);

  const [isQuarterPending, startQuarterTransition] = React.useTransition();

  React.useEffect(() => {
    if (!quarters.length) return;
    if (selectedQuarterIds.length === 0 && currentQ) {
      dispatch(setBacklogFilters({ selectedQuarterIds: [currentQ.id] }));
    }
  }, [quarters, currentQ, selectedQuarterIds.length, dispatch]);

  const sprintById = React.useMemo(() => {
    const m = new Map<string, Sprint>();
    allSprints.forEach((s) => m.set(s.id, s));
    return m;
  }, [allSprints]);

  const sprintsGlobalOrdered = React.useMemo(
    () => allSprints.slice().sort(byEnd),
    [allSprints]
  );

  const sprintsByQuarter = React.useMemo(() => {
    const m = new Map<string, Sprint[]>();
    for (const s of sprintsGlobalOrdered) {
      if (!m.has(s.quarterId)) {
        m.set(s.quarterId, []);
      }
      m.get(s.quarterId)!.push(s);
    }
    return m;
  }, [sprintsGlobalOrdered]);

  const quartersSorted = React.useMemo(
    () =>
      quarters.slice().sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [quarters]
  );

  const defaultQuarterId = React.useMemo(() => {
    const selectedFirst = selectedQuarterIds.find((id) => quarterIdSet.has(id));
    if (selectedFirst) return selectedFirst;
    if (currentQ && quarterIdSet.has(currentQ.id)) return currentQ.id;
    return quartersSorted[0]?.id ?? "";
  }, [selectedQuarterIds, currentQ, quartersSorted, quarterIdSet]);

  const participantMap = React.useMemo(() => {
    const m = new Map<string, Participant>();
    participants.forEach((p) => m.set(p.id, p));
    return m;
  }, [participants]);

  const applyTaskOrderOptimistic = React.useCallback(
    (orderedIds: string[]) =>
      dispatch(
        api.util.updateQueryData("getTasks", undefined, (draft) => {
          const byId = new Map(draft.map((t) => [t.id, t]));
          const seen = new Set<string>();

          const reordered = orderedIds
            .map((id) => {
              const item = byId.get(id);
              if (item) seen.add(id);
              return item;
            })
            .filter(Boolean) as BacklogItem[];

          const untouched = draft.filter((t) => !seen.has(t.id));
          draft.splice(0, draft.length, ...reordered, ...untouched);
        })
      ),
    [dispatch]
  );

  const applyParticipantOrderOptimistic = React.useCallback(
    (taskId: string, participantIds: string[]) =>
      dispatch(
        api.util.updateQueryData("getTasks", undefined, (draft) => {
          const task = draft.find((t) => t.id === taskId);
          if (task) {
            task.participantIds = participantIds.slice();
          }
        })
      ),
    [dispatch]
  );

  const { data: allTasks = [], isFetching } = useGetTasksQuery(undefined);

  const [statusMap, setStatusMap] = React.useState<StatusMap>(() =>
    readLS<StatusMap>(LS_STATUS, {})
  );
  const [orderMap, setOrderMap] = React.useState<OrderMap>(() =>
    readLS<OrderMap>(LS_TASK_ORDER, {})
  );
  const [taskQuartersMap, setTaskQuartersMap] = React.useState<
    Record<string, string[]>
  >(() => readLS<Record<string, string[]>>(LS_TASK_QUARTERS, {}));

  const [allocations, setAllocations] = React.useState<Allocations>({});
  const [taskDrafts, setTaskDrafts] = React.useState<TaskDraftState>({});
  const [editingFields, setEditingFields] = React.useState<
    Record<string, boolean>
  >({});

  const [participantOrders, setParticipantOrders] = React.useState<
    Record<string, string[]>
  >({});

  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);

  const [newTaskQuarterId, setNewTaskQuarterId] = React.useState<string>("");
  const [addTaskQuarterError, setAddTaskQuarterError] = React.useState(false);

  const taskUpdateTimers = React.useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());

  const setFieldEditing = React.useCallback((key: string, on: boolean) => {
    setEditingFields((prev) => {
      const alreadyOn = !!prev[key];
      if (alreadyOn === on) return prev;
      const next = { ...prev };
      if (on) next[key] = true;
      else delete next[key];
      return next;
    });
  }, []);

  const isFieldEditing = React.useCallback(
    (key: string) => !!editingFields[key],
    [editingFields]
  );

  React.useEffect(() => {
    const validSelected = selectedQuarterIds.filter((id) =>
      quarterIdSet.has(id)
    );
    if (
      selectedQuarterIds.length > 0 &&
      validSelected.length !== selectedQuarterIds.length
    ) {
      dispatch(setBacklogFilters({ selectedQuarterIds: validSelected }));
    }
  }, [selectedQuarterIds, quarterIdSet, dispatch]);

  React.useEffect(() => {
    setNewTaskQuarterId((prev) => {
      const prevValid = prev && quarterIdSet.has(prev) ? prev : "";
      if (prevValid) return prevValid;
      const fromSelected = selectedQuarterIds.find((id) =>
        quarterIdSet.has(id)
      );
      if (fromSelected) return fromSelected;
      if (defaultQuarterId && quarterIdSet.has(defaultQuarterId)) {
        return defaultQuarterId;
      }
      return "";
    });
  }, [quarterIdSet, selectedQuarterIds, defaultQuarterId]);

  React.useEffect(() => {
    if (!allTasks.length) return;

    const taskMap = new Map(allTasks.map((t) => [t.id, t]));

    // синхронизация кварталов задач
    setTaskQuartersMap((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const t of allTasks) {
        if (!next[t.id] || next[t.id].length === 0) {
          const derived = deriveTaskQuarters(
            t,
            allSprints,
            selectedQuarterIds[0] || currentQ?.id
          );
          if (derived.length) {
            next[t.id] = derived;
            changed = true;
          }
        }
      }

      Object.keys(next).forEach((id) => {
        if (!taskMap.has(id)) {
          delete next[id];
          changed = true;
        }
      });

      return changed ? next : prev;
    });

    // зачистка/синхронизация черновиков текстовых полей
    setTaskDrafts((prev) => {
      const entries = Object.entries(prev);
      if (!entries.length) return prev;

      let changed = false;
      const next: TaskDraftState = {};

      for (const [taskId, draft] of entries) {
        const task = taskMap.get(taskId);
        if (!task) {
          changed = true;
          continue;
        }

        const cleaned: Partial<Record<TaskDraftField, string>> = {};
        let hasDifference = false;

        for (const key of Object.keys(draft) as TaskDraftField[]) {
          const value = draft[key];
          if (value === undefined) continue;

          const originalRaw = (task as any)[key];
          const original = typeof originalRaw === "string" ? originalRaw : "";

          if (value !== original) {
            cleaned[key] = value;
            hasDifference = true;
          } else {
            changed = true;
          }
        }

        if (hasDifference) {
          next[taskId] = cleaned;
          if (Object.keys(cleaned).length !== Object.keys(draft).length) {
            changed = true;
          }
        } else if (draft && Object.keys(draft).length) {
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [allTasks, allSprints, selectedQuarterIds, currentQ]);

  React.useEffect(() => {
    setAllocations((prev) => {
      const next: Allocations = { ...prev };
      for (const t of allTasks) {
        const taskAllocations: Record<string, Record<string, number>> = next[
          t.id
        ] ?? (next[t.id] = {});
        const pids = t.participantIds || [];

        Object.keys(taskAllocations).forEach((pid) => {
          if (!pids.includes(pid)) delete taskAllocations[pid];
        });

        for (const pid of pids) {
          const participantAllocations: Record<string, number> =
            taskAllocations[pid] ?? (taskAllocations[pid] = {});
          for (const s of allSprints) {
            const existing = participantAllocations[s.id];
            const incoming = t.allocations?.[pid]?.[s.id];
            const value = Number(incoming ?? existing ?? 0) || 0;
            participantAllocations[s.id] = value;
          }
        }
      }
      return next;
    });
  }, [allTasks, allSprints]);

  React.useEffect(() => {
    setParticipantOrders((prev) => {
      const next = { ...prev } as Record<string, string[]>;
      for (const task of allTasks) {
        const ids = task.participantIds || [];
        const existing = next[task.id];
        if (!existing) {
          next[task.id] = ids.slice();
          continue;
        }
        const kept = existing.filter((id) => ids.includes(id));
        const added = ids.filter((id) => !kept.includes(id));
        next[task.id] = [...kept, ...added];
      }
      return next;
    });
  }, [allTasks]);

  React.useEffect(() => {
    const taskIds = new Set(allTasks.map((t) => t.id));
    const participantIds = new Set(participants.map((p) => p.id));
    const sprintIds = new Set(allSprints.map((s) => s.id));

    setEditingFields((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) {
        if (key.startsWith("alloc:")) {
          const [, taskId, pid, sid] = key.split(":");
          if (taskId && pid && sid) {
            if (
              taskIds.has(taskId) &&
              participantIds.has(pid) &&
              sprintIds.has(sid)
            ) {
              next[key] = true;
            } else {
              changed = true;
            }
          }
          continue;
        }
        if (
          key.startsWith("title:") ||
          key.startsWith("desc:") ||
          key.startsWith("dod:")
        ) {
          const [, taskId] = key.split(":");
          if (taskId && taskIds.has(taskId)) {
            next[key] = true;
          } else {
            changed = true;
          }
          continue;
        }
        next[key] = true;
      }
      return changed ? next : prev;
    });
  }, [allTasks, allSprints, participants]);

  React.useEffect(() => writeLS(LS_STATUS, statusMap), [statusMap]);
  React.useEffect(() => writeLS(LS_TASK_ORDER, orderMap), [orderMap]);
  React.useEffect(
    () => writeLS(LS_TASK_QUARTERS, taskQuartersMap),
    [taskQuartersMap]
  );

  React.useEffect(() => {
    return () => {
      taskUpdateTimers.current.forEach((timer) => clearTimeout(timer));
      taskUpdateTimers.current.clear();
    };
  }, []);

  const streamOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const t of allTasks) if (t.stream?.trim()) s.add(t.stream.trim());
    return Array.from(s).sort();
  }, [allTasks]);

  const customerOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const t of allTasks) if (t.customer?.trim()) s.add(t.customer.trim());
    return Array.from(s).sort();
  }, [allTasks]);

  const getTaskQuarters = React.useCallback(
    (task: BacklogItem): string[] => {
      const fromMap = taskQuartersMap[task.id];
      if (fromMap && fromMap.length) return fromMap;
      const derived = deriveTaskQuarters(
        task,
        allSprints,
        selectedQuarterIds[0] || currentQ?.id
      );
      if (derived.length) return derived;
      return quartersSorted.map((q) => q.id);
    },
    [taskQuartersMap, allSprints, selectedQuarterIds, currentQ, quartersSorted]
  );

  const updateTaskQuarters = React.useCallback(
    (taskId: string, quartersIds: string[]) => {
      const unique = Array.from(new Set(quartersIds.filter(Boolean)));
      if (!unique.length) return;
      setTaskQuartersMap((prev) => ({ ...prev, [taskId]: unique }));
    },
    []
  );

  const quarterFilterOptions = React.useMemo(
    () =>
      quarters
        .slice()
        .sort((a, b) => a.endDate.localeCompare(b.endDate))
        .map((q) => ({ value: q.id, label: q.name })),
    [quarters]
  );

  const priorityOptions = React.useMemo(
    () =>
      PRIORITY_VALUES.map((p) => ({
        value: String(p),
        label: String(p),
      })),
    []
  );

  const statusOptions = React.useMemo(
    () =>
      (Object.keys(STATUS_LABEL) as TaskStatus[]).map((st) => ({
        value: st,
        label: STATUS_LABEL[st],
      })),
    []
  );

  const promReleases: { id: string; promDate: string }[] = React.useMemo(
    () =>
      releases
        .map((r: any) => ({
          id: String(r.id ?? r.promId ?? r.promDate),
          promDate: String(r.promDate || r.prom || r.date || ""),
        }))
        .filter((x) => x.promDate),
    [releases]
  );

  const releaseFilterOptions = React.useMemo(() => {
    const dates = Array.from(
      new Set(promReleases.map((r) => r.promDate).filter(Boolean))
    );
    return dates
      .sort((a, b) => a.localeCompare(b))
      .map((iso) => ({
        value: iso,
        label: moment(iso).format("DD.MM.YYYY"),
      }));
  }, [promReleases]);

  const handleQuarterFilterChange = React.useCallback(
    (ids: string[]) => {
      const existing = new Set(quarters.map((q) => q.id));
      const filtered = ids.filter((id) => existing.has(id));
      const unique = Array.from(new Set(filtered));
      if (shallowArrayEqual(unique, selectedQuarterIds)) return;
      startQuarterTransition(() => {
        dispatch(setBacklogFilters({ selectedQuarterIds: unique }));
      });
    },
    [quarters, selectedQuarterIds, startQuarterTransition, dispatch]
  );

  const handlePriorityFilterChange = React.useCallback(
    (values: string[]) => {
      const unique = Array.from(new Set(values));
      const next = unique
        .map((v) => Number(v))
        .filter((n): n is number => PRIORITY_VALUES.includes(n));
      if (shallowArrayEqual(next, priorityFilter)) return;
      dispatch(setBacklogFilters({ priorityFilter: next }));
    },
    [dispatch, priorityFilter]
  );

  const handleStatusFilterChange = React.useCallback(
    (values: string[]) => {
      const next = Array.from(new Set(values)) as TaskStatus[];
      if (shallowArrayEqual(next, statusFilter)) return;
      dispatch(setBacklogFilters({ statusFilter: next }));
    },
    [dispatch, statusFilter]
  );

  const handleReleaseFilterChange = React.useCallback(
    (value: string) => {
      const normalized = (value || "").trim() || "all";
      if (normalized !== releaseSprintFilter) {
        dispatch(setBacklogFilters({ releaseSprintFilter: normalized }));
      }
    },
    [dispatch, releaseSprintFilter]
  );

  const getStatusForTask = (taskId: string): TaskStatus =>
    statusMap[taskId] || "inprogress";

  const filteredTasks = React.useMemo(() => {
    const passesQuarterFilter = (task: BacklogItem): boolean => {
      const taskQuarterIds = getTaskQuarters(task);
      if (selectedQuarterIds.length === 0) return true;
      if (!taskQuarterIds.length) return true;
      return taskQuarterIds.some((q) => selectedQuarterIds.includes(q));
    };

    const byQuarters = allTasks.filter(passesQuarterFilter);

    const byPriority =
      priorityFilter.length === 0
        ? byQuarters
        : byQuarters.filter((t) => priorityFilter.includes(Number(t.priority)));

    const byStream = streamFilter.trim()
      ? byPriority.filter((t) =>
          (t.stream || "").toLowerCase().includes(streamFilter.toLowerCase())
        )
      : byPriority;

    const byRelease =
      releaseSprintFilter === "all" || releaseSprintFilter.trim() === ""
        ? byStream
        : byStream.filter((t) => {
            const rel = (t.releaseDate || "").trim();
            return rel === releaseSprintFilter.trim();
          });

    const byStatus =
      statusFilter.length === 0
        ? byRelease
        : byRelease.filter((t) => {
            const st = getStatusForTask(t.id);
            return statusFilter.includes(st);
          });

    const withOrder = byStatus.slice().sort((a, b) => {
      const oa = orderMap[a.id] ?? Number.MAX_SAFE_INTEGER;
      const ob = orderMap[b.id] ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });

    return withOrder;
  }, [
    allTasks,
    selectedQuarterIds,
    priorityFilter,
    streamFilter,
    releaseSprintFilter,
    statusFilter,
    orderMap,
    getTaskQuarters,
  ]);

  const deferredFilteredTasks = React.useDeferredValue(filteredTasks);
  const isTasksPending = deferredFilteredTasks !== filteredTasks;
  const isUiPending = isQuarterPending || isTasksPending;

  const [addTask] = useAddTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [upsertTaskAllocation] = useUpsertTaskAllocationMutation();
  const [upsertTaskAllocationBulk] = useUpsertTaskAllocationBulkMutation();

  const cancelTaskUpdate = React.useCallback(
    (taskId: string, field: TaskDraftField) => {
      const key = `${taskId}:${field}`;
      const timers = taskUpdateTimers.current;
      const existing = timers.get(key);
      if (existing) {
        clearTimeout(existing);
        timers.delete(key);
      }
    },
    []
  );

  const scheduleTaskUpdate = React.useCallback(
    (taskId: string, field: TaskDraftField, value: string) => {
      const key = `${taskId}:${field}`;
      const timers = taskUpdateTimers.current;
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);

      const timeout = setTimeout(() => {
        updateTask({ id: taskId, [field]: value })
          .unwrap()
          .catch((err) => {
            console.error("Failed to update task", err);
          });
        timers.delete(key);
      }, 400);

      timers.set(key, timeout);
    },
    [updateTask]
  );

  const stageTaskField = React.useCallback(
    (task: BacklogItem, key: TaskDraftField, value: string) => {
      const sanitized = value ?? "";
      const originalRaw = (task as any)[key];
      const original = typeof originalRaw === "string" ? originalRaw : "";

      setTaskDrafts((prev) => {
        const next = { ...prev } as TaskDraftState;

        if (sanitized === original) {
          cancelTaskUpdate(task.id, key);
          const current = next[task.id];
          if (!current || current[key] === undefined) {
            return prev;
          }
          const rest = { ...current };
          delete rest[key];
          if (Object.keys(rest).length === 0) {
            delete next[task.id];
          } else {
            next[task.id] = rest;
          }
          return next;
        }

        next[task.id] = { ...(next[task.id] ?? {}), [key]: sanitized };
        return next;
      });
    },
    [cancelTaskUpdate]
  );

  const resolveTaskFieldValue = React.useCallback(
    (task: BacklogItem, key: TaskDraftField) => {
      const draftValue = taskDrafts[task.id]?.[key];
      if (draftValue !== undefined) return draftValue;
      const originalRaw = (task as any)[key];
      return typeof originalRaw === "string" ? originalRaw : "";
    },
    [taskDrafts]
  );

  const commitTaskField = React.useCallback(
    (task: BacklogItem, key: TaskDraftField, directValue?: string) => {
      const value =
        directValue !== undefined
          ? directValue
          : (() => {
              const draftValue = taskDrafts[task.id]?.[key];
              if (draftValue !== undefined) return draftValue;
              const originalRaw = (task as any)[key];
              return typeof originalRaw === "string" ? originalRaw : "";
            })();

      const originalRaw = (task as any)[key];
      const original = typeof originalRaw === "string" ? originalRaw : "";
      if (value === original) return;
      scheduleTaskUpdate(task.id, key, value);
    },
    [scheduleTaskUpdate, taskDrafts]
  );

  const detectSprintByDate = (iso?: string): string | undefined => {
    if (!iso) return undefined;
    const found = allSprints.find((s) =>
      isISOWithin(iso, s.startDate, s.endDate)
    );
    return found?.id;
  };

  const createTask = async (quarterId?: string) => {
    const created = await addTask({
      title: "Новая задача",
      description: "",
      dod: "",
      priority: 1 as TaskPriority,
      customer: "",
      stream: "",
      participantIds: [],
      releaseDate: "",
      releaseSprintId: "",
    }).unwrap();

    setAllocations((prev) => ({ ...prev, [created.id]: {} }));
    if (quarterId) {
      setTaskQuartersMap((prev) => ({ ...prev, [created.id]: [quarterId] }));
    }
  };

  const handleConfirmAddTask = async () => {
    if (!newTaskQuarterId) {
      setAddTaskQuarterError(true);
      return;
    }
    setAddTaskQuarterError(false);
    try {
      await createTask(newTaskQuarterId);
    } catch (error) {
      console.error("Не удалось создать задачу", error);
    }
  };

  const duplicateTask = async (task: BacklogItem) => {
    const copy = await addTask({
      title: `${task.title} (копия)`,
      description: (task as any).description,
      dod: task.dod,
      priority: task.priority,
      customer: task.customer,
      stream: task.stream,
      participantIds: task.participantIds.slice(),
      releaseDate: task.releaseDate,
      releaseSprintId: task.releaseSprintId,
    }).unwrap();

    const rows = allocations[task.id] || {};
    const ops: Promise<any>[] = [];

    for (const pid of Object.keys(rows)) {
      const row = rows[pid] || {};
      for (const sid of Object.keys(row)) {
        const val = toInt(Number(row[sid] || 0));
        if (val > 0) {
          ops.push(
            upsertTaskAllocation({
              taskId: copy.id,
              participantId: pid,
              sprintId: sid,
              days: val,
            }).unwrap()
          );
        }
      }
    }

    try {
      await Promise.all(ops);
    } catch {
      // ignore
    }

    setOrderMap((prev) => {
      const base = prev[task.id] ?? Date.now();
      return { ...prev, [copy.id]: base + 1 };
    });
  };

  const removeTask = async (t: BacklogItem) => {
    if (!window.confirm(`Удалить задачу «${t.title}»?`)) return;
    await deleteTask({ id: t.id }).unwrap();

    setAllocations((prev) => {
      const copy = { ...prev };
      delete copy[t.id];
      return copy;
    });
    setStatusMap((prev) => {
      const copy = { ...prev };
      delete copy[t.id];
      return copy;
    });
    setOrderMap((prev) => {
      const copy = { ...prev };
      delete copy[t.id];
      return copy;
    });
  };

  const updateField = async (t: BacklogItem, patch: Partial<BacklogItem>) => {
    await updateTask({ id: t.id, ...patch }).unwrap();
  };

  const commitCell = async (
    taskId: string,
    participantId: string,
    sprintId: string
  ) => {
    const v = allocations[taskId]?.[participantId]?.[sprintId] ?? 0;
    try {
      await upsertTaskAllocation({
        taskId,
        participantId,
        sprintId,
        days: toInt(Number(v) || 0),
      }).unwrap();
    } catch (e) {
      console.error("Failed to save allocation", e);
    }
  };

  const addParticipantToTask = (task: BacklogItem, pid: string) => {
    if (!pid) return;
    if (task.participantIds?.includes(pid)) return;

    updateField(task, { participantIds: [...task.participantIds, pid] });

    setParticipantOrders((prev) => ({
      ...prev,
      [task.id]: [...(prev[task.id] || task.participantIds), pid],
    }));

    setAllocations((prev) => {
      const copy = { ...prev };
      if (!copy[task.id]) copy[task.id] = {};
      copy[task.id] = { ...copy[task.id], [pid]: {} };
      for (const s of allSprints) copy[task.id][pid][s.id] = 0;
      return copy;
    });
  };

  const removeParticipantFromTask = async (task: BacklogItem, pid: string) => {
    setAllocations((prev) => {
      const copy = { ...prev };
      if (copy[task.id]) {
        const rows = { ...copy[task.id] };
        delete rows[pid];
        copy[task.id] = rows;
      }
      return copy;
    });

    setParticipantOrders((prev) => {
      const next = { ...prev };
      if (next[task.id]) {
        next[task.id] = next[task.id].filter((id) => id !== pid);
      }
      return next;
    });

    const patch: Partial<BacklogItem> = {
      participantIds: task.participantIds.filter((x) => x !== pid),
    };
    if ((task as any).leaderId === pid) {
      (patch as any).leaderId = "";
    }

    try {
      await updateField(task, patch);
    } catch (error) {
      console.error("Failed to remove participant from task", error);
    }
  };

  const shiftRow = (
    taskId: string,
    participantId: string,
    dir: "left" | "right"
  ) => {
    const row = allocations[taskId]?.[participantId] || {};
    const ids = sprintsGlobalOrdered.map((s) => s.id);
    if (!ids.length) return;

    const next: Record<string, number> = {};

    for (let i = 0; i < ids.length; i++) {
      const fromSid = ids[i];
      const targetIdx = dir === "left" ? i - 1 : i + 1;
      const targetSid =
        targetIdx >= 0 && targetIdx < ids.length ? ids[targetIdx] : fromSid;
      const val = Number(row[fromSid] || 0);
      next[targetSid] = (next[targetSid] || 0) + val;
    }

    setAllocations((prev) => {
      const cp = { ...prev };
      if (!cp[taskId]) cp[taskId] = {};
      cp[taskId] = { ...cp[taskId], [participantId]: next };
      return cp;
    });

    (async () => {
      try {
        const bulkAllocations = ids.reduce<Record<string, number>>(
          (acc, sid) => {
            acc[sid] = toInt(Number(next[sid] || 0));
            return acc;
          },
          {}
        );
        await upsertTaskAllocationBulk({
          taskId,
          participantId,
          allocations: bulkAllocations,
        }).unwrap();
      } catch (error) {
        console.error("Failed to bulk save allocations", error);
      }
    })();
  };

  const copyRowToNextQuarter = (taskId: string, participantId: string) => {
    const row = allocations[taskId]?.[participantId] || {};
    if (!Object.keys(row).length) return;

    const quartersWithLoad = new Set<string>();
    for (const [sid, days] of Object.entries(row)) {
      if (Number(days) > 0) {
        const sprint = sprintById.get(sid);
        if (sprint) quartersWithLoad.add(sprint.quarterId);
      }
    }
    if (!quartersWithLoad.size) return;

    let srcQuarterIndex = -1;
    for (let i = 0; i < quartersSorted.length; i++) {
      if (quartersWithLoad.has(quartersSorted[i].id)) {
        srcQuarterIndex = i;
      }
    }
    if (srcQuarterIndex < 0 || srcQuarterIndex >= quartersSorted.length - 1) {
      return;
    }

    const srcQuarter = quartersSorted[srcQuarterIndex];
    const dstQuarter = quartersSorted[srcQuarterIndex + 1];

    const srcSprints = sprintsByQuarter.get(srcQuarter.id) || [];
    const dstSprints = sprintsByQuarter.get(dstQuarter.id) || [];
    if (!srcSprints.length || !dstSprints.length) return;

    const maxLen = Math.min(srcSprints.length, dstSprints.length);
    const nextRow: Record<string, number> = { ...row };

    for (let i = 0; i < maxLen; i++) {
      const srcSid = srcSprints[i].id;
      const dstSid = dstSprints[i].id;
      const val = Number(row[srcSid] || 0);
      if (val > 0) {
        nextRow[dstSid] = (nextRow[dstSid] || 0) + val;
      }
    }

    setAllocations((prev) => {
      const cp = { ...prev };
      if (!cp[taskId]) cp[taskId] = {};
      cp[taskId] = { ...cp[taskId], [participantId]: nextRow };
      return cp;
    });

    (async () => {
      try {
        const bulkAllocations = Object.entries(nextRow).reduce<
          Record<string, number>
        >((acc, [sid, days]) => {
          acc[sid] = toInt(Number(days) || 0);
          return acc;
        }, {});
        await upsertTaskAllocationBulk({
          taskId,
          participantId,
          allocations: bulkAllocations,
        }).unwrap();
      } catch (error) {
        console.error("Failed to copy allocations to next quarter", error);
      }
    })();
  };

  const moveTask = (id: string, dir: "up" | "down") => {
    const current = filteredTasks.map((t) => t.id);
    const idx = current.indexOf(id);
    if (idx < 0) return;
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= current.length) return;
    const A = current[idx];
    const B = current[swapIdx];

    setOrderMap((prev) => {
      const pa = prev[A] ?? idx;
      const pb = prev[B] ?? swapIdx;
      return { ...prev, [A]: pb, [B]: pa };
    });

    const reordered = arrayMove(current, idx, swapIdx);
    applyTaskOrderOptimistic(reordered);
  };

  const taskSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );
  const participantSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const activeTask = React.useMemo(
    () => deferredFilteredTasks.find((t) => t.id === activeTaskId) || null,
    [activeTaskId, deferredFilteredTasks]
  );

  const handleTaskDragStart = React.useCallback((event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
  }, []);

  const handleTaskDragCancel = React.useCallback(() => {
    setActiveTaskId(null);
  }, []);

  const handleTaskDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTaskId(null);
      if (!over || active.id === over.id) return;

      const currentIds = deferredFilteredTasks.map((t) => t.id);
      const oldIndex = currentIds.indexOf(String(active.id));
      const newIndex = currentIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = arrayMove(currentIds, oldIndex, newIndex);
      setOrderMap((prev) => {
        const next = { ...prev };
        reordered.forEach((id, idx) => {
          next[id] = idx;
        });
        return next;
      });
      applyTaskOrderOptimistic(reordered);
    },
    [applyTaskOrderOptimistic, deferredFilteredTasks]
  );

  const HeaderSprint = ({
    s,
    highlight,
  }: {
    s: Sprint;
    highlight?: boolean;
  }) => (
    <TableCell
      key={s.id}
      align="center"
      sx={{
        minWidth: 110,
        position: "relative",
        bgcolor: highlight ? "warning.light" : undefined,
      }}
    >
      <Box sx={{ fontWeight: 700 }}>
        {moment(s.startDate).format("DD.MM.YYYY")} —{" "}
        {moment(s.endDate).format("DD.MM.YYYY")}
      </Box>
      <Box sx={{ color: "text.secondary" }}>{s.name}</Box>
    </TableCell>
  );

  const SortableTask = ({
    task,
    children,
  }: {
    task: BacklogItem;
    children: (props: DragHandleProps) => React.ReactNode;
  }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: task.id });

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.95 : 1,
    };

    return (
      <Box ref={setNodeRef} style={style} sx={{ width: "100%" }}>
        {children({ attributes, listeners })}
      </Box>
    );
  };

  const SortableParticipantRow = ({
    participant,
    children,
  }: {
    participant: Participant;
    children: (
      props: DragHandleProps,
      style: React.CSSProperties,
      isDragging: boolean,
      setNodeRef: (element: HTMLElement | null) => void
    ) => React.ReactNode;
  }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: participant.id });

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      background: isDragging ? "rgba(0,0,0,0.04)" : undefined,
    };

    return children({ attributes, listeners }, style, isDragging, setNodeRef);
  };

  const renderTaskTable = (task: BacklogItem, dragHandle?: DragHandleProps) => {
    const rows = allocations[task.id] || {};
    const taskQuarterIds = getTaskQuarters(task);

    const allowedSprints = (
      taskQuarterIds.length
        ? sprintsGlobalOrdered.filter((s) =>
            taskQuarterIds.includes(s.quarterId)
          )
        : sprintsGlobalOrdered
    ).slice();

    const taskVisibleSprints =
      selectedQuarterIds.length > 0
        ? allowedSprints.filter((s) => selectedQuarterIds.includes(s.quarterId))
        : allowedSprints;

    const effectiveSprints =
      taskVisibleSprints.length > 0 ? taskVisibleSprints : allowedSprints;

    const orderedParticipantIds =
      participantOrders[task.id] || task.participantIds || [];
    const participantRows: Participant[] = orderedParticipantIds
      .map((id) => participantMap.get(id))
      .filter(Boolean) as Participant[];

    const sumBySprint: Record<string, number> = {};
    for (const s of effectiveSprints) {
      sumBySprint[s.id] = participantRows.reduce((a, p) => {
        const v = Number(rows[p.id]?.[s.id] || 0);
        return a + toInt(v);
      }, 0);
    }

    const st: TaskStatus = getStatusForTask(task.id);
    const leaderPid = (task as any).leaderId || undefined;
    const relISO = task.releaseDate || "";
    const relSprintId = task.releaseSprintId || detectSprintByDate(relISO);
    const titleKey = `title:${task.id}`;
    const descKey = `desc:${task.id}`;
    const dodKey = `dod:${task.id}`;

    const clampedTextSx = {
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical" as const,
      overflow: "hidden",
      wordBreak: "break-word" as const,
    };

    const tooltipContent = (
      <Stack spacing={0.5} sx={{ maxWidth: 360 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Заголовок: {resolveTaskFieldValue(task, "title") || "—"}
        </Typography>
        <Typography variant="body2">
          Описание: {resolveTaskFieldValue(task, "description") || "—"}
        </Typography>
        <Typography variant="body2">
          DOD: {resolveTaskFieldValue(task, "dod") || "—"}
        </Typography>
      </Stack>
    );

    const handleParticipantDragEnd = async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const ids = orderedParticipantIds || [];
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = arrayMove(ids, oldIndex, newIndex);
      const previous = ids.slice();

      const patch = applyParticipantOrderOptimistic(task.id, reordered);
      setParticipantOrders((prev) => ({ ...prev, [task.id]: reordered }));

      try {
        await updateField(task, { participantIds: reordered });
      } catch (error) {
        console.error("Failed to update participant order", error);
        (patch as any).undo?.();
        setParticipantOrders((prev) => ({
          ...prev,
          [task.id]: previous,
        }));
      }
    };

    const availableParticipants = participants.filter(
      (p) => !task.participantIds.includes(p.id)
    );

    const releaseOptions = releaseFilterOptions;
    const allowedReleaseValues = new Set(
      releaseOptions.map((opt) => opt.value)
    );
    const normalizedReleaseValue = allowedReleaseValues.has(relISO)
      ? relISO
      : "";

    return (
      <Paper key={task.id} variant="outlined" sx={{ p: 2 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1 }}
        >
          <Tooltip title={tooltipContent} arrow placement="top-start">
            <Box sx={{ flex: 1, minWidth: 260, cursor: "help" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                <MemoEditableText
                  value={resolveTaskFieldValue(task, "title")}
                  onCommit={(v) => {
                    stageTaskField(task, "title", v);
                    commitTaskField(task, "title", v);
                  }}
                  placeholder="Название"
                  multiline
                  minRows={1}
                  maxRows={4}
                  displaySx={clampedTextSx}
                  inputSx={{ width: "100%" }}
                  isEditing={isFieldEditing(titleKey)}
                  onStartEditing={() => setFieldEditing(titleKey, true)}
                  onStopEditing={() => setFieldEditing(titleKey, false)}
                />
              </Typography>

              <Typography
                variant="body2"
                sx={{ color: "text.secondary", mt: 0.5 }}
              >
                Описание:{" "}
                <MemoEditableText
                  value={resolveTaskFieldValue(task, "description")}
                  onCommit={(v) => {
                    stageTaskField(task, "description", v);
                    commitTaskField(task, "description", v);
                  }}
                  placeholder="Описание"
                  multiline
                  minRows={2}
                  maxRows={6}
                  displaySx={clampedTextSx}
                  inputSx={{ width: "100%" }}
                  isEditing={isFieldEditing(descKey)}
                  onStartEditing={() => setFieldEditing(descKey, true)}
                  onStopEditing={() => setFieldEditing(descKey, false)}
                />
              </Typography>

              <Typography
                variant="body2"
                sx={{ color: "text.secondary", mt: 0.5 }}
              >
                DOD:{" "}
                <MemoEditableText
                  value={resolveTaskFieldValue(task, "dod")}
                  onCommit={(v) => {
                    stageTaskField(task, "dod", v);
                    commitTaskField(task, "dod", v);
                  }}
                  placeholder="Definition of Done"
                  multiline
                  minRows={2}
                  maxRows={6}
                  displaySx={clampedTextSx}
                  inputSx={{ width: "100%" }}
                  isEditing={isFieldEditing(dodKey)}
                  onStartEditing={() => setFieldEditing(dodKey, true)}
                  onStopEditing={() => setFieldEditing(dodKey, false)}
                />
              </Typography>
            </Box>
          </Tooltip>

          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
              alignItems: "center",
              justifyContent: "flex-end",
              minWidth: 320,
            }}
          >
            <TextField
              select
              size="small"
              label="Статус"
              value={st}
              onChange={(e) => {
                const value = e.target.value as TaskStatus;
                setStatusMap((prev) => ({ ...prev, [task.id]: value }));
              }}
              sx={{ minWidth: 180 }}
              SelectProps={{
                renderValue: (value) => {
                  const key = value as TaskStatus;
                  return (
                    <Chip
                      size="small"
                      color={STATUS_COLOR[key]}
                      label={STATUS_LABEL[key]}
                    />
                  );
                },
              }}
            >
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((k) => (
                <MenuItem key={k} value={k}>
                  <Chip
                    size="small"
                    color={STATUS_COLOR[k]}
                    label={STATUS_LABEL[k]}
                  />
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Приоритет"
              value={task.priority}
              onChange={(e) =>
                updateField(task, {
                  priority: Number(e.target.value) as TaskPriority,
                })
              }
              sx={{ minWidth: 120 }}
            >
              <MenuItem value={1}>1</MenuItem>
              <MenuItem value={2}>2</MenuItem>
              <MenuItem value={3}>3</MenuItem>
            </TextField>

            <FilterAutocomplete
              multiple
              allowCustom={false}
              label="Кварталы"
              options={quarterFilterOptions}
              value={taskQuarterIds}
              onChange={(values) => {
                if (!values.length) return;
                updateTaskQuarters(task.id, values);
              }}
              sx={{ minWidth: 200, maxWidth: 240, flexShrink: 0 }}
            />

            <Autocomplete
              size="small"
              freeSolo
              options={customerOptions}
              value={resolveTaskFieldValue(task, "customer")}
              onInputChange={(_, v) =>
                stageTaskField(task, "customer", v || "")
              }
              onBlur={() => commitTaskField(task, "customer")}
              renderInput={(params) => (
                <TextField {...params} label="Заказчик" size="small" />
              )}
              sx={{ minWidth: 180, maxWidth: 240, flexShrink: 0 }}
            />

            <Autocomplete
              size="small"
              freeSolo
              options={streamOptions}
              value={resolveTaskFieldValue(task, "stream")}
              onInputChange={(_, v) => stageTaskField(task, "stream", v || "")}
              onBlur={() => commitTaskField(task, "stream")}
              renderInput={(params) => (
                <TextField {...params} label="Стрим" size="small" />
              )}
              sx={{ minWidth: 180, maxWidth: 220, flexShrink: 0 }}
            />

            <TextField
              select
              size="small"
              label="Релиз (ПРОМ)"
              value={normalizedReleaseValue}
              onChange={(e) => {
                const iso = String(e.target.value) || "";
                const sid = detectSprintByDate(iso) || "";
                updateField(task, {
                  releaseDate: iso,
                  releaseSprintId: sid,
                });
              }}
              sx={{ minWidth: 180, maxWidth: 220, flexShrink: 0 }}
              SelectProps={{ displayEmpty: true }}
            >
              <MenuItem value="">
                <em>—</em>
              </MenuItem>
              {releaseOptions.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>

            <Stack direction="row" spacing={0.5} sx={{ ml: "auto" }}>
              {dragHandle && (
                <Tooltip title="Перетащите, чтобы изменить порядок">
                  <span
                    {...dragHandle.attributes}
                    {...dragHandle.listeners}
                    style={{ display: "inline-flex" }}
                  >
                    <IconButton size="small">
                      <DragIndicator fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}

              <Tooltip title="Дублировать">
                <IconButton size="small" onClick={() => duplicateTask(task)}>
                  <ContentCopy fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Вверх">
                <IconButton
                  size="small"
                  onClick={() => moveTask(task.id, "up")}
                >
                  <ArrowUpward fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Вниз">
                <IconButton
                  size="small"
                  onClick={() => moveTask(task.id, "down")}
                >
                  <ArrowDownward fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Удалить задачу">
                <IconButton size="small" onClick={() => removeTask(task)}>
                  <Delete />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        </Stack>

        <DndContext
          sensors={participantSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleParticipantDragEnd}
        >
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ mt: 1, position: "relative" }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 52 }} />
                  <TableCell sx={{ minWidth: 260 }}>Участник</TableCell>
                  {effectiveSprints.map((s) => (
                    <HeaderSprint
                      key={s.id}
                      s={s}
                      highlight={Boolean(relSprintId && relSprintId === s.id)}
                    />
                  ))}
                  <TableCell align="center" sx={{ minWidth: 100 }}>
                    Итого
                  </TableCell>
                  <TableCell align="right" sx={{ width: 220 }}>
                    Действия
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                <SortableContext
                  items={orderedParticipantIds}
                  strategy={verticalListSortingStrategy}
                >
                  {participantRows.map((p) => {
                    const row = rows[p.id] || {};
                    const rowSum = effectiveSprints.reduce(
                      (acc, s) => acc + toInt(Number(row[s.id] || 0)),
                      0
                    );
                    const isLeader = leaderPid === p.id;

                    return (
                      <SortableParticipantRow key={p.id} participant={p}>
                        {(dragProps, style, isDragging, setNodeRef) => (
                          <TableRow
                            ref={setNodeRef}
                            hover
                            style={style}
                            sx={{ opacity: isDragging ? 0.95 : 1 }}
                          >
                            <TableCell width={52} align="center">
                              <span
                                {...dragProps.attributes}
                                {...dragProps.listeners}
                                style={{
                                  display: "inline-flex",
                                  cursor: "grab",
                                }}
                              >
                                <IconButton size="small">
                                  <DragIndicator fontSize="small" />
                                </IconButton>
                              </span>
                            </TableCell>

                            <TableCell
                              sx={{
                                bgcolor: isLeader ? "warning.light" : undefined,
                              }}
                            >
                              <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                              >
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    updateField(task, {
                                      ...(task as any),
                                      leaderId: leaderPid === p.id ? "" : p.id,
                                    })
                                  }
                                >
                                  {isLeader ? (
                                    <Star fontSize="small" color="warning" />
                                  ) : (
                                    <StarBorder fontSize="small" />
                                  )}
                                </IconButton>
                                <Chip label={p.role} size="small" />
                                <Typography>{p.fullName}</Typography>
                              </Stack>
                            </TableCell>

                            {effectiveSprints.map((s) => {
                              const cellKey = `alloc:${task.id}:${p.id}:${s.id}`;
                              return (
                                <TableCell key={s.id} align="center">
                                  <EditableNumberCell
                                    value={Number(row[s.id] || 0)}
                                    onChange={(v) => {
                                      setAllocations((prev) => {
                                        const copy = { ...prev };
                                        if (!copy[task.id]) copy[task.id] = {};
                                        if (!copy[task.id][p.id])
                                          copy[task.id][p.id] = {};
                                        copy[task.id][p.id][s.id] = v;
                                        return copy;
                                      });
                                    }}
                                    onCommit={() =>
                                      commitCell(task.id, p.id, s.id)
                                    }
                                    isEditing={isFieldEditing(cellKey)}
                                    onStartEditing={() =>
                                      setFieldEditing(cellKey, true)
                                    }
                                    onStopEditing={() =>
                                      setFieldEditing(cellKey, false)
                                    }
                                  />
                                </TableCell>
                              );
                            })}

                            <TableCell align="center" sx={{ fontWeight: 700 }}>
                              {toInt(rowSum)}
                            </TableCell>

                            <TableCell align="right">
                              <Stack
                                direction="row"
                                spacing={0.5}
                                justifyContent="flex-end"
                              >
                                <Tooltip title="Сдвинуть влево (по всем спринтам)">
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      shiftRow(task.id, p.id, "left")
                                    }
                                  >
                                    <ArrowBack fontSize="small" />
                                  </IconButton>
                                </Tooltip>

                                <Tooltip title="Сдвинуть вправо (по всем спринтам)">
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      shiftRow(task.id, p.id, "right")
                                    }
                                  >
                                    <ArrowForward fontSize="small" />
                                  </IconButton>
                                </Tooltip>

                                <Tooltip title="Скопировать нагрузку в следующий квартал">
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      copyRowToNextQuarter(task.id, p.id)
                                    }
                                  >
                                    <Add fontSize="small" />
                                  </IconButton>
                                </Tooltip>

                                <Tooltip title="Удалить участника из задачи">
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      removeParticipantFromTask(task, p.id)
                                    }
                                  >
                                    <Delete fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        )}
                      </SortableParticipantRow>
                    );
                  })}
                </SortableContext>

                <TableRow>
                  <TableCell />
                  <TableCell sx={{ py: 1 }}>
                    <Autocomplete
                      size="small"
                      options={availableParticipants}
                      getOptionLabel={(p) =>
                        p ? `${p.fullName} (${p.role})` : ""
                      }
                      onChange={(_, value) => {
                        if (value) addParticipantToTask(task, value.id);
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size="small"
                          label="Добавить участника"
                          placeholder="Выберите участника"
                        />
                      )}
                      noOptionsText="Свободных участников нет"
                      disabled={availableParticipants.length === 0}
                    />
                  </TableCell>
                  {effectiveSprints.map((s) => (
                    <TableCell key={s.id} />
                  ))}
                  <TableCell />
                  <TableCell />
                </TableRow>

                <TableRow>
                  <TableCell />
                  <TableCell sx={{ fontWeight: 700 }}>
                    Итого по спринтам
                  </TableCell>
                  {effectiveSprints.map((s) => (
                    <TableCell
                      key={s.id}
                      align="center"
                      sx={{ fontWeight: 700 }}
                    >
                      {toInt(sumBySprint[s.id])}
                    </TableCell>
                  ))}
                  <TableCell align="center" sx={{ fontWeight: 700 }}>
                    {toInt(
                      Object.values(sumBySprint).reduce((a, b) => a + b, 0)
                    )}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </DndContext>
      </Paper>
    );
  };

  return (
    <Paper elevation={0} sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
          flexWrap="wrap"
        >
          <Typography variant="h6" sx={{ flexShrink: 0 }}>
            Бэклог
          </Typography>

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
          >
            <FormControl
              size="small"
              sx={{ minWidth: 220 }}
              error={addTaskQuarterError}
              disabled={!quartersSorted.length}
            >
              <InputLabel id="new-task-quarter-label">
                Квартал задачи
              </InputLabel>
              <Select
                labelId="new-task-quarter-label"
                label="Квартал задачи"
                value={newTaskQuarterId}
                onChange={(e) => {
                  setNewTaskQuarterId(String(e.target.value));
                  setAddTaskQuarterError(false);
                }}
              >
                {quartersSorted.map((q) => (
                  <MenuItem key={q.id} value={q.id}>
                    {q.name}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {!quartersSorted.length
                  ? "Сначала добавьте кварталы"
                  : addTaskQuarterError
                  ? "Выберите квартал"
                  : ""}
              </FormHelperText>
            </FormControl>

            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleConfirmAddTask}
              disabled={!newTaskQuarterId}
            >
              Добавить задачу
            </Button>
          </Stack>
        </Stack>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(auto-fit, minmax(220px, 1fr))",
                md: "repeat(auto-fit, minmax(200px, 1fr))",
              },
              gridAutoFlow: "row dense",
              gap: 2,
              alignItems: "center",
            }}
          >
            <FilterAutocomplete
              multiple
              allowCustom={false}
              label="Фильтр по кварталам"
              options={quarterFilterOptions}
              value={selectedQuarterIds}
              onChange={handleQuarterFilterChange}
              sx={{ minWidth: 200 }}
            />

            <FilterAutocomplete
              multiple
              allowCustom={false}
              label="Приоритет"
              options={priorityOptions}
              value={priorityFilter.map(String)}
              onChange={handlePriorityFilterChange}
              sx={{ minWidth: 160 }}
            />

            <FilterAutocomplete
              multiple
              allowCustom={false}
              label="Статусы"
              options={statusOptions}
              value={statusFilter}
              onChange={handleStatusFilterChange}
              sx={{ minWidth: 200 }}
            />

            <FilterAutocomplete
              label="Релиз"
              allowCustom={false}
              options={releaseFilterOptions}
              value={releaseSprintFilter === "all" ? "" : releaseSprintFilter}
              onChange={handleReleaseFilterChange}
              sx={{ minWidth: 200 }}
              placeholder="Все релизы"
            />

            <FilterAutocomplete
              label="Стрим"
              options={streamOptions}
              value={streamFilter}
              onChange={(value) => {
                if (value !== streamFilter) {
                  dispatch(
                    setBacklogFilters({
                      streamFilter: value,
                    })
                  );
                }
              }}
              sx={{ minWidth: 200 }}
            />

            {isUiPending && (
              <Box sx={{ display: "flex", justifyContent: "center" }}>
                <CircularProgress size={18} sx={{ color: "text.secondary" }} />
              </Box>
            )}
          </Box>
        </Paper>

        <DndContext
          sensors={taskSensors}
          collisionDetection={closestCenter}
          onDragStart={handleTaskDragStart}
          onDragEnd={handleTaskDragEnd}
          onDragCancel={handleTaskDragCancel}
        >
          <SortableContext
            items={deferredFilteredTasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <Stack spacing={2}>
              {deferredFilteredTasks.map((t) => (
                <SortableTask key={t.id} task={t}>
                  {(dragHandleProps) => renderTaskTable(t, dragHandleProps)}
                </SortableTask>
              ))}

              {!deferredFilteredTasks.length && !isFetching && (
                <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
                  <Typography color="text.secondary">
                    Нет задач по текущим фильтрам
                  </Typography>
                </Paper>
              )}
            </Stack>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeTask ? (
              <Paper variant="outlined" sx={{ p: 1.5, maxWidth: 960 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <DragIndicator fontSize="small" color="disabled" />
                  <Stack spacing={0.25}>
                    <Typography fontWeight={700}>{activeTask.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {activeTask.stream || "Без стрима"}
                    </Typography>
                  </Stack>
                </Stack>
              </Paper>
            ) : null}
          </DragOverlay>
        </DndContext>

        <Divider />

        <Typography variant="caption" color="text.secondary">
          Все поля редактируются по клику. Нагрузка задаётся в ячейках «участник
          × спринт». Статусы/лидер/порядок/копирование — локально на этой
          странице. Выбор релиза (ПРОМ) автоматически определяет спринт и
          подсвечивает соответствующую колонку. Дополнительно можно сдвигать
          нагрузку по всей сетке или копировать нагрузку участника в следующий
          квартал одной кнопкой.
        </Typography>
      </Stack>
    </Paper>
  );
}
