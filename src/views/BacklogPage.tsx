// src/views/BacklogPage.tsx
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
  Select,
  MenuItem,
  Tooltip,
  Divider,
  InputBase,
  CircularProgress,
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
  Download,
  DragIndicator,
} from "@mui/icons-material";
import moment from "moment";
import "moment/locale/ru";

import {
  useGetParticipantsQuery,
  useGetQuartersQuery,
  useGetSprintsQuery,
  useGetTasksQuery,
  useAddTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useUpsertTaskAllocationMutation,
  useUpsertTaskAllocationBulkMutation,
  useLazyExportExcelQuery,
  // для релизов
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

function byStart(a: Sprint, b: Sprint) {
  return a.startDate.localeCompare(b.startDate);
}
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

/** Инлайн-редактор текста (клик по тексту -> InputBase, «невидимый инпут») */
function EditableText({
  value,
  onChange,
  onBlur,
  placeholder,
  sx,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  sx?: any;
}) {
  const [editing, setEditing] = React.useState(false);
  const ref = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);

  return !editing ? (
    <Box
      component="span"
      sx={{ cursor: "text", display: "inline-block", minWidth: 8, ...sx }}
      onClick={() => setEditing(true)}
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
      inputRef={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        setEditing(false);
        onBlur?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.currentTarget.blur();
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
      }}
    />
  );
}

/** Инлайн-редактор числа (ячейка матрицы) */
function EditableNumberCell({
  value,
  onChange,
  onCommit,
  title,
}: {
  value: number;
  onChange: (next: number) => void;
  onCommit?: () => void;
  title?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const ref = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);

  return (
    <Box
      sx={{
        minWidth: 48,
        textAlign: "center",
        cursor: editing ? "text" : "pointer",
      }}
      title={title || "Клик для редактирования"}
      onClick={() => !editing && setEditing(true)}
    >
      {!editing ? (
        <Typography component="span">{toInt(value)}</Typography>
      ) : (
        <InputBase
          inputRef={ref}
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(Number.isFinite(v) ? v : 0);
          }}
          onBlur={() => {
            setEditing(false);
            onCommit?.();
          }}
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
        />
      )}
    </Box>
  );
}

/** локальное хранение статусов/лидеров/порядка */
const LS_STATUS = "backlog.statusMap";
const LS_TASK_ORDER = "backlog.orderMap";

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

/** allocations[taskId][participantId][sprintId] = days */
type Allocations = Record<string, Record<string, Record<string, number>>>;

export default function BacklogPage() {
  const { data: quarters = [] } = useGetQuartersQuery();
  const { data: participants = [] } = useGetParticipantsQuery();
  const allSprints = useGetSprintsQuery(undefined).data ?? [];
  const { data: releases = [] } = useGetReleasesQuery?.() || { data: [] };

  // вычислим «текущий квартал»
  const currentQ = React.useMemo(() => {
    const today = todayISO();
    return quarters.find((q) => isISOWithin(today, q.startDate, q.endDate));
  }, [quarters]);

  // Фильтр «кварталы»: мультивыбор; по умолчанию текущий, если есть
  const [selectedQuarterIds, setSelectedQuarterIds] = React.useState<string[]>(
    []
  );
  const [isQuarterPending, startQuarterTransition] = React.useTransition();
  React.useEffect(() => {
    if (!quarters.length) return;
    // если пользователь ещё не выбирал — выберем текущий
    if (selectedQuarterIds.length === 0 && currentQ) {
      setSelectedQuarterIds([currentQ.id]);
    }
  }, [quarters, currentQ, selectedQuarterIds.length]);

  // при пустом выборе показываем все спринты; иначе только выбранных кварталов
  const visibleSprints = React.useMemo(() => {
    const list =
      selectedQuarterIds.length === 0
        ? allSprints.slice()
        : allSprints.filter((s) => selectedQuarterIds.includes(s.quarterId));
    return list.sort(byEnd);
  }, [allSprints, selectedQuarterIds]);

  // Карты быстрого доступа
  const sprintById = React.useMemo(() => {
    const m = new Map<string, Sprint>();
    allSprints.forEach((s) => m.set(s.id, s));
    return m;
  }, [allSprints]);
  const participantMap = React.useMemo(() => {
    const m = new Map<string, Participant>();
    participants.forEach((p) => m.set(p.id, p));
    return m;
  }, [participants]);
  const sprintsGlobalOrdered = React.useMemo(
    () => allSprints.slice().sort(byEnd),
    [allSprints]
  );
  const sprintIndexById = React.useMemo(() => {
    const m = new Map<string, number>();
    sprintsGlobalOrdered.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [sprintsGlobalOrdered]);

  const dispatch = useAppDispatch();
  const { priorityFilter, streamFilter, statusFilter, releaseSprintFilter } =
    useAppSelector((s) => s.ui.backlog);

  // Источник задач — всегда берём все, фильтруем на клиенте (т.к. мульти-кварталы)
  const { data: allTasks = [], isFetching } = useGetTasksQuery(undefined);

  React.useEffect(() => {
    if (!allTasks.length) return;
    const taskMap = new Map(allTasks.map((task) => [task.id, task]));
    setTaskDrafts((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next: TaskDraftState = {};
      for (const [taskId, draft] of Object.entries(prev)) {
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
  }, [allTasks]);

  // Локальные статусы/лидеры/порядок
  const [statusMap, setStatusMap] = React.useState<StatusMap>(() =>
    readLS<StatusMap>(LS_STATUS, {})
  );
  const [orderMap, setOrderMap] = React.useState<OrderMap>(() =>
    readLS<OrderMap>(LS_TASK_ORDER, {})
  );
  React.useEffect(() => writeLS(LS_STATUS, statusMap), [statusMap]);
  React.useEffect(() => writeLS(LS_TASK_ORDER, orderMap), [orderMap]);

  // Список всех возможных значений «стрима» и «заказчика» (для автокомплита)
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

  const quarterFilterOptions = React.useMemo(
    () =>
      quarters
        .slice()
        .sort((a, b) => a.endDate.localeCompare(b.endDate))
        .map((q) => ({ value: q.id, label: q.name })),
    [quarters]
  );

  const priorityOptions = React.useMemo(
    () => PRIORITY_VALUES.map((p) => ({ value: String(p), label: String(p) })),
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

  const handleQuarterFilterChange = React.useCallback(
    (ids: string[]) => {
      const existing = new Set(quarters.map((q) => q.id));
      const filtered = ids.filter((id) => existing.has(id));
      const unique = Array.from(new Set(filtered));
      if (shallowArrayEqual(unique, selectedQuarterIds)) return;
      startQuarterTransition(() => {
        setSelectedQuarterIds(unique);
      });
    },
    [quarters, selectedQuarterIds, startQuarterTransition]
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
      const normalized = value?.trim() || "all";
      if (normalized === releaseSprintFilter) return;
      dispatch(setBacklogFilters({ releaseSprintFilter: normalized }));
    },
    [dispatch, releaseSprintFilter]
  );

  // Фильтрация задач
  const filteredTasks = React.useMemo(() => {
    const selectedSprintIds =
      selectedQuarterIds.length === 0
        ? new Set(allSprints.map((s) => s.id))
        : new Set(
            allSprints
              .filter((s) => selectedQuarterIds.includes(s.quarterId))
              .map((s) => s.id)
          );

    // фильтруем по кварталу: задача показывается, если есть нагрузка/распределение В ЛЮБОМ из выбранных спринтов
    const byQuarters = allTasks.filter((t) => {
      if (selectedQuarterIds.length === 0) return true;
      // loads
      const hasLoad =
        t.loads &&
        Object.entries(t.loads).some(
          ([sid, days]) => selectedSprintIds.has(sid) && (Number(days) || 0) > 0
        );
      if (hasLoad) return true;
      // allocations
      if (t.allocations) {
        for (const pid of Object.keys(t.allocations)) {
          const rows = t.allocations[pid];
          if (
            Object.entries(rows).some(
              ([sid, days]) =>
                selectedSprintIds.has(sid) && (Number(days) || 0) > 0
            )
          ) {
            return true;
          }
        }
      }
      // если нагрузок нет — всё равно показываем задачу (пустая), чтобы её можно было заполнить
      return false;
    });

    // приоритет
    const byPriority =
      priorityFilter.length === 0
        ? byQuarters
        : byQuarters.filter((t) => priorityFilter.includes(Number(t.priority)));

    // стрим
    const byStream = streamFilter.trim()
      ? byPriority.filter((t) =>
          (t.stream || "").toLowerCase().includes(streamFilter.toLowerCase())
        )
      : byPriority;

    // релиз (по дате пром)
    const byRelease =
      releaseSprintFilter === "all" || releaseSprintFilter.trim() === ""
        ? byStream
        : byStream.filter((t) => {
            const rel = (t.releaseDate || "").trim();
            return rel === releaseSprintFilter.trim();
          });

    // статус (по локальной карте)
    const byStatus =
      statusFilter.length === 0
        ? byRelease
        : byRelease.filter((t) => {
            const st = statusMap[t.id] || "inprogress";
            return statusFilter.includes(st);
          });

    // порядок (локальный)
    const withOrder = byStatus.slice().sort((a, b) => {
      const oa = orderMap[a.id] ?? Number.MAX_SAFE_INTEGER;
      const ob = orderMap[b.id] ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      // fallback: по дате создания
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });

    return withOrder;
  }, [
    allTasks,
    allSprints,
    selectedQuarterIds,
    priorityFilter,
    streamFilter,
    releaseSprintFilter,
    statusFilter,
    statusMap,
    orderMap,
  ]);

  const deferredFilteredTasks = React.useDeferredValue(filteredTasks);
  const isTasksPending = deferredFilteredTasks !== filteredTasks;
  const isUiPending = isQuarterPending || isTasksPending;

  // Мутации
  const [addTask] = useAddTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [upsertTaskAllocation] = useUpsertTaskAllocationMutation();
  const [upsertTaskAllocationBulk] = useUpsertTaskAllocationBulkMutation();
  const [exportExcel, { isFetching: isExporting }] = useLazyExportExcelQuery();

  const handleExportExcel = React.useCallback(async () => {
    try {
      const blob = await exportExcel().unwrap();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sprints-planning-${moment().format("YYYY-MM-DD")}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Не удалось экспортировать Excel", error);
    }
  }, [exportExcel]);

  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);

  // Локальные allocations (для быстрого редактирования)
  const [allocations, setAllocations] = React.useState<Allocations>({});
  const [taskDrafts, setTaskDrafts] = React.useState<TaskDraftState>({});

  const taskUpdateTimers = React.useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());

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

  React.useEffect(() => {
    return () => {
      taskUpdateTimers.current.forEach((timer) => clearTimeout(timer));
      taskUpdateTimers.current.clear();
    };
  }, []);

  const scheduleTaskUpdate = React.useCallback(
    (taskId: string, field: TaskDraftField, value: string) => {
      const key = `${taskId}:${field}`;
      const timers = taskUpdateTimers.current;
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);

      const timeout = setTimeout(() => {
        updateTask({ id: taskId, [field]: value }).unwrap().catch((err) => {
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
      if (sanitized !== original) {
        scheduleTaskUpdate(task.id, key, sanitized);
      }
    },
    [cancelTaskUpdate, scheduleTaskUpdate]
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
    (task: BacklogItem, key: TaskDraftField) => {
      const draftValue = taskDrafts[task.id]?.[key];
      const value = draftValue ?? resolveTaskFieldValue(task, key);
      const originalRaw = (task as any)[key];
      const original = typeof originalRaw === "string" ? originalRaw : "";
      if (value === original) return;
      scheduleTaskUpdate(task.id, key, value);
    },
    [resolveTaskFieldValue, scheduleTaskUpdate, taskDrafts]
  );

  // Инициализация локальных allocations из задач
  React.useEffect(() => {
    setAllocations(() => {
      const next: Allocations = {};
      for (const t of allTasks) {
        next[t.id] = {};
        const pids = t.participantIds || [];
        if (t.allocations && Object.keys(t.allocations).length) {
          for (const pid of pids) {
            next[t.id][pid] = {};
            for (const s of allSprints) {
              const v = t.allocations?.[pid]?.[s.id] ?? 0;
              next[t.id][pid][s.id] = Number(v) || 0;
            }
          }
        } else {
          // если нет распределения — заполняем нулями
          for (const pid of pids) {
            next[t.id][pid] = {};
            for (const s of allSprints) {
              next[t.id][pid][s.id] = 0;
            }
          }
        }
      }
      return next;
    });
  }, [allTasks, allSprints]);

  // Релизы: приведём к удобному виду (берём именно даты ПРОМ)
  type ReleaseLike = { id: string; promDate: string };
  const promReleases: ReleaseLike[] = React.useMemo(() => {
    if (!releases || !Array.isArray(releases)) return [];
    return releases
      .map((r: any) => ({
        id: String(r.id ?? r.promId ?? r.promDate),
        promDate: String(r.promDate || r.prom || r.date || ""),
      }))
      .filter((x) => x.promDate);
  }, [releases]);

  const releaseFilterOptions = React.useMemo(() => {
    const dates = new Set<string>();
    promReleases.forEach((r) => dates.add(r.promDate));
    allTasks.forEach((t) => {
      const d = t.releaseDate?.trim();
      if (d) dates.add(d);
    });
    return Array.from(dates)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((iso) => ({
        value: iso,
        label: moment(iso).format("DD.MM.YYYY"),
      }));
  }, [allTasks, promReleases]);

  // По дате релиза определить спринт
  const detectSprintByDate = (iso?: string): string | undefined => {
    if (!iso) return undefined;
    const found = allSprints.find((s) =>
      isISOWithin(iso, s.startDate, s.endDate)
    );
    return found?.id;
  };

  // Добавление/копирование задач
  const createTask = async () => {
    const created = await addTask({
      title: "Новая задача",
      description: "",
      dod: "",
      priority: 2 as TaskPriority,
      customer: "",
      stream: "",
      participantIds: [],
      releaseDate: "",
      releaseSprintId: "",
    }).unwrap();
    setAllocations((prev) => ({ ...prev, [created.id]: {} }));
  };

  const duplicateTask = async (task: BacklogItem) => {
    const copy = await addTask({
      title: `${task.title} (копия)`,
      description: task.description,
      dod: task.dod,
      priority: task.priority,
      customer: task.customer,
      stream: task.stream,
      participantIds: task.participantIds.slice(),
      releaseDate: task.releaseDate,
      releaseSprintId: task.releaseSprintId,
    }).unwrap();

    // скопируем распределение
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
    } catch {}
    // подвинем вниз в локальном порядке (следом за исходной)
    setOrderMap((prev) => {
      const base = prev[task.id] ?? Date.now();
      return { ...prev, [copy.id]: base + 1 };
    });
  };

  // Удаление
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

  // Обновление поля задачи
  const updateField = async (t: BacklogItem, patch: Partial<BacklogItem>) => {
    await updateTask({ id: t.id, ...patch }).unwrap();
  };

  // Коммит ячейки распределения
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

  // Добавить/удалить участника в задаче
  const addParticipantToTask = (task: BacklogItem, pid: string) => {
    if (!pid) return;
    if (task.participantIds?.includes(pid)) return;
    updateField(task, { participantIds: [...task.participantIds, pid] });
    setAllocations((prev) => {
      const copy = { ...prev };
      if (!copy[task.id]) copy[task.id] = {};
      copy[task.id] = { ...copy[task.id], [pid]: {} };
      for (const s of allSprints) copy[task.id][pid][s.id] = 0;
      return copy;
    });
  };
  const removeParticipantFromTask = (task: BacklogItem, pid: string) => {
    setAllocations((prev) => {
      const copy = { ...prev };
      if (copy[task.id]) {
        const rows = { ...copy[task.id] };
        delete rows[pid];
        copy[task.id] = rows;
      }
      return copy;
    });
    const patch: Partial<BacklogItem> = {
      participantIds: task.participantIds.filter((x) => x !== pid),
    };
    if (task.leaderId === pid) {
      patch.leaderId = "";
    }
    updateField(task, patch);
  };

  // Сдвиг влево/вправо распределения по спринтам для участника
  const shiftRow = (
    taskId: string,
    participantId: string,
    dir: "left" | "right"
  ) => {
    const row = allocations[taskId]?.[participantId] || {};
    const ids = sprintsGlobalOrdered.map((s) => s.id);
    if (!ids.length) return;
    const n = ids.length;
    const next: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const fromIdx = i;
      const toIdx = dir === "left" ? (i - 1 + n) % n : (i + 1) % n;
      const fromSid = ids[fromIdx];
      const toSid = ids[toIdx];
      const val = Number(row[fromSid] || 0);
      next[toSid] = (next[toSid] || 0) + val;
    }
    setAllocations((prev) => {
      const cp = { ...prev };
      if (!cp[taskId]) cp[taskId] = {};
      cp[taskId] = { ...cp[taskId], [participantId]: next };
      return cp;
    });
    (async () => {
      try {
        const bulkAllocations = ids.reduce<Record<string, number>>((acc, sid) => {
          acc[sid] = toInt(Number(next[sid] || 0));
          return acc;
        }, {});
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

  // Порядок задач локально
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
  };

  const taskSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const participantSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
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
    },
    [deferredFilteredTasks]
  );

  // Визуал заголовка спринта (с подсветкой колонки релиза для конкретной задачи)
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
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
      useSortable({ id: task.id });

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
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
      useSortable({ id: participant.id });

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      background: isDragging ? "rgba(0,0,0,0.04)" : undefined,
    };

    return children({ attributes, listeners }, style, isDragging, setNodeRef);
  };

  // Рендер одной задачи
  const renderTaskTable = (task: BacklogItem, dragHandle?: DragHandleProps) => {
    const rows = allocations[task.id] || {};
    const participantRows: Participant[] = task.participantIds
      .map((id) => participantMap.get(id))
      .filter(Boolean) as Participant[];

    const sumBySprint: Record<string, number> = {};
    for (const s of visibleSprints) {
      sumBySprint[s.id] = participantRows.reduce((a, p) => {
        const v = Number(rows[p.id]?.[s.id] || 0);
        return a + toInt(v);
      }, 0);
    }

    // статус + лидер
    const st: TaskStatus = statusMap[task.id] || "inprogress";
    const leaderPid = task.leaderId || undefined;

    // релиз: подсветка колонки
    const relISO = task.releaseDate || "";
    const relSprintId = task.releaseSprintId || detectSprintByDate(relISO);

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

    const handleParticipantDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = task.participantIds || [];
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(ids, oldIndex, newIndex);
      updateField(task, { participantIds: reordered });
    };

    return (
      <Paper key={task.id} variant="outlined" sx={{ p: 2 }}>
        {/* Шапка задачи */}
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
                <EditableText
                  value={resolveTaskFieldValue(task, "title")}
                  onChange={(v) => stageTaskField(task, "title", v)}
                  onBlur={() => commitTaskField(task, "title")}
                  placeholder="Название"
                />
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Описание:{" "}
                <EditableText
                  value={resolveTaskFieldValue(task, "description")}
                  onChange={(v) => stageTaskField(task, "description", v)}
                  onBlur={() => commitTaskField(task, "description")}
                  placeholder="Описание"
                />
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                DOD:{" "}
                <EditableText
                  value={resolveTaskFieldValue(task, "dod")}
                  onChange={(v) => stageTaskField(task, "dod", v)}
                  onBlur={() => commitTaskField(task, "dod")}
                  placeholder="Definition of Done"
                />
              </Typography>
            </Box>
          </Tooltip>

          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            flexWrap="wrap"
          >
            {/* Статус */}
            <Box>
              <Typography variant="caption" color="text.secondary">
                Статус
              </Typography>
              <Select
                size="small"
                value={st}
                onChange={(e) => {
                  const value = e.target.value as TaskStatus;
                  setStatusMap((prev) => ({ ...prev, [task.id]: value }));
                }}
                sx={{ ml: 1, minWidth: 160 }}
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
              </Select>
            </Box>

            {/* Приоритет */}
            <Box>
              <Typography variant="caption" color="text.secondary">
                Приоритет
              </Typography>
              <Select
                size="small"
                value={task.priority}
                onChange={(e) =>
                  updateField(task, {
                    priority: Number(e.target.value) as TaskPriority,
                  })
                }
                sx={{ ml: 1, minWidth: 80 }}
              >
                <MenuItem value={1}>1</MenuItem>
                <MenuItem value={2}>2</MenuItem>
                <MenuItem value={3}>3</MenuItem>
              </Select>
            </Box>

            {/* Заказчик */}
            <Box sx={{ minWidth: 180 }}>
              <Typography variant="caption" color="text.secondary">
                Заказчик
              </Typography>
              <Autocomplete
                size="small"
                freeSolo
                options={customerOptions}
                value={resolveTaskFieldValue(task, "customer")}
                onInputChange={(_, v) => stageTaskField(task, "customer", v || "")}
                onBlur={() => commitTaskField(task, "customer")}
                renderInput={(params) => (
                  <TextField {...params} size="small" sx={{ ml: 1 }} />
                )}
              />
            </Box>

            {/* Стрим */}
            <Box sx={{ minWidth: 180 }}>
              <Typography variant="caption" color="text.secondary">
                Стрим
              </Typography>
              <Autocomplete
                size="small"
                freeSolo
                options={streamOptions}
                value={resolveTaskFieldValue(task, "stream")}
                onInputChange={(_, v) => stageTaskField(task, "stream", v || "")}
                onBlur={() => commitTaskField(task, "stream")}
                renderInput={(params) => (
                  <TextField {...params} size="small" sx={{ ml: 1 }} />
                )}
              />
            </Box>

            {/* Релиз (ПРОМ) — список с релизами */}
            <Box sx={{ minWidth: 200 }}>
              <Typography variant="caption" color="text.secondary">
                Релиз (ПРОМ)
              </Typography>
              <Select
                size="small"
                value={task.releaseDate || ""}
                displayEmpty
                onChange={(e) => {
                  const iso = String(e.target.value) || "";
                  const sid = detectSprintByDate(iso) || "";
                  updateField(task, {
                    releaseDate: iso,
                    releaseSprintId: sid,
                  });
                }}
                sx={{ ml: 1, minWidth: 200 }}
              >
                <MenuItem value="">
                  <em>—</em>
                </MenuItem>
                {promReleases
                  .slice()
                  .sort((a, b) => a.promDate.localeCompare(b.promDate))
                  .map((r) => (
                    <MenuItem key={r.id} value={r.promDate}>
                      {moment(r.promDate).format("DD.MM.YYYY")}
                    </MenuItem>
                  ))}
              </Select>
            </Box>

            {/* Дублирование + порядок + удаление */}
            <Stack direction="row" spacing={0.5}>
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
          </Stack>
        </Stack>

        {/* Таблица участники × спринты */}
        <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 52 }} />
                <TableCell sx={{ minWidth: 260 }}>Участник</TableCell>
                {visibleSprints.map((s) => (
                  <HeaderSprint
                    key={s.id}
                    s={s}
                    highlight={Boolean(relSprintId && relSprintId === s.id)}
                  />
                ))}
                <TableCell align="center" sx={{ minWidth: 100 }}>
                  Итого
                </TableCell>
                <TableCell align="right" sx={{ width: 180 }}>
                  Действия
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <DndContext
                sensors={participantSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleParticipantDragEnd}
              >
                <SortableContext
                  items={task.participantIds}
                  strategy={verticalListSortingStrategy}
                >
                  {participantRows.map((p) => {
                    const row = rows[p.id] || {};
                    const rowSum = visibleSprints.reduce(
                      (acc, s) => acc + toInt(Number(row[s.id] || 0)),
                      0
                    );
                    const isLeader = leaderPid === p.id;
                    return (
                      <SortableParticipantRow key={p.id} participant={p}>
                        {(dragHandle, style, isDragging, setNodeRef) => (
                          <TableRow
                            ref={setNodeRef}
                            hover
                            style={style}
                            sx={{ opacity: isDragging ? 0.95 : 1 }}
                          >
                            <TableCell width={52} align="center">
                              <span
                                {...dragHandle.attributes}
                                {...dragHandle.listeners}
                                style={{ display: "inline-flex", cursor: "grab" }}
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
                              <Stack direction="row" spacing={1} alignItems="center">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    updateField(task, {
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

                            {visibleSprints.map((s) => (
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
                                  onCommit={() => commitCell(task.id, p.id, s.id)}
                                />
                              </TableCell>
                            ))}

                            <TableCell align="center" sx={{ fontWeight: 700 }}>
                              {toInt(rowSum)}
                            </TableCell>

                            <TableCell align="right">
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                <Tooltip title="Сдвинуть влево (по всем спринтам)">
                                  <IconButton
                                    size="small"
                                    onClick={() => shiftRow(task.id, p.id, "left")}
                                  >
                                    <ArrowBack fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Сдвинуть вправо (по всем спринтам)">
                                  <IconButton
                                    size="small"
                                    onClick={() => shiftRow(task.id, p.id, "right")}
                                  >
                                    <ArrowForward fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Удалить участника из задачи">
                                  <IconButton
                                    size="small"
                                    onClick={() => removeParticipantFromTask(task, p.id)}
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
              </DndContext>

              {/* Добавление участника */}
              <TableRow>
                <TableCell colSpan={visibleSprints.length + 2}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary" }}
                    >
                      Добавить участника:
                    </Typography>
                    <Autocomplete
                      size="small"
                      sx={{ minWidth: 280 }}
                      options={participants.filter(
                        (p) => !task.participantIds.includes(p.id)
                      )}
                      getOptionLabel={(p) =>
                        p ? `${p.fullName} (${p.role})` : ""
                      }
                      renderInput={(params) => (
                        <TextField {...params} label="Выберите участника" />
                      )}
                      onChange={(_, value) => {
                        if (value) addParticipantToTask(task, value.id);
                      }}
                    />
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Chip label="Автосумма" size="small" color="default" />
                </TableCell>
              </TableRow>

              {/* Итоги по спринтам */}
              <TableRow>
                <TableCell />
                <TableCell sx={{ fontWeight: 700 }}>
                  Итого по спринтам
                </TableCell>
                {visibleSprints.map((s) => (
                  <TableCell key={s.id} align="center" sx={{ fontWeight: 700 }}>
                    {toInt(sumBySprint[s.id])}
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ fontWeight: 700 }}>
                  {toInt(Object.values(sumBySprint).reduce((a, b) => a + b, 0))}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  };

  return (
    <Paper elevation={0} sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Бэклог
      </Typography>

      {/* Панель фильтров */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          sx={{ flexWrap: { xs: "wrap", xl: "nowrap" } }}
        >
          <FilterAutocomplete
            multiple
            allowCustom={false}
            label="Фильтр по кварталам"
            options={quarterFilterOptions}
            value={selectedQuarterIds}
            onChange={handleQuarterFilterChange}
            sx={{ minWidth: 240, flex: 1 }}
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
            sx={{ minWidth: 220, flex: 1 }}
          />

          <FilterAutocomplete
            label="Релиз"
            allowCustom={false}
            options={releaseFilterOptions}
            value={releaseSprintFilter === "all" ? "" : releaseSprintFilter}
            onChange={handleReleaseFilterChange}
            sx={{ minWidth: 200, flex: 1 }}
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
            sx={{ minWidth: 220, flex: 1 }}
          />

          {isUiPending && (
            <CircularProgress size={18} sx={{ color: "text.secondary" }} />
          )}

          <Stack direction="row" spacing={1} sx={{ ml: "auto", flexShrink: 0 }}>
            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={handleExportExcel}
              disabled={isExporting}
            >
              {isExporting ? "Экспорт..." : "Экспорт в Excel"}
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={createTask}
            >
              Добавить задачу
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Список задач */}
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

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary">
        Все поля редактируются по клику. Нагрузка задаётся в ячейках «участник ×
        спринт». Статусы/лидер/порядок/копирование — локально на этой странице.
        Выбор релиза (ПРОМ) автоматически определяет спринт и подсвечивает
        соответствующую колонку.
      </Typography>
    </Paper>
  );
}
