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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tooltip,
  Divider,
  InputBase,
  FormControl,
  InputLabel,
  FormHelperText,
  Select,
  MenuItem,
} from "@mui/material";
import {
  Add,
  Delete,
  CopyAll,
  ArrowBack,
  ArrowForward,
  Star,
  StarBorder,
  ArrowUpward,
  ArrowDownward,
  DragIndicator,
  EditNote,
  Visibility,
  VisibilityOff,
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
  useUpsertTaskAllocationMultiMutation,
  useGetReleasesQuery,
} from "../app/api";
import EditableNumberCell from "../components/EditableNumberCell";
import type {
  Allocations,
  BacklogItem,
  Participant,
  Sprint,
  TaskPriority,
  Quarter,
  TaskStatus,
  Page,
} from "../types";
import { setBacklogFilters } from "../app/uiSlice";
import { useAppDispatch, useAppSelector } from "./hooks";
import FilterAutocomplete from "../components/filters/FilterAutocomplete";
import FiltersPanel from "../components/filters/FiltersPanel";
import type { FiltersPanelFilter } from "../components/filters/FiltersPanel";

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

// ---------- Utils ----------

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

type TasksPage = Page<BacklogItem>;

function syncTasksPageMeta(draft: TasksPage) {
  const size = Math.max(1, (draft.page?.size ?? draft.content.length) || 1);
  const pageInfo = draft.page ??
    (draft.page = {
      size,
      number: 0,
      totalElements: draft.content.length,
      totalPages: Math.max(1, Math.ceil(draft.content.length / size)),
    });

  draft.numberOfElements = draft.content.length;
  pageInfo.totalElements = Math.max(pageInfo.totalElements, draft.content.length);
  const totalPages = Math.max(
    pageInfo.totalPages,
    Math.max(1, Math.ceil(pageInfo.totalElements / Math.max(1, pageInfo.size)))
  );
  pageInfo.totalPages = totalPages;
  draft.empty = draft.content.length === 0;
  draft.first = pageInfo.number <= 0;
  draft.last = pageInfo.number + 1 >= totalPages;
}

const EMPTY_TASKS: BacklogItem[] = [];

type BacklogLocalState = {
  taskQuartersMap: Record<string, string[]>;
  allocations: Allocations;
  participantOrders: Record<string, string[]>;
  hiddenParticipantsTaskIds: Set<string>;
};

type BacklogLocalAction =
  | {
      type: "SYNC_FROM_TASKS";
      tasks: BacklogItem[];
      sprintQuarterById: Map<string, string>;
      defaultQuarterId?: string;
    }
  | { type: "SET_TASK_QUARTERS"; taskId: string; quarterIds: string[] }
  | { type: "TOGGLE_HIDDEN_PARTICIPANTS"; taskId: string; hidden: boolean }
  | { type: "SET_PARTICIPANT_ORDER"; taskId: string; order: string[] }
  | {
      type: "SET_ALLOCATION";
      taskId: string;
      participantId: string;
      sprintId: string;
      value: number;
    }
  | {
      type: "SET_ALLOCATIONS_ROW";
      taskId: string;
      participantId: string;
      row: Record<string, number>;
    }
  | { type: "REMOVE_TASK"; taskId: string };

const EMPTY_ALLOC: Allocations = {};
const EMPTY_STR_ARR: string[] = [];

function uniqStrings(xs: string[]) {
  return Array.from(new Set(xs.filter(Boolean)));
}

function backlogLocalReducer(
  state: BacklogLocalState,
  action: BacklogLocalAction
): BacklogLocalState {
  switch (action.type) {
    case "SYNC_FROM_TASKS": {
      const { tasks, sprintQuarterById, defaultQuarterId } = action;

      const taskById = new Map(tasks.map((t) => [t.id, t]));

      let nextTaskQuartersMap = state.taskQuartersMap;
      let taskQuartersChanged = false;

      let nextAllocations = state.allocations;
      let allocationsChanged = false;

      let nextParticipantOrders = state.participantOrders;
      let participantOrdersChanged = false;

      for (const existingTaskId of Object.keys(state.taskQuartersMap)) {
        if (!taskById.has(existingTaskId)) {
          if (!taskQuartersChanged) {
            nextTaskQuartersMap = { ...state.taskQuartersMap };
            taskQuartersChanged = true;
          }
          delete nextTaskQuartersMap[existingTaskId];
        }
      }

      for (const existingTaskId of Object.keys(state.allocations)) {
        if (!taskById.has(existingTaskId)) {
          if (!allocationsChanged) {
            nextAllocations = { ...state.allocations };
            allocationsChanged = true;
          }
          delete nextAllocations[existingTaskId];
        }
      }

      for (const existingTaskId of Object.keys(state.participantOrders)) {
        if (!taskById.has(existingTaskId)) {
          if (!participantOrdersChanged) {
            nextParticipantOrders = { ...state.participantOrders };
            participantOrdersChanged = true;
          }
          delete nextParticipantOrders[existingTaskId];
        }
      }

      for (const t of tasks) {
        const existingQ = state.taskQuartersMap[t.id];
        if (!existingQ || existingQ.length === 0) {
          const explicit = Array.isArray((t as any).quarterIds)
            ? ((t as any).quarterIds as string[]).filter(Boolean)
            : [];
          let derived: string[] = [];
          if (explicit.length) {
            derived = uniqStrings(explicit);
          } else {
            const from = new Set<string>();
            const alloc = t.allocations || {};
            for (const pid of Object.keys(alloc)) {
              const row = (alloc as any)[pid] || {};
              for (const sid of Object.keys(row)) {
                const qid = sprintQuarterById.get(sid);
                if (qid) from.add(qid);
              }
            }
            const loads = t.loads || {};
            for (const [sid, days] of Object.entries(loads)) {
              if (Number(days) > 0) {
                const qid = sprintQuarterById.get(sid);
                if (qid) from.add(qid);
              }
            }
            derived = from.size
              ? Array.from(from)
              : defaultQuarterId
                ? [defaultQuarterId]
                : [];
          }

          if (derived.length) {
            if (!taskQuartersChanged) {
              nextTaskQuartersMap = { ...state.taskQuartersMap };
              taskQuartersChanged = true;
            }
            nextTaskQuartersMap[t.id] = derived;
          }
        }

        const pids = t.participantIds || EMPTY_STR_ARR;
        const existingOrder = state.participantOrders[t.id];

        if (!existingOrder) {
          if (pids.length) {
            if (!participantOrdersChanged) {
              nextParticipantOrders = { ...state.participantOrders };
              participantOrdersChanged = true;
            }
            nextParticipantOrders[t.id] = pids.slice();
          }
        } else {
          const kept = existingOrder.filter((id) => pids.includes(id));
          const added = pids.filter((id) => !kept.includes(id));
          const updated = [...kept, ...added];
          if (!shallowArrayEqual(updated, existingOrder)) {
            if (!participantOrdersChanged) {
              nextParticipantOrders = { ...state.participantOrders };
              participantOrdersChanged = true;
            }
            nextParticipantOrders[t.id] = updated;
          }
        }

        const incoming = t.allocations || {};
        const prevTaskAlloc = state.allocations[t.id];

        let taskAlloc = prevTaskAlloc;
        let taskAllocChanged = false;

        if (prevTaskAlloc) {
          for (const pid of Object.keys(prevTaskAlloc)) {
            if (!pids.includes(pid)) {
              if (!taskAllocChanged) {
                taskAlloc = { ...prevTaskAlloc };
                taskAllocChanged = true;
              }
              delete (taskAlloc as any)[pid];
            }
          }
        }

        for (const pid of pids) {
          const incomingRow = (incoming as any)[pid] as
            | Record<string, number>
            | undefined;
          if (!incomingRow) continue;

          const prevRow = (taskAlloc as any)?.[pid] as
            | Record<string, number>
            | undefined;
          let nextRow = prevRow;
          let rowChanged = false;

          for (const [sid, v] of Object.entries(incomingRow)) {
            const val = Number(v ?? 0) || 0;
            if ((prevRow?.[sid] ?? 0) !== val) {
              if (!nextRow) {
                nextRow = {};
                rowChanged = true;
              }
              if (!rowChanged) {
                nextRow = { ...prevRow };
                rowChanged = true;
              }
              (nextRow as any)[sid] = val;
            }
          }

          if (rowChanged) {
            if (!taskAlloc) {
              taskAlloc = {};
              taskAllocChanged = true;
            }
            if (!taskAllocChanged && taskAlloc === prevTaskAlloc) {
              taskAlloc = { ...(prevTaskAlloc || {}) };
              taskAllocChanged = true;
            }
            (taskAlloc as any)[pid] = nextRow!;
          } else {
            if (!prevRow && incomingRow && Object.keys(incomingRow).length > 0) {
              if (!taskAlloc) {
                taskAlloc = {};
                taskAllocChanged = true;
              }
              if (!taskAllocChanged && taskAlloc === prevTaskAlloc) {
                taskAlloc = { ...(prevTaskAlloc || {}) };
                taskAllocChanged = true;
              }
              (taskAlloc as any)[pid] = { ...incomingRow };
            }
          }
        }

        if (taskAllocChanged) {
          if (!allocationsChanged) {
            nextAllocations = { ...state.allocations };
            allocationsChanged = true;
          }
          (nextAllocations as any)[t.id] = taskAlloc || {};
        }
      }

      if (!taskQuartersChanged && !allocationsChanged && !participantOrdersChanged) {
        return state;
      }

      return {
        taskQuartersMap: nextTaskQuartersMap,
        allocations: nextAllocations,
        participantOrders: nextParticipantOrders,
        hiddenParticipantsTaskIds: state.hiddenParticipantsTaskIds,
      };
    }

    case "SET_TASK_QUARTERS": {
      const unique = uniqStrings(action.quarterIds);
      if (!unique.length) return state;
      const prev = state.taskQuartersMap[action.taskId];
      if (prev && shallowArrayEqual(prev, unique)) return state;
      return {
        ...state,
        taskQuartersMap: { ...state.taskQuartersMap, [action.taskId]: unique },
      };
    }

    case "TOGGLE_HIDDEN_PARTICIPANTS": {
      const prev = state.hiddenParticipantsTaskIds;
      const has = prev.has(action.taskId);
      if (action.hidden === has) return state;
      const next = new Set(prev);
      if (action.hidden) next.add(action.taskId);
      else next.delete(action.taskId);
      return { ...state, hiddenParticipantsTaskIds: next };
    }

    case "SET_PARTICIPANT_ORDER": {
      const prev = state.participantOrders[action.taskId];
      if (prev && shallowArrayEqual(prev, action.order)) return state;
      return {
        ...state,
        participantOrders: {
          ...state.participantOrders,
          [action.taskId]: action.order.slice(),
        },
      };
    }

    case "SET_ALLOCATION": {
      const { taskId, participantId, sprintId } = action;
      const value = Number(action.value ?? 0) || 0;

      const prevTask = state.allocations[taskId] || {};
      const prevRow = (prevTask as any)[participantId] || {};
      const current = Number(prevRow[sprintId] ?? 0) || 0;
      if (current === value) return state;

      const nextRow = { ...prevRow, [sprintId]: value };
      const nextTask = { ...prevTask, [participantId]: nextRow };
      return {
        ...state,
        allocations: { ...state.allocations, [taskId]: nextTask },
      };
    }

    case "SET_ALLOCATIONS_ROW": {
      const { taskId, participantId, row } = action;
      const prevTask = state.allocations[taskId] || {};
      const prevRow = (prevTask as any)[participantId] || {};
      const prevKeys = Object.keys(prevRow);
      const nextKeys = Object.keys(row);
      if (prevKeys.length === nextKeys.length) {
        let same = true;
        for (const k of nextKeys) {
          if (Number(prevRow[k] ?? 0) !== Number(row[k] ?? 0)) {
            same = false;
            break;
          }
        }
        if (same) return state;
      }
      const nextTask = { ...prevTask, [participantId]: { ...row } };
      return {
        ...state,
        allocations: { ...state.allocations, [taskId]: nextTask },
      };
    }

    case "REMOVE_TASK": {
      const taskId = action.taskId;
      if (
        !state.taskQuartersMap[taskId] &&
        !state.allocations[taskId] &&
        !state.participantOrders[taskId]
      ) {
        return state;
      }

      const tq = { ...state.taskQuartersMap };
      delete tq[taskId];
      const al = { ...state.allocations };
      delete al[taskId];
      const po = { ...state.participantOrders };
      delete po[taskId];

      const hidden = new Set(state.hiddenParticipantsTaskIds);
      hidden.delete(taskId);

      return {
        ...state,
        taskQuartersMap: tq,
        allocations: al,
        participantOrders: po,
        hiddenParticipantsTaskIds: hidden,
      };
    }

    default:
      return state;
  }
}

function useDebouncedEffect(effect: () => void, deps: any[], delayMs: number) {
  React.useEffect(() => {
    const t = window.setTimeout(effect, delayMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ---------- Editable inputs (максимально локальное состояние) ----------

type EditableTextProps = {
  value: string;
  onCommit?: (v: string) => void;
  placeholder?: string;
  sx?: any;
  multiline?: boolean;
  minRows?: number;
  maxRows?: number;
  displaySx?: any;
  inputSx?: any;
};

/**
 * Редактируемый текст:
 * - хранит ввод локально;
 * - наружу шлёт значение только при завершении (blur / Enter);
 * - если значение не изменилось — API не трогаем.
 */
const EditableText = React.memo(function EditableText({
  value,
  onCommit,
  placeholder,
  sx,
  multiline,
  minRows,
  maxRows,
  displaySx,
  inputSx,
}: EditableTextProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");
  const inputId = React.useId();

  React.useEffect(() => {
    if (!editing) {
      setDraft(value ?? "");
    }
  }, [value, editing]);

  const handleStart = React.useCallback(() => {
    setDraft(value ?? "");
    setEditing(true);
  }, [value]);

  const handleClose = React.useCallback(() => {
    if (!editing) return;
    setEditing(false);
    const final = draft ?? "";
    if (final !== (value ?? "")) {
      onCommit?.(final);
    }
  }, [draft, editing, onCommit, value]);

  if (!editing) {
    return (
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
    );
  }

  return (
    <InputBase
      multiline={multiline}
      minRows={minRows}
      maxRows={maxRows}
      autoFocus
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
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
  );
});

type EditableParticipantProps = {
  value: Participant;
  options: Participant[];
  onCommit?: (next: Participant) => void;
};

const EditableParticipant = React.memo(function EditableParticipant({
  value,
  options,
  onCommit,
}: EditableParticipantProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Participant | null>(value);

  React.useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [editing, value]);

  const handleStart = React.useCallback(() => {
    setDraft(value);
    setEditing(true);
  }, [value]);

  const handleClose = React.useCallback(() => {
    setEditing(false);
  }, []);

  const handleCommit = React.useCallback(
    (_: unknown, next: Participant | null) => {
      if (next && next.id !== value.id) {
        onCommit?.(next);
      }
      setEditing(false);
    },
    [onCommit, value.id]
  );

  if (!editing) {
    return (
      <Box
        sx={{ cursor: "pointer" }}
        title="Нажмите, чтобы сменить участника"
        onClick={handleStart}
      >
        <Typography>{value.fullName}</Typography>
      </Box>
    );
  }

  return (
    <Autocomplete
      size="small"
      openOnFocus
      options={options}
      value={draft}
      onChange={handleCommit}
      onClose={handleClose}
      isOptionEqualToValue={(a, b) => a?.id === b?.id}
      getOptionLabel={(p) => (p ? `${p.fullName} (${p.role})` : "")}
      renderInput={(params) => (
        <TextField {...params} size="small" label="Участник" autoFocus />
      )}
      sx={{ minWidth: 220 }}
    />
  );
});

// ---------- LocalStorage ----------

const LS_TASK_QUARTERS = "backlog.quartersMap";
const LS_HIDDEN_PARTICIPANTS = "backlog.hiddenParticipants";

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
  } catch {
    // ignore
  }
}

// ---------- Task quarters ----------

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

// taskId -> participantId -> sprintId -> days
const EMPTY_ALLOCATIONS_ROW: Record<string, Record<string, number>> = {};
const EMPTY_STRING_ARR: string[] = [];

type TaskCardActions = {
  onStatusChange: (task: BacklogItem, status: TaskStatus) => void;
  onPriorityChange: (task: BacklogItem, priority: TaskPriority) => void;
  onUpdateTaskPatch: (task: BacklogItem, patch: Partial<BacklogItem>) => void;
  onDuplicateTask: (
    task: BacklogItem,
    allocationsByParticipant: Record<string, Record<string, number>>
  ) => void;
  onMoveTask: (id: string, dir: "up" | "down") => void;
  onRemoveTask: (task: BacklogItem) => void;
  onChangeTaskQuarters: (taskId: string, quarterIds: string[]) => void;
  onAllocChange: (
    taskId: string,
    participantId: string,
    sprintId: string,
    value: number
  ) => void;
  onAllocCommit: (
    taskId: string,
    participantId: string,
    sprintId: string,
    value: number
  ) => void;
  onShiftRow: (
    taskId: string,
    participantId: string,
    dir: "left" | "right",
    row: Record<string, number>
  ) => void;
  onShiftTaskAllocations: (
    task: BacklogItem,
    dir: "left" | "right",
    allocationsByParticipant: Record<string, Record<string, number>>
  ) => void;
  onCopyRowToNextQuarter: (
    taskId: string,
    participantId: string,
    row: Record<string, number>
  ) => void;
  onAddParticipant: (
    task: BacklogItem,
    participantId: string,
    participantOrder: string[]
  ) => void;
  onRemoveParticipant: (
    task: BacklogItem,
    participantId: string,
    participantOrder: string[]
  ) => void;
  onChangeParticipant: (
    task: BacklogItem,
    fromParticipantId: string,
    toParticipantId: string,
    allocationsByParticipant: Record<string, Record<string, number>>,
    participantOrder: string[]
  ) => void;
  onParticipantOrderChange: (taskId: string, nextOrder: string[]) => void;
  onToggleParticipantsVisibility: (taskId: string, hidden: boolean) => void;
};

type BacklogCtx = {
  participantsSortedByName: Participant[];
  participantById: Record<string, Participant>;
  sprintsSorted: Sprint[];
  quartersSorted: Quarter[];
  quarterFilterOptions: { value: string; label: string }[];
  customerOptions: string[];
  streamOptions: string[];
  releaseOptions: { value: string; label: string }[];
  releaseValueSet: Set<string>;
  selectedQuarterIds: string[];
  participantSensors: any;
  findSprintIdByISO: (iso?: string) => string | "";
  getTaskQuarters: (task: BacklogItem) => string[];
};

// ---------- TaskCard (карточка задачи + таблица нагрузок) ----------

type TaskCardProps = {
  task: BacklogItem;
  allocationsByParticipant: Record<string, Record<string, number>>;
  participantOrder: string[];
  hiddenParticipants: boolean;
  ctx: BacklogCtx;
  actions: TaskCardActions;
  dragHandle?: DragHandleProps;
};

type SortableParticipantRowProps = {
  participant: Participant;
  children: (
    props: DragHandleProps,
    style: React.CSSProperties,
    isDragging: boolean,
    setNodeRef: (element: HTMLElement | null) => void
  ) => React.ReactNode;
};

const HeaderSprintCell = React.memo(function HeaderSprintCell({
  s,
  highlight,
}: {
  s: Sprint;
  highlight?: boolean;
}) {
  return (
    <TableCell
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
});

const TooltipContent = React.memo(function TooltipContent({
  title,
  description,
  dod,
}: {
  title: string;
  description: string;
  dod: string;
}) {
  return (
    <Stack spacing={0.5} sx={{ maxWidth: 360 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        Заголовок: {title || "—"}
      </Typography>
      <Typography variant="body2">Описание: {description || "—"}</Typography>
      <Typography variant="body2">DOD: {dod || "—"}</Typography>
    </Stack>
  );
});

type TaskDerived = {
  taskStatus: TaskStatus;
  taskQuarterIds: string[];
  effectiveSprints: Sprint[];
  orderedParticipantIds: string[];
  participantRows: Participant[];
  sumBySprint: Record<string, number>;
  availableParticipants: Participant[];
  leaderPid?: string;
  relSprintId: string | "";
  normalizedReleaseValue: string;
};

function useTaskDerived({
  task,
  allocationsByParticipant,
  participantOrder,
  ctx,
}: {
  task: BacklogItem;
  allocationsByParticipant: Record<string, Record<string, number>>;
  participantOrder: string[];
  ctx: BacklogCtx;
}): TaskDerived {
  return React.useMemo(() => {
    const taskStatus = task.status ?? "inprogress";
    const taskQuarterIds = ctx.getTaskQuarters(task);
    const allowedSprints = (taskQuarterIds.length
      ? ctx.sprintsSorted.filter((s) => taskQuarterIds.includes(s.quarterId))
      : ctx.sprintsSorted
    ).slice();

    const taskVisibleSprints =
      ctx.selectedQuarterIds.length > 0
        ? allowedSprints.filter((s) =>
            ctx.selectedQuarterIds.includes(s.quarterId)
          )
        : allowedSprints;

    const effectiveSprints =
      taskVisibleSprints.length > 0 ? taskVisibleSprints : allowedSprints;

    const orderedParticipantIds =
      participantOrder.length > 0
        ? participantOrder
        : task.participantIds || [];

    const participantRows = orderedParticipantIds
      .map((id) => ctx.participantById[id])
      .filter(Boolean) as Participant[];

    const sumBySprint: Record<string, number> = Object.fromEntries(
      effectiveSprints.map((s) => [s.id, 0])
    );

    for (const participant of participantRows) {
      const row = allocationsByParticipant[participant.id] || {};
      for (const sprint of effectiveSprints) {
        sumBySprint[sprint.id] =
          (sumBySprint[sprint.id] || 0) + toInt(Number(row[sprint.id] || 0));
      }
    }

    const assignedIds = task.participantIds || EMPTY_STRING_ARR;
    const assignedSet = new Set(assignedIds);
    const availableParticipants = ctx.participantsSortedByName.filter(
      (p) => !assignedSet.has(p.id)
    );

    const leaderPid = (task as any).leaderId || undefined;
    const relISO = task.releaseDate || "";
    const relSprintId =
      task.releaseSprintId || ctx.findSprintIdByISO(relISO);
    const normalizedReleaseValue = ctx.releaseValueSet.has(relISO) ? relISO : "";

    return {
      taskStatus,
      taskQuarterIds,
      effectiveSprints,
      orderedParticipantIds,
      participantRows,
      sumBySprint,
      availableParticipants,
      leaderPid,
      relSprintId,
      normalizedReleaseValue,
    };
  }, [allocationsByParticipant, ctx, participantOrder, task]);
}

const SortableParticipantRow = ({
  participant,
  children,
}: SortableParticipantRowProps) => {
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
    opacity: isDragging ? 0.95 : 1,
  };

  return children({ attributes, listeners }, style, isDragging, setNodeRef);
};

const TaskCard = React.memo(function TaskCard({
  task,
  allocationsByParticipant,
  participantOrder,
  hiddenParticipants,
  ctx,
  actions,
  dragHandle,
}: TaskCardProps) {
  const {
    onStatusChange,
    onPriorityChange,
    onUpdateTaskPatch,
    onDuplicateTask,
    onMoveTask,
    onRemoveTask,
    onChangeTaskQuarters,
    onAllocChange,
    onAllocCommit,
    onShiftRow,
    onShiftTaskAllocations,
    onCopyRowToNextQuarter,
    onAddParticipant,
    onRemoveParticipant,
    onChangeParticipant,
    onParticipantOrderChange,
    onToggleParticipantsVisibility,
  } = actions;
  const rows = allocationsByParticipant || {};
  const [selectedParticipantToAdd, setSelectedParticipantToAdd] =
    React.useState<Participant | null>(null);
  const addParticipantInputRef = React.useRef<HTMLInputElement | null>(null);
  const {
    taskStatus,
    taskQuarterIds,
    effectiveSprints,
    orderedParticipantIds,
    participantRows,
    sumBySprint,
    availableParticipants,
    leaderPid,
    relSprintId,
    normalizedReleaseValue,
  } = useTaskDerived({
    task,
    allocationsByParticipant: rows,
    participantOrder,
    ctx,
  });

  const [customerDraft, setCustomerDraft] = React.useState(task.customer || "");
  const [streamDraft, setStreamDraft] = React.useState(task.stream || "");
  const [noteParticipant, setNoteParticipant] =
    React.useState<Participant | null>(null);
  const [noteDraft, setNoteDraft] = React.useState("");

  React.useEffect(() => {
    setCustomerDraft(task.customer || "");
  }, [task.customer]);

  React.useEffect(() => {
    setStreamDraft(task.stream || "");
  }, [task.stream]);

  const handleOpenNote = React.useCallback(
    (participant: Participant) => {
      setNoteParticipant(participant);
      setNoteDraft(task.notes?.[participant.id] ?? "");
    },
    [task.notes]
  );

  const handleCloseNote = React.useCallback(() => {
    setNoteParticipant(null);
    setNoteDraft("");
  }, []);

  const handleSaveNote = React.useCallback(() => {
    if (!noteParticipant) return;
    const trimmed = noteDraft.trim();
    const nextNotes = { ...(task.notes ?? {}) };
    if (trimmed) {
      nextNotes[noteParticipant.id] = trimmed;
    } else {
      delete nextNotes[noteParticipant.id];
    }
    onUpdateTaskPatch(task, { notes: nextNotes });
    handleCloseNote();
  }, [handleCloseNote, noteDraft, noteParticipant, onUpdateTaskPatch, task]);

  const handleParticipantDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = orderedParticipantIds || [];
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(ids, oldIndex, newIndex);
    onParticipantOrderChange(task.id, reordered);
    onUpdateTaskPatch(task, { participantIds: reordered });
  };

  React.useEffect(() => {
    if (
      selectedParticipantToAdd &&
      !availableParticipants.some((p) => p.id === selectedParticipantToAdd.id)
    ) {
      setSelectedParticipantToAdd(null);
    }
  }, [availableParticipants, selectedParticipantToAdd]);

  const clampedTextSx = {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
    wordBreak: "break-word" as const,
  };

  const handleToggleParticipants = React.useCallback(() => {
    onToggleParticipantsVisibility(task.id, !hiddenParticipants);
  }, [hiddenParticipants, onToggleParticipantsVisibility, task.id]);

  const participantsToggleLabel = hiddenParticipants
    ? "Показать участников"
    : "Скрыть участников";

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      {/* Верхняя часть карточки */}
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Tooltip
          title={
            <TooltipContent
              title={task.title || ""}
              description={task.description || ""}
              dod={task.dod || ""}
            />
          }
          arrow
          placement="top-start"
        >
          <Box sx={{ flex: 1, minWidth: 260, cursor: "help" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              <EditableText
                value={task.title || ""}
                onCommit={(v) => {
                  const trimmed = v.trim();
                  if (trimmed !== (task.title || "")) {
                    onUpdateTaskPatch(task, { title: trimmed });
                  }
                }}
                placeholder="Название"
                multiline
                minRows={1}
                maxRows={4}
                displaySx={clampedTextSx}
                inputSx={{ width: "100%" }}
              />
            </Typography>

            <Typography
              variant="body2"
              sx={{ color: "text.secondary", mt: 0.5 }}
            >
              Описание:{" "}
              <EditableText
                value={task.description || ""}
                onCommit={(v) => {
                  if (v !== (task.description || "")) {
                    onUpdateTaskPatch(task, { description: v });
                  }
                }}
                placeholder="Описание"
                multiline
                minRows={2}
                maxRows={6}
                displaySx={clampedTextSx}
                inputSx={{ width: "100%" }}
              />
            </Typography>

            <Typography
              variant="body2"
              sx={{ color: "text.secondary", mt: 0.5 }}
            >
              DOD:{" "}
              <EditableText
                value={task.dod || ""}
                onCommit={(v) => {
                  if (v !== (task.dod || "")) {
                    onUpdateTaskPatch(task, { dod: v });
                  }
                }}
                placeholder="Definition of Done"
                multiline
                minRows={2}
                maxRows={6}
                displaySx={clampedTextSx}
                inputSx={{ width: "100%" }}
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
          {/* Статус */}
          <TextField
            select
            size="small"
            label="Статус"
            value={taskStatus}
            onChange={(e) =>
              onStatusChange(task, e.target.value as TaskStatus)
            }
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

          {/* Приоритет */}
          <TextField
            select
            size="small"
            label="Приоритет"
            value={task.priority}
            onChange={(e) =>
              onPriorityChange(task, Number(e.target.value) as TaskPriority)
            }
            sx={{ minWidth: 120 }}
          >
            <MenuItem value={1}>1</MenuItem>
            <MenuItem value={2}>2</MenuItem>
            <MenuItem value={3}>3</MenuItem>
          </TextField>

          {/* Кварталы */}
          <FilterAutocomplete
            multiple
            allowCustom={false}
            label="Кварталы"
            options={ctx.quarterFilterOptions}
            value={taskQuarterIds}
            onChange={(values) => {
              if (!values.length) return;
              onChangeTaskQuarters(task.id, values);
            }}
            sx={{ minWidth: 200, maxWidth: 240, flexShrink: 0 }}
          />

          {/* Заказчик */}
          <Autocomplete
            size="small"
            freeSolo
            options={ctx.customerOptions}
            value={customerDraft}
            onInputChange={(_, v) => setCustomerDraft(v || "")}
            onChange={(_, v) => {
              const next = v ?? "";
              setCustomerDraft(next);
              if (next !== (task.customer || "")) {
                onUpdateTaskPatch(task, { customer: next });
              }
            }}
            onBlur={() => {
              const trimmed = customerDraft.trim();
              if (trimmed !== (task.customer || "")) {
                onUpdateTaskPatch(task, { customer: trimmed });
              }
            }}
            renderInput={(params) => (
              <TextField {...params} label="Заказчик" size="small" />
            )}
            sx={{ minWidth: 180, maxWidth: 240, flexShrink: 0 }}
          />

          {/* Стрим */}
          <Autocomplete
            size="small"
            freeSolo
            options={ctx.streamOptions}
            value={streamDraft}
            onInputChange={(_, v) => setStreamDraft(v || "")}
            onChange={(_, v) => {
              const next = v ?? "";
              setStreamDraft(next);
              if (next !== (task.stream || "")) {
                onUpdateTaskPatch(task, { stream: next });
              }
            }}
            onBlur={() => {
              const trimmed = streamDraft.trim();
              if (trimmed !== (task.stream || "")) {
                onUpdateTaskPatch(task, { stream: trimmed });
              }
            }}
            renderInput={(params) => (
              <TextField {...params} label="Стрим" size="small" />
            )}
            sx={{ minWidth: 180, maxWidth: 220, flexShrink: 0 }}
          />

          {/* Релиз (ПРОМ) */}
          <TextField
            select
            size="small"
            label="Релиз (ПРОМ)"
            value={normalizedReleaseValue}
            onChange={(e) => {
              const iso = String(e.target.value) || "";
              const sid = ctx.findSprintIdByISO(iso) || "";
              onUpdateTaskPatch(task, {
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
            {ctx.releaseOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>

          {/* Действия по задаче + drag handle */}
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

            <Tooltip title={participantsToggleLabel}>
              <IconButton size="small" onClick={handleToggleParticipants}>
                {hiddenParticipants ? (
                  <Visibility fontSize="small" />
                ) : (
                  <VisibilityOff fontSize="small" />
                )}
              </IconButton>
            </Tooltip>

            <Tooltip title="Сдвинуть всех участников влево (по всем спринтам)">
              <IconButton
                size="small"
                onClick={() => onShiftTaskAllocations(task, "left", rows)}
              >
                <ArrowBack fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Сдвинуть всех участников вправо (по всем спринтам)">
              <IconButton
                size="small"
                onClick={() => onShiftTaskAllocations(task, "right", rows)}
              >
                <ArrowForward fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Дублировать">
              <IconButton
                size="small"
                onClick={() => onDuplicateTask(task, rows)}
              >
                <CopyAll fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Вверх">
              <IconButton
                size="small"
                onClick={() => onMoveTask(task.id, "up")}
              >
                <ArrowUpward fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Вниз">
              <IconButton
                size="small"
                onClick={() => onMoveTask(task.id, "down")}
              >
                <ArrowDownward fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Удалить задачу">
              <IconButton size="small" onClick={() => onRemoveTask(task)}>
                <Delete />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Stack>

      {/* Таблица нагрузок по участникам */}
      {!hiddenParticipants && (
        <DndContext
          sensors={ctx.participantSensors}
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
                  <TableCell
                    sx={{
                      width: 52,
                      position: "sticky",
                      left: 0,
                      zIndex: 3,
                      bgcolor: "background.paper",
                    }}
                  />
                  <TableCell
                    sx={{
                      minWidth: 260,
                      position: "sticky",
                      left: 52,
                      zIndex: 3,
                      bgcolor: "background.paper",
                    }}
                  >
                    Участник
                  </TableCell>
                  {effectiveSprints.map((s) => (
                    <HeaderSprintCell
                      key={s.id}
                      s={s}
                      highlight={Boolean(relSprintId && relSprintId === s.id)}
                    />
                  ))}
                  <TableCell align="center" sx={{ minWidth: 100 }}>
                    Итого
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      width: 220,
                      position: "sticky",
                      right: 0,
                      zIndex: 3,
                      bgcolor: "background.paper",
                    }}
                  >
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
                  const participantEditOptions = [p, ...availableParticipants];
                  const participantNote = task.notes?.[p.id] ?? "";
                  const hasNote = participantNote.trim().length > 0;

                  return (
                    <SortableParticipantRow key={p.id} participant={p}>
                      {(dragProps, style, isDragging, setNodeRef) => (
                        <TableRow
                          ref={setNodeRef}
                          hover
                          style={style}
                          sx={{ opacity: isDragging ? 0.95 : 1 }}
                        >
                          <TableCell
                            width={52}
                            align="center"
                            sx={{
                              position: "sticky",
                              left: 0,
                              bgcolor: "background.paper",
                              zIndex: 2,
                            }}
                          >
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
                              bgcolor: isLeader
                                ? "warning.light"
                                : "background.paper",
                              position: "sticky",
                              left: 52,
                              zIndex: 2,
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
                                  onUpdateTaskPatch(task, {
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
                              <EditableParticipant
                                value={p}
                                options={participantEditOptions}
                                onCommit={(next) =>
                                  onChangeParticipant(
                                    task,
                                    p.id,
                                    next.id,
                                    rows,
                                    orderedParticipantIds
                                  )
                                }
                              />
                            </Stack>
                          </TableCell>

                          {effectiveSprints.map((s) => (
                            <TableCell key={s.id} align="center">
                              <EditableNumberCell
                                value={Number(row[s.id] || 0)}
                                onChange={(v) =>
                                  onAllocChange(task.id, p.id, s.id, v)
                                }
                                onCommit={(next) =>
                                  onAllocCommit(task.id, p.id, s.id, next)
                                }
                              />
                            </TableCell>
                          ))}

                          <TableCell align="center" sx={{ fontWeight: 700 }}>
                            {toInt(rowSum)}
                          </TableCell>

                          <TableCell
                            align="right"
                            sx={{
                              position: "sticky",
                              right: 0,
                              bgcolor: "background.paper",
                              zIndex: 2,
                            }}
                          >
                            <Stack
                              direction="row"
                              spacing={0.5}
                              justifyContent="flex-end"
                            >
                              <Tooltip
                                title={
                                  hasNote ? (
                                    <Stack spacing={0.5} sx={{ maxWidth: 360 }}>
                                      <Typography
                                        variant="subtitle2"
                                        sx={{ fontWeight: 700 }}
                                      >
                                        Заметка участника
                                      </Typography>
                                      <Typography variant="body2">
                                        {participantNote}
                                      </Typography>
                                    </Stack>
                                  ) : (
                                    "Добавить заметку"
                                  )
                                }
                              >
                                <IconButton
                                  size="small"
                                  color={hasNote ? "primary" : "default"}
                                  onClick={() => handleOpenNote(p)}
                                >
                                  <EditNote fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Сдвинуть влево (по всем спринтам)">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    onShiftRow(
                                      task.id,
                                      p.id,
                                      "left",
                                      rows[p.id] || {}
                                    )
                                  }
                                >
                                  <ArrowBack fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              <Tooltip title="Сдвинуть вправо (по всем спринтам)">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    onShiftRow(
                                      task.id,
                                      p.id,
                                      "right",
                                      rows[p.id] || {}
                                    )
                                  }
                                >
                                  <ArrowForward fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              <Tooltip title="Скопировать нагрузку в следующий квартал">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    onCopyRowToNextQuarter(
                                      task.id,
                                      p.id,
                                      rows[p.id] || {}
                                    )
                                  }
                                >
                                  <CopyAll fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              <Tooltip title="Удалить участника из задачи">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    onRemoveParticipant(
                                      task,
                                      p.id,
                                      orderedParticipantIds
                                    )
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

              {availableParticipants.length > 0 && (
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
                        setSelectedParticipantToAdd(value);
                        if (value) {
                          onAddParticipant(
                            task,
                            value.id,
                            orderedParticipantIds
                          );
                          addParticipantInputRef.current?.blur();
                        }
                        setSelectedParticipantToAdd(null);
                      }}
                      value={selectedParticipantToAdd}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size="small"
                          label="Добавить участника"
                          placeholder="Выберите участника"
                          inputRef={addParticipantInputRef}
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
              )}

              <TableRow>
                <TableCell />
                <TableCell sx={{ fontWeight: 700 }}>
                  Итого по спринтам
                </TableCell>
                {effectiveSprints.map((s) => (
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
        </DndContext>
      )}

      <Dialog open={Boolean(noteParticipant)} onClose={handleCloseNote} fullWidth>
        <DialogTitle>
          Заметка: {noteParticipant?.fullName ?? "Участник"}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            minRows={4}
            maxRows={10}
            label="Заметка"
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseNote}>Отмена</Button>
          <Button variant="contained" onClick={handleSaveNote}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
});

type SortableTaskCardItemProps = {
  task: BacklogItem;
  allocationsByParticipant: Record<string, Record<string, number>>;
  participantOrder: string[];
  hiddenParticipants: boolean;
  ctx: BacklogCtx;
  actions: TaskCardActions;
};

const SortableTaskCardItem = React.memo(function SortableTaskCardItem({
  task,
  allocationsByParticipant,
  participantOrder,
  hiddenParticipants,
  ctx,
  actions,
}: SortableTaskCardItemProps) {
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
      <TaskCard
        task={task}
        allocationsByParticipant={allocationsByParticipant}
        participantOrder={participantOrder}
        hiddenParticipants={hiddenParticipants}
        ctx={ctx}
        actions={actions}
        dragHandle={{ attributes, listeners }}
      />
    </Box>
  );
}, (prev, next) => {
  return (
    prev.task === next.task &&
    prev.allocationsByParticipant === next.allocationsByParticipant &&
    shallowArrayEqual(prev.participantOrder, next.participantOrder) &&
    prev.hiddenParticipants === next.hiddenParticipants &&
    prev.ctx === next.ctx &&
    prev.actions === next.actions
  );
});

// ---------- BacklogPage ----------

export default function BacklogPage() {
  const { data: quarters = [], isLoading: isQuartersLoading } =
    useGetQuartersQuery();
  const { data: participants = [], isLoading: isParticipantsLoading } =
    useGetParticipantsQuery();
  const {
    data: sprintsData = [],
    isLoading: isSprintsLoading,
    isFetching: isSprintsFetching,
  } = useGetSprintsQuery(undefined);
  const allSprints = sprintsData;
  const { data: releases = [], isLoading: isReleasesLoading } =
    useGetReleasesQuery();
  const quarterIdsKey = React.useMemo(
    () => quarters.map((q) => q.id).join("|"),
    [quarters]
  );
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
    searchQuery,
    selectedQuarterIds,
    tasksPageSize,
  } = useAppSelector((s) => s.ui.backlog);

  const [, startFiltersTransition] = React.useTransition();
  const [, startTaskTransition] = React.useTransition();

  const currentQuarterId = currentQ?.id;

  const hasInitializedQuarterFilter = React.useRef(false);

  React.useEffect(() => {
    if (hasInitializedQuarterFilter.current) return;
    if (!quarters.length || !currentQuarterId) return;

    hasInitializedQuarterFilter.current = true;

    if (selectedQuarterIds.length === 0) {
      dispatch(setBacklogFilters({ selectedQuarterIds: [currentQuarterId] }));
    }
  }, [quarters.length, currentQuarterId, selectedQuarterIds.length, dispatch]);

  const sprintsById = React.useMemo(() => {
    const r: Record<string, Sprint> = {};
    for (const s of allSprints) r[s.id] = s;
    return r;
  }, [allSprints]);

  const sprintsGlobalOrdered = React.useMemo(
    () => allSprints.slice().sort(byEnd),
    [allSprints]
  );

  const sprintsSortedByStart = React.useMemo(
    () => allSprints.slice().sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [allSprints]
  );

  const findSprintIdByISO = React.useCallback(
    (iso?: string) => {
      if (!iso) return "";
      let low = 0;
      let high = sprintsSortedByStart.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const sprint = sprintsSortedByStart[mid];
        if (iso < sprint.startDate) {
          high = mid - 1;
        } else if (iso > sprint.endDate) {
          low = mid + 1;
        } else {
          return sprint.id;
        }
      }
      return "";
    },
    [sprintsSortedByStart]
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

  const participantsSortedByName = React.useMemo(
    () =>
      participants
        .slice()
        .sort((a, b) =>
          a.fullName.localeCompare(b.fullName, "ru", { sensitivity: "base" })
        ),
    [participants]
  );

  const participantById = React.useMemo(() => {
    const r: Record<string, Participant> = {};
    for (const p of participants) r[p.id] = p;
    return r;
  }, [participants]);

  const TASKS_PAGE_SIZE = React.useMemo(() => {
    const sanitized = tasksPageSize.replace(/\D/g, "");
    const parsed = Number(sanitized);
    if (!Number.isFinite(parsed) || parsed <= 0) return 20;
    return Math.floor(parsed);
  }, [tasksPageSize]);
  const normalizedSearch = React.useMemo(() => searchQuery.trim(), [searchQuery]);
  const [tasksPageNumber, setTasksPageNumber] = React.useState(0);
  const [pinnedTaskId, setPinnedTaskId] = React.useState<string | null>(null);

  const filtersSignature = React.useMemo(
    () =>
      JSON.stringify({
        selectedQuarterIds: selectedQuarterIds.slice().sort(),
        priorityFilter,
        statusFilter,
        releaseSprintFilter,
        streamFilter,
        normalizedSearch,
        pinnedTaskId,
        tasksPageSize: TASKS_PAGE_SIZE,
      }),
    [
      normalizedSearch,
      priorityFilter,
      releaseSprintFilter,
      selectedQuarterIds,
      statusFilter,
      streamFilter,
      pinnedTaskId,
      TASKS_PAGE_SIZE,
    ]
  );

  const lastFiltersSignature = React.useRef(filtersSignature);
  const effectiveTasksPageNumber = React.useMemo(() => {
    if (lastFiltersSignature.current !== filtersSignature) {
      return 0;
    }
    return tasksPageNumber;
  }, [filtersSignature, tasksPageNumber]);

  const tasksQueryArgs = React.useMemo(
    () => ({
      quarterIds: selectedQuarterIds,
      priority: priorityFilter,
      statuses: statusFilter,
      releaseDate:
        releaseSprintFilter === "all" ? undefined : releaseSprintFilter.trim(),
      stream: streamFilter.trim(),
      search: normalizedSearch,
      pinnedId: pinnedTaskId ?? undefined,
      page: effectiveTasksPageNumber,
      size: TASKS_PAGE_SIZE,
    }),
    [
      selectedQuarterIds,
      priorityFilter,
      statusFilter,
      releaseSprintFilter,
      streamFilter,
      normalizedSearch,
      pinnedTaskId,
      effectiveTasksPageNumber,
      TASKS_PAGE_SIZE,
    ]
  );

  React.useEffect(() => {
    if (lastFiltersSignature.current !== filtersSignature) {
      lastFiltersSignature.current = filtersSignature;
      setTasksPageNumber(0);
    }
  }, [filtersSignature]);


  const applyTaskOrderOptimistic = React.useCallback(
    (orderedIds: string[]) =>
      dispatch(
        api.util.updateQueryData("getTasks", tasksQueryArgs, (draft) => {
          if (!draft) return;
          const byId = new Map(draft.content.map((t) => [t.id, t]));
          const seen = new Set<string>();

          const reordered = orderedIds
            .map((id) => {
              const item = byId.get(id);
              if (item) seen.add(id);
              return item;
            })
            .filter(Boolean) as BacklogItem[];

          const untouched = draft.content.filter((t) => !seen.has(t.id));
          const fullList = [...reordered, ...untouched];

          fullList.forEach((task, index) => {
            (task as any).order = index;
          });

          draft.content.splice(0, draft.content.length, ...fullList);
          syncTasksPageMeta(draft as TasksPage);
        })
      ),
    [dispatch, tasksQueryArgs]
  );

  const applyParticipantOrderOptimistic = React.useCallback(
    (taskId: string, participantIds: string[]) =>
      dispatch(
        api.util.updateQueryData("getTasks", tasksQueryArgs, (draft) => {
          if (!draft) return;
          const task = draft.content.find((t) => t.id === taskId);
          if (task) {
            task.participantIds = participantIds.slice();
          }
        })
      ),
    [dispatch, tasksQueryArgs]
  );

  const { tasks, page, isFetching } = useGetTasksQuery(tasksQueryArgs, {
    selectFromResult: ({ data, isFetching }) => ({
      tasks: data?.content ?? EMPTY_TASKS,
      page: data?.page,
      isFetching,
    }),
  });

  const totalPages = page?.totalPages;
  const totalTasksCount = page?.totalElements ?? 0;

  const hasMoreTasks = React.useMemo(
    () => tasks.length < totalTasksCount,
    [tasks.length, totalTasksCount]
  );

  const loadNextTasksPage = React.useCallback(
    (page: number) => {
      setTasksPageNumber(() => {
        if (typeof totalPages === "number") {
          const maxPage = Math.max(0, totalPages - 1);
          return page < maxPage ? page + 1 : page;
        }

        return page + 1;
      });
    },
    [totalPages]
  );

  React.useEffect(() => {
    const handleScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } =
        document.documentElement;
      const distanceToBottom = scrollHeight - (scrollTop + clientHeight);

      if (distanceToBottom >= 400 || !hasMoreTasks || isFetching) {
        return;
      }

      loadNextTasksPage(effectiveTasksPageNumber);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [
    effectiveTasksPageNumber,
    hasMoreTasks,
    isFetching,
    loadNextTasksPage,
  ]);

  const initialLocalState = React.useMemo<BacklogLocalState>(
    () => ({
      taskQuartersMap: readLS<Record<string, string[]>>(LS_TASK_QUARTERS, {}),
      allocations: EMPTY_ALLOC,
      participantOrders: {},
      hiddenParticipantsTaskIds: new Set(
        readLS<string[]>(LS_HIDDEN_PARTICIPANTS, [])
      ),
    }),
    []
  );

  const [local, dispatchLocal] = React.useReducer(
    backlogLocalReducer,
    initialLocalState
  );
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);
  const [newTaskQuarterId, setNewTaskQuarterId] = React.useState<string>("");
  const [addTaskQuarterError, setAddTaskQuarterError] = React.useState(false);

  React.useEffect(() => {
    if (quarterIdSet.size === 0) return;
    if (selectedQuarterIds.length === 0) return;

    const validSelected = selectedQuarterIds.filter((id) =>
      quarterIdSet.has(id)
    );
    if (shallowArrayEqual(validSelected, selectedQuarterIds)) return;

    dispatch(setBacklogFilters({ selectedQuarterIds: validSelected }));
  }, [selectedQuarterIds, quarterIdSet, dispatch]);

  React.useEffect(() => {
    const nextQuarterId = (() => {
      const prevValid = newTaskQuarterId && quarterIdSet.has(newTaskQuarterId)
        ? newTaskQuarterId
        : "";
      if (prevValid) return prevValid;
      const fromSelected = selectedQuarterIds.find((id) =>
        quarterIdSet.has(id)
      );
      if (fromSelected) return fromSelected;
      if (defaultQuarterId && quarterIdSet.has(defaultQuarterId)) {
        return defaultQuarterId;
      }
      return "";
    })();

    if (nextQuarterId === newTaskQuarterId) return;
    setNewTaskQuarterId(nextQuarterId);
  }, [
    quarterIdSet,
    selectedQuarterIds,
    defaultQuarterId,
    newTaskQuarterId,
    quarterIdsKey,
  ]);

  useDebouncedEffect(() => {
    writeLS(LS_TASK_QUARTERS, local.taskQuartersMap);
  }, [local.taskQuartersMap], 400);

  useDebouncedEffect(() => {
    writeLS(
      LS_HIDDEN_PARTICIPANTS,
      Array.from(local.hiddenParticipantsTaskIds)
    );
  }, [local.hiddenParticipantsTaskIds], 400);

  const streamOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks) if (t.stream?.trim()) s.add(t.stream.trim());
    return Array.from(s).sort();
  }, [tasks]);

  const customerOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks) if (t.customer?.trim()) s.add(t.customer.trim());
    return Array.from(s).sort();
  }, [tasks]);

  const getTaskQuarters = React.useCallback(
    (task: BacklogItem): string[] => {
      const fromMap = local.taskQuartersMap[task.id];
      if (fromMap && fromMap.length) return fromMap;
      const derived = deriveTaskQuarters(
        task,
        allSprints,
        selectedQuarterIds[0] || currentQ?.id
      );
      if (derived.length) return derived;
      return quartersSorted.map((q) => q.id);
    },
    [
      local.taskQuartersMap,
      allSprints,
      selectedQuarterIds,
      currentQ,
      quartersSorted,
    ]
  );

  const updateTaskQuarters = React.useCallback(
    (taskId: string, quarterIds: string[]) => {
      const unique = Array.from(new Set(quarterIds.filter(Boolean)));
      if (!unique.length) return;
      dispatchLocal({ type: "SET_TASK_QUARTERS", taskId, quarterIds: unique });
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

  const releaseValueSet = React.useMemo(
    () => new Set(releaseFilterOptions.map((opt) => opt.value)),
    [releaseFilterOptions]
  );

  const tasksPageSizeOptions = React.useMemo(
    () =>
      [20, 50, 100].map((size) => ({
        value: String(size),
        label: String(size),
      })),
    []
  );

  const handleQuarterFilterChange = React.useCallback(
    (ids: string[]) => {
      const existing = new Set(quarters.map((q) => q.id));
      const filtered = ids.filter((id) => existing.has(id));
      const unique = Array.from(new Set(filtered));
      if (shallowArrayEqual(unique, selectedQuarterIds)) return;
      startFiltersTransition(() => {
        dispatch(setBacklogFilters({ selectedQuarterIds: unique }));
      });
    },
    [quarters, selectedQuarterIds, startFiltersTransition, dispatch]
  );

  const handlePriorityFilterChange = React.useCallback(
    (values: string[]) => {
      const unique = Array.from(new Set(values));
      const next = unique
        .map((v) => Number(v))
        .filter((n): n is number => PRIORITY_VALUES.includes(n));
      if (shallowArrayEqual(next, priorityFilter)) return;
      startFiltersTransition(() => {
        dispatch(setBacklogFilters({ priorityFilter: next }));
      });
    },
    [dispatch, priorityFilter, startFiltersTransition]
  );

  const handleStatusFilterChange = React.useCallback(
    (values: string[]) => {
      const next = Array.from(new Set(values)) as TaskStatus[];
      if (shallowArrayEqual(next, statusFilter)) return;
      startFiltersTransition(() => {
        dispatch(setBacklogFilters({ statusFilter: next }));
      });
    },
    [dispatch, statusFilter, startFiltersTransition]
  );

  const handleReleaseFilterChange = React.useCallback(
    (value: string) => {
      const normalized = (value || "").trim() || "all";
      if (normalized !== releaseSprintFilter) {
        startFiltersTransition(() => {
          dispatch(setBacklogFilters({ releaseSprintFilter: normalized }));
        });
      }
    },
    [dispatch, releaseSprintFilter, startFiltersTransition]
  );

  const handleStreamFilterChange = React.useCallback(
    (value: string) => {
      if (value === streamFilter) return;
      startFiltersTransition(() => {
        dispatch(setBacklogFilters({ streamFilter: value }));
      });
    },
    [dispatch, streamFilter, startFiltersTransition]
  );

  const handleTasksPageSizeChange = React.useCallback(
    (value: string) => {
      const sanitized = value.replace(/\D/g, "");
      const normalized = sanitized.replace(/^0+(?=\d)/, "");
      if (normalized === tasksPageSize) return;
      startFiltersTransition(() => {
        dispatch(setBacklogFilters({ tasksPageSize: normalized }));
      });
    },
    [dispatch, startFiltersTransition, tasksPageSize]
  );

  const handleSearchCommit = React.useCallback(
    (value: string) => {
      const normalized = value.trim();
      if (normalized !== normalizedSearch) {
        startFiltersTransition(() => {
          dispatch(setBacklogFilters({ searchQuery: normalized }));
        });
      }
    },
    [dispatch, normalizedSearch, startFiltersTransition]
  );

  const filtersConfig = React.useMemo<FiltersPanelFilter[]>(
    () => [
      {
        type: "autocomplete",
        key: "quarters",
        minWidth: 200,
        props: {
          multiple: true,
          allowCustom: false,
          label: "Фильтр по кварталам",
          options: quarterFilterOptions,
          value: selectedQuarterIds,
          onChange: handleQuarterFilterChange,
        },
      },
      {
        type: "autocomplete",
        key: "priority",
        minWidth: 160,
        props: {
          multiple: true,
          allowCustom: false,
          label: "Приоритет",
          options: priorityOptions,
          value: priorityFilter.map(String),
          onChange: handlePriorityFilterChange,
        },
      },
      {
        type: "autocomplete",
        key: "status",
        minWidth: 200,
        props: {
          multiple: true,
          allowCustom: false,
          label: "Статусы",
          options: statusOptions,
          value: statusFilter,
          onChange: handleStatusFilterChange,
        },
      },
      {
        type: "autocomplete",
        key: "release",
        minWidth: 200,
        props: {
          allowCustom: false,
          label: "Релиз",
          options: releaseFilterOptions,
          value: releaseSprintFilter === "all" ? "" : releaseSprintFilter,
          onChange: handleReleaseFilterChange,
          placeholder: "Все релизы",
        },
      },
      {
        type: "autocomplete",
        key: "stream",
        minWidth: 200,
        props: {
          label: "Стрим по задаче",
          options: streamOptions,
          value: streamFilter,
          onChange: handleStreamFilterChange,
        },
      },
      {
        type: "autocomplete",
        key: "tasks-page-size",
        minWidth: 200,
        props: {
          allowCustom: true,
          label: "Количество задач",
          options: tasksPageSizeOptions,
          value: tasksPageSize,
          onChange: handleTasksPageSizeChange,
          placeholder: "20",
          commitOnBlur: true,
        },
      },
      {
        type: "search",
        key: "search",
        minWidth: 220,
        props: {
          label: "Поиск по названию/описанию/DOD",
          value: searchQuery,
          onCommit: handleSearchCommit,
          placeholder: "Введите текст",
          commitOnBlurOnly: true,
        },
      },
    ],
    [
      handlePriorityFilterChange,
      handleQuarterFilterChange,
      handleReleaseFilterChange,
      handleSearchCommit,
      handleStatusFilterChange,
      handleStreamFilterChange,
      handleTasksPageSizeChange,
      priorityFilter,
      priorityOptions,
      quarterFilterOptions,
      releaseFilterOptions,
      releaseSprintFilter,
      searchQuery,
      selectedQuarterIds,
      statusFilter,
      statusOptions,
      streamFilter,
      streamOptions,
      tasksPageSize,
      tasksPageSizeOptions,
    ]
  );
  const deferredStatusFilter = React.useDeferredValue(statusFilter);
  const deferredTasks = React.useDeferredValue(tasks);

  const taskById = React.useMemo(
    () => new Map(deferredTasks.map((t) => [t.id, t])),
    [deferredTasks]
  );

  const baseTaskIds = React.useMemo(() => {
    const byStatus =
      deferredStatusFilter.length === 0
        ? deferredTasks
        : deferredTasks.filter((t) => {
            const st = t.status ?? "inprogress";
            return deferredStatusFilter.includes(st);
          });

    const ids = byStatus.map((t) => t.id);
    if (pinnedTaskId && !ids.includes(pinnedTaskId)) {
      const pinnedTask = taskById.get(pinnedTaskId);
      if (pinnedTask) {
        return [pinnedTaskId, ...ids];
      }
    }
    return ids;
  }, [deferredStatusFilter, deferredTasks, pinnedTaskId, taskById]);

  const sortedTaskIds = React.useMemo(() => {
    const ids = baseTaskIds.slice();
    ids.sort((ida, idb) => {
      if (pinnedTaskId) {
        if (ida === pinnedTaskId) return -1;
        if (idb === pinnedTaskId) return 1;
      }
      const a = taskById.get(ida);
      const b = taskById.get(idb);
      if (!a || !b) return 0;
      const oa = Number.isFinite(a.order)
        ? Number(a.order)
        : Number.MAX_SAFE_INTEGER;
      const ob = Number.isFinite(b.order)
        ? Number(b.order)
        : Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
    return ids;
  }, [baseTaskIds, pinnedTaskId, taskById]);

  const displayedTasks = React.useMemo(
    () =>
      sortedTaskIds
        .map((id) => taskById.get(id))
        .filter((task): task is BacklogItem => Boolean(task)),
    [sortedTaskIds, taskById]
  );

  const sprintQuarterById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of allSprints) m.set(s.id, s.quarterId);
    return m;
  }, [allSprints]);

  const tasksIdsKey = React.useMemo(
    () => (sortedTaskIds.length ? sortedTaskIds.join("|") : ""),
    [sortedTaskIds]
  );

  React.useEffect(() => {
    startTaskTransition(() => {
      dispatchLocal({
        type: "SYNC_FROM_TASKS",
        tasks: displayedTasks as BacklogItem[],
        sprintQuarterById,
        defaultQuarterId: selectedQuarterIds[0] || currentQ?.id,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksIdsKey, sprintQuarterById, selectedQuarterIds, currentQ?.id]);

  const displayedTasksCount = displayedTasks.length;

  const [addTask] = useAddTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [upsertTaskAllocation] = useUpsertTaskAllocationMutation();
  const [upsertTaskAllocationBulk] = useUpsertTaskAllocationBulkMutation();
  const [upsertTaskAllocationMulti] = useUpsertTaskAllocationMultiMutation();

  const updateField = React.useCallback(
    (t: BacklogItem, patch: Partial<BacklogItem>) => {
      if (!patch || !Object.keys(patch).length) return Promise.resolve();
      const promise = updateTask({ id: t.id, ...patch })
        .unwrap()
        .catch((e) => {
          console.error("Failed to update task", e);
          throw e;
        });
      startTaskTransition(() => {
        void promise;
      });
      return promise;
    },
    [startTaskTransition, updateTask]
  );

  const handleStatusChange = React.useCallback(
    (task: BacklogItem, st: TaskStatus) => {
      if ((task.status ?? "inprogress") === st) return;
      void updateField(task, { status: st });
    },
    [updateField]
  );

  const handlePriorityChange = React.useCallback(
    (task: BacklogItem, priority: TaskPriority) => {
      if (task.priority === priority) return;
      void updateField(task, { priority });
    },
    [updateField]
  );

  const handleUpdateTaskPatch = React.useCallback(
    (task: BacklogItem, patch: Partial<BacklogItem>) => {
      const effectivePatch: Partial<BacklogItem> = {};
      for (const [key, val] of Object.entries(patch) as [
        keyof BacklogItem,
        any
      ][]) {
        if ((task as any)[key] !== val) {
          (effectivePatch as any)[key] = val;
        }
      }
      if (Object.keys(effectivePatch).length === 0) return;
      updateField(task, effectivePatch);
    },
    [updateField]
  );

  const persistTaskOrder = React.useCallback(
    async (orderedIds: string[], movedTaskId: string) => {
      const completeIds = [
        ...orderedIds,
        ...tasks.filter((t) => !orderedIds.includes(t.id)).map((t) => t.id),
      ];

      const targetIndex = completeIds.indexOf(movedTaskId);
      if (targetIndex < 0) return;

      applyTaskOrderOptimistic(completeIds);

      const currentOrderMap = new Map(tasks.map((t) => [t.id, t.order]));
      const currentOrder = currentOrderMap.get(movedTaskId);
      if (currentOrder === targetIndex) {
        return;
      }

      try {
        await updateTask({ id: movedTaskId, order: targetIndex } as any).unwrap();
      } catch (error) {
        console.error("Не удалось сохранить порядок задач", error);
      }
    },
    [tasks, applyTaskOrderOptimistic, updateTask]
  );

  const createTask = async (quarterId?: string) => {
    const created = await addTask({
      title: "Новая задача",
      description: "",
      dod: "",
      priority: 1 as TaskPriority,
      status: "inprogress" as TaskStatus,
      customer: "",
      stream: "",
      participantIds: [],
      releaseDate: "",
      releaseSprintId: "",
    }).unwrap();

    setPinnedTaskId(created.id);
    if (quarterId) {
      dispatchLocal({
        type: "SET_TASK_QUARTERS",
        taskId: created.id,
        quarterIds: [quarterId],
      });
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

  const duplicateTask = React.useCallback(
    async (
      task: BacklogItem,
      allocationsByParticipant: Record<string, Record<string, number>>
    ) => {
      const taskQuarters = getTaskQuarters(task);
      const allocationsPayload = Object.entries(
        allocationsByParticipant || {}
      ).reduce<Record<string, Record<string, number>>>((acc, [pid, row]) => {
        const positive = Object.entries(row)
          .map(([sid, value]) => [sid, toInt(Number(value) || 0)] as const)
          .filter(([, days]) => days > 0);
        if (positive.length) {
          acc[pid] = Object.fromEntries(positive);
        }
        return acc;
      }, {});

      const loadsPayload = task.loads
        ? Object.fromEntries(
            Object.entries(task.loads)
              .map(([sid, days]) => [sid, toInt(Number(days) || 0)] as const)
              .filter(([, days]) => days > 0)
          )
        : undefined;

      const baseOrder = Number.isFinite(task.order)
        ? Number(task.order)
        : tasks.length;
      const copy = await addTask({
        title: `${task.title} (копия)`,
        description: (task as any).description,
        dod: task.dod,
        priority: task.priority,
        status: task.status ?? "inprogress",
        customer: task.customer,
        stream: task.stream,
        participantIds: task.participantIds.slice(),
        releaseDate: task.releaseDate,
        releaseSprintId: task.releaseSprintId,
        leaderId: (task as any).leaderId ?? undefined,
        quarterIds: taskQuarters,
        order: baseOrder + 1,
        loads: loadsPayload,
        allocations: Object.keys(allocationsPayload).length
          ? allocationsPayload
          : undefined,
      }).unwrap();

      if (taskQuarters.length) {
        dispatchLocal({
          type: "SET_TASK_QUARTERS",
          taskId: copy.id,
          quarterIds: taskQuarters,
        });
      }

      return copy;
    },
    [addTask, getTaskQuarters, tasks.length]
  );

  const removeTask = React.useCallback(
    async (t: BacklogItem) => {
      if (!window.confirm(`Удалить задачу «${t.title}»?`)) return;
      await deleteTask({ id: t.id }).unwrap();
      dispatchLocal({ type: "REMOVE_TASK", taskId: t.id });
    },
    [deleteTask]
  );

  const commitCell = React.useCallback(
    (
      taskId: string,
      participantId: string,
      sprintId: string,
      value: number
    ) => {
      dispatchLocal({
        type: "SET_ALLOCATION",
        taskId,
        participantId,
        sprintId,
        value,
      });
      startTaskTransition(() => {
        upsertTaskAllocation({
          taskId,
          participantId,
          sprintId,
          days: toInt(Number(value) || 0),
        })
          .unwrap()
          .catch((e) => {
            console.error("Failed to save allocation", e);
          });
      });
    },
    [startTaskTransition, upsertTaskAllocation]
  );

  const handleAllocChange = React.useCallback(
    (
      taskId: string,
      participantId: string,
      sprintId: string,
      value: number
    ) => {
      dispatchLocal({
        type: "SET_ALLOCATION",
        taskId,
        participantId,
        sprintId,
        value,
      });
    },
    []
  );

  const addParticipantToTask = React.useCallback(
    (task: BacklogItem, pid: string, participantOrder: string[]) => {
      if (!pid) return;
      if (task.participantIds?.includes(pid)) return;

      updateField(task, { participantIds: [...task.participantIds, pid] });

      const nextOrder = [
        ...(participantOrder.length ? participantOrder : task.participantIds),
        pid,
      ];
      dispatchLocal({
        type: "SET_PARTICIPANT_ORDER",
        taskId: task.id,
        order: nextOrder,
      });

      dispatchLocal({
        type: "SET_ALLOCATIONS_ROW",
        taskId: task.id,
        participantId: pid,
        row: {},
      });
    },
    [updateField]
  );

  const removeParticipantFromTask = React.useCallback(
    async (task: BacklogItem, pid: string, participantOrder: string[]) => {
      const nextOrder = (participantOrder.length
        ? participantOrder
        : task.participantIds
      ).filter((id) => id !== pid);
      dispatchLocal({
        type: "SET_PARTICIPANT_ORDER",
        taskId: task.id,
        order: nextOrder,
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
    },
    [updateField]
  );

  const replaceParticipantInTask = React.useCallback(
    async (
      task: BacklogItem,
      fromPid: string,
      toPid: string,
      allocationsByParticipant: Record<string, Record<string, number>>,
      participantOrder: string[]
    ) => {
      if (!toPid || fromPid === toPid) return;
      if (!task.participantIds.includes(fromPid)) return;
      if (task.participantIds.includes(toPid)) return;

      const participantIds = task.participantIds.map((id) =>
        id === fromPid ? toPid : id
      );
      const rowToMove = allocationsByParticipant[fromPid] || {};
      const nextAllocations = Object.entries(allocationsByParticipant).reduce<
        Record<string, Record<string, number>>
      >((acc, [pid, row]) => {
        if (pid === fromPid) return acc;
        acc[pid] = { ...row };
        return acc;
      }, {});

      nextAllocations[toPid] = { ...rowToMove };

      dispatchLocal({
        type: "SET_ALLOCATIONS_ROW",
        taskId: task.id,
        participantId: toPid,
        row: rowToMove,
      });

      const currentOrder = participantOrder.length
        ? participantOrder
        : task.participantIds;
      dispatchLocal({
        type: "SET_PARTICIPANT_ORDER",
        taskId: task.id,
        order: currentOrder.map((id) => (id === fromPid ? toPid : id)),
      });

      const patch: Partial<BacklogItem> = {
        participantIds,
        allocations: nextAllocations,
      };

      if ((task as any).leaderId === fromPid) {
        (patch as any).leaderId = toPid;
      }

      try {
        await updateField(task, patch);
      } catch (error) {
        console.error("Failed to replace participant", error);
      }
    },
    [updateField]
  );

  const shiftRow = React.useCallback(
    (
      taskId: string,
      participantId: string,
      dir: "left" | "right",
      row: Record<string, number>
    ) => {
      const ids = sprintsGlobalOrdered.map((s) => s.id);
      if (!ids.length) return;

      const next: Record<string, number> = ids.reduce<Record<string, number>>(
        (acc, sid) => {
          acc[sid] = 0;
          return acc;
        },
        {}
      );

      for (let i = 0; i < ids.length; i++) {
        const fromSid = ids[i];
        const targetIdx = dir === "left" ? i - 1 : i + 1;
        const targetSid =
          targetIdx >= 0 && targetIdx < ids.length ? ids[targetIdx] : fromSid;
        const val = Number(row[fromSid] || 0);
        next[targetSid] = (next[targetSid] || 0) + val;
      }

      dispatchLocal({
        type: "SET_ALLOCATIONS_ROW",
        taskId,
        participantId,
        row: next,
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
          await upsertTaskAllocationMulti({
            taskId,
            allocations: {
              [participantId]: bulkAllocations,
            },
          }).unwrap();
        } catch (error) {
          console.error("Failed to bulk save allocations", error);
        }
      })();
    },
    [sprintsGlobalOrdered, upsertTaskAllocationMulti]
  );

  const shiftTaskAllocations = React.useCallback(
    (
      task: BacklogItem,
      dir: "left" | "right",
      allocationsByParticipant: Record<string, Record<string, number>>
    ) => {
      const ids = sprintsGlobalOrdered.map((s) => s.id);
      if (!ids.length) return;
      const participantIds = task.participantIds || [];
      const nextTaskAllocations: Record<string, Record<string, number>> = {};

      for (const participantId of participantIds) {
        const row = allocationsByParticipant[participantId] || {};
        const nextRow: Record<string, number> = ids.reduce<
          Record<string, number>
        >((acc, sid) => {
          acc[sid] = 0;
          return acc;
        }, {});

        for (let i = 0; i < ids.length; i++) {
          const fromSid = ids[i];
          const targetIdx = dir === "left" ? i - 1 : i + 1;
          const targetSid =
            targetIdx >= 0 && targetIdx < ids.length ? ids[targetIdx] : fromSid;
          const val = Number(row[fromSid] || 0);
          nextRow[targetSid] = (nextRow[targetSid] || 0) + val;
        }

        nextTaskAllocations[participantId] = nextRow;
      }

      if (!Object.keys(nextTaskAllocations).length) return;

      for (const [participantId, row] of Object.entries(nextTaskAllocations)) {
        dispatchLocal({
          type: "SET_ALLOCATIONS_ROW",
          taskId: task.id,
          participantId,
          row,
        });
      }

      (async () => {
        try {
          const bulkAllocations = Object.entries(nextTaskAllocations).reduce<
            Record<string, Record<string, number>>
          >((acc, [participantId, row]) => {
            acc[participantId] = ids.reduce<Record<string, number>>(
              (inner, sid) => {
                inner[sid] = toInt(Number(row[sid] || 0));
                return inner;
              },
              {}
            );
            return acc;
          }, {});
          await upsertTaskAllocationMulti({
            taskId: task.id,
            allocations: bulkAllocations,
          }).unwrap();
        } catch (error) {
          console.error("Failed to bulk save allocations", error);
        }
      })();
    },
    [sprintsGlobalOrdered, upsertTaskAllocationMulti]
  );

  const copyRowToNextQuarter = React.useCallback(
    (
      taskId: string,
      participantId: string,
      row: Record<string, number>
    ) => {
      if (!Object.keys(row).length) return;

      const quartersWithLoad = new Set<string>();
      for (const [sid, days] of Object.entries(row)) {
        if (Number(days) > 0) {
          const sprint = sprintsById[sid];
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
      if (
        srcQuarterIndex < 0 ||
        srcQuarterIndex >= quartersSorted.length - 1
      ) {
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

      dispatchLocal({
        type: "SET_ALLOCATIONS_ROW",
        taskId,
        participantId,
        row: nextRow,
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
    },
    [quartersSorted, sprintsById, sprintsByQuarter, upsertTaskAllocationBulk]
  );

  const moveTask = React.useCallback(
    (id: string, dir: "up" | "down") => {
      const current = sortedTaskIds;
      const idx = current.indexOf(id);
      if (idx < 0) return;
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= current.length) return;

      const reordered = arrayMove(current, idx, swapIdx);
      void persistTaskOrder(reordered, id);
    },
    [persistTaskOrder, sortedTaskIds]
  );

  const toggleParticipantsVisibility = React.useCallback(
    (taskId: string, hidden: boolean) => {
      dispatchLocal({ type: "TOGGLE_HIDDEN_PARTICIPANTS", taskId, hidden });
    },
    []
  );

  const handleParticipantOrderChange = React.useCallback(
    (taskId: string, order: string[]) => {
      dispatchLocal({ type: "SET_PARTICIPANT_ORDER", taskId, order });
      applyParticipantOrderOptimistic(taskId, order);
    },
    [applyParticipantOrderOptimistic]
  );

  const taskCardActions = React.useMemo<TaskCardActions>(
    () => ({
      onStatusChange: handleStatusChange,
      onPriorityChange: handlePriorityChange,
      onUpdateTaskPatch: handleUpdateTaskPatch,
      onDuplicateTask: duplicateTask,
      onMoveTask: moveTask,
      onRemoveTask: removeTask,
      onChangeTaskQuarters: updateTaskQuarters,
      onAllocChange: handleAllocChange,
      onAllocCommit: commitCell,
      onShiftRow: shiftRow,
      onShiftTaskAllocations: shiftTaskAllocations,
      onCopyRowToNextQuarter: copyRowToNextQuarter,
      onAddParticipant: addParticipantToTask,
      onRemoveParticipant: removeParticipantFromTask,
      onChangeParticipant: replaceParticipantInTask,
      onParticipantOrderChange: handleParticipantOrderChange,
      onToggleParticipantsVisibility: toggleParticipantsVisibility,
    }),
    [
      addParticipantToTask,
      commitCell,
      copyRowToNextQuarter,
      duplicateTask,
      handleAllocChange,
      handleParticipantOrderChange,
      handlePriorityChange,
      handleStatusChange,
      handleUpdateTaskPatch,
      moveTask,
      removeParticipantFromTask,
      removeTask,
      replaceParticipantInTask,
      shiftRow,
      shiftTaskAllocations,
      toggleParticipantsVisibility,
      updateTaskQuarters,
    ]
  );

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

  const ctx = React.useMemo(
    () => ({
      participantsSortedByName,
      participantById,
      sprintsSorted: sprintsGlobalOrdered,
      quartersSorted,
      quarterFilterOptions,
      customerOptions,
      streamOptions,
      releaseOptions: releaseFilterOptions,
      releaseValueSet,
      selectedQuarterIds,
      participantSensors,
      findSprintIdByISO,
      getTaskQuarters,
    }),
    [
      participantsSortedByName,
      participantById,
      sprintsGlobalOrdered,
      quartersSorted,
      quarterFilterOptions,
      customerOptions,
      streamOptions,
      releaseFilterOptions,
      releaseValueSet,
      selectedQuarterIds,
      participantSensors,
      findSprintIdByISO,
      getTaskQuarters,
    ]
  );

  const activeTask = React.useMemo(
    () => (activeTaskId ? taskById.get(activeTaskId) ?? null : null),
    [activeTaskId, taskById]
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

      const currentIds = sortedTaskIds;
      const oldIndex = currentIds.indexOf(String(active.id));
      const newIndex = currentIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = arrayMove(currentIds, oldIndex, newIndex);
      void persistTaskOrder(reordered, String(active.id));
    },
    [persistTaskOrder, sortedTaskIds]
  );

  return (
    <Paper elevation={0} sx={{ p: 2 }}>
      <Stack spacing={2}>
        {/* Заголовок + добавление задачи */}
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

        {/* Фильтры */}
        <FiltersPanel filters={filtersConfig} />

        {/* Список задач с DnD */}
        <DndContext
          sensors={taskSensors}
          collisionDetection={closestCenter}
          onDragStart={handleTaskDragStart}
          onDragEnd={handleTaskDragEnd}
          onDragCancel={handleTaskDragCancel}
        >
          <SortableContext
            items={sortedTaskIds}
            strategy={verticalListSortingStrategy}
          >
            <Stack spacing={2}>
              {displayedTasks.map((t) => {
                const allocationsByParticipant =
                  local.allocations[t.id] || EMPTY_ALLOCATIONS_ROW;
                const participantOrder =
                  local.participantOrders[t.id] || EMPTY_STRING_ARR;
                return (
                  <SortableTaskCardItem
                    key={t.id}
                    task={t}
                    allocationsByParticipant={allocationsByParticipant}
                    participantOrder={participantOrder}
                    hiddenParticipants={local.hiddenParticipantsTaskIds.has(
                      t.id
                    )}
                    ctx={ctx}
                    actions={taskCardActions}
                  />
                );
              })}

              {!displayedTasks.length && !isFetching && (
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

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
        >
          <Typography variant="body2" color="text.secondary">
            Загружено {displayedTasksCount} задач из {totalTasksCount}
          </Typography>
          <Button
            variant="outlined"
            onClick={() => {
              if (tasks.length >= totalTasksCount || isFetching) return;
              loadNextTasksPage(effectiveTasksPageNumber);
            }}
            disabled={tasks.length >= totalTasksCount || isFetching}
          >
            {isFetching ? "Загрузка..." : "Загрузить еще"}
          </Button>
        </Stack>

        <Divider />

        <Typography variant="caption" color="text.secondary">
          Все поля редактируются по клику. Нагрузка задаётся в ячейках «участник
          × спринт». Статусы/лидер/копирование — локально на этой странице.
          Порядок задач сохраняется автоматически. Выбор релиза (ПРОМ)
          автоматически определяет спринт и подсвечивает соответствующую
          колонку. Дополнительно можно сдвигать нагрузку по всей сетке или
          копировать нагрузку участника в следующий квартал одной кнопкой.
        </Typography>
      </Stack>
    </Paper>
  );
}
