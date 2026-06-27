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
  Menu,
  Alert,
  CircularProgress,
} from "@mui/material";
import {
  Add,
  AddTask,
  Delete,
  CopyAll,
  ArrowBack,
  ArrowForward,
  Star,
  StarBorder,
  DragIndicator,
  EditNote,
  Visibility,
  VisibilityOff,
  History,
  OpenInNew,
} from "@mui/icons-material";
import { skipToken } from "@reduxjs/toolkit/query";
import { useLocation } from "react-router-dom";
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
  useGetFiltersQuery,
  useGetTaskHistoryQuery,
  useUpdateTaskJiraLinksMutation,
} from "../app/api";
import EditableNumberCell from "../components/EditableNumberCell";
import SharedBacklogTaskCard from "../components/BacklogTaskCard";
import type {
  Allocations,
  BacklogItem,
  Participant,
  Sprint,
  TaskPriority,
  Quarter,
  TaskStatus,
  Page,
  TaskHistoryItem,
} from "../types";
import { setBacklogFilters } from "../app/uiSlice";
import { useAppDispatch, useAppSelector } from "./hooks";
import FiltersPanel from "../components/filters/FiltersPanel";
import JiraExportDialog from "../components/JiraExportDialog";
import SortControls from "../components/SortControls";
import { useJiraExport } from "../contexts/JiraExportContext";
import { selectCurrentTeamKey } from "../app/teamSlice";

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
import { normalizeDayAmount } from "../utils/dayAmount";

moment.locale("ru");

const WITHOUT_QUARTER_FILTER_VALUE = "__WITHOUT_QUARTER__";
const WITHOUT_STREAM_FILTER_VALUE = "__WITHOUT_STREAM__";
const WITHOUT_CUSTOMER_FILTER_VALUE = "__WITHOUT_CUSTOMER__";
const NO_INITIAL_QUARTER_VALUE = "__NO_INITIAL_QUARTER__";
const LOAD_MORE_SENTINEL_ROOT_MARGIN = "800px";

type BacklogSortBy = "manual" | "load" | "releaseDate" | "priority";
type SortDirection = "asc" | "desc";

// ---------- Utils ----------

function byEnd(a: Sprint, b: Sprint) {
  return a.endDate.localeCompare(b.endDate);
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

function normalizeSparseRow(row?: Record<string, number>) {
  if (!row) return undefined;
  const filtered = Object.entries(row).reduce<Record<string, number>>((acc, [sprintId, days]) => {
    const value = normalizeDayAmount(Number(days) || 0);
    if (value > 0) {
      acc[sprintId] = value;
    }
    return acc;
  }, {});
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function sumTaskLoad(task: BacklogItem) {
  const fromLoads = Object.values(task.loads || {}).reduce((sum, days) => sum + normalizeDayAmount(Number(days) || 0), 0);
  if (fromLoads > 0) {
    return fromLoads;
  }
  return Object.values(task.allocations || {}).reduce(
    (taskSum, row) =>
      taskSum + Object.values(row || {}).reduce((rowSum, days) => rowSum + normalizeDayAmount(Number(days) || 0), 0),
    0
  );
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

function buildTasksSearchParams(arg: {
  quarterIds?: string[];
  withoutQuarter?: boolean;
  withoutStream?: boolean;
  withoutCustomer?: boolean;
  priority?: number[];
  statuses?: string[];
  releaseDateId?: string;
  streams?: string[];
  customers?: string[];
  search?: string;
  participantIds?: string[];
  roles?: string[];
  userStreams?: string[];
  pinnedId?: string;
  sortBy?: string;
  sortDirection?: string;
  page?: number;
  size?: number;
}) {
  const params = new URLSearchParams();

  const joinOrUndefined = (values?: string[] | number[]) => {
    if (!values || values.length === 0) return undefined;
    return values.join(",");
  };

  const quarters = joinOrUndefined(arg.quarterIds);
  if (quarters) params.set("quarterId", quarters);
  if (arg.withoutQuarter) params.set("withoutQuarter", "true");
  if (arg.withoutStream) params.set("withoutStream", "true");
  if (arg.withoutCustomer) params.set("withoutCustomer", "true");

  const priorities = joinOrUndefined(arg.priority);
  if (priorities) params.set("priority", priorities);

  const statuses = joinOrUndefined(arg.statuses);
  if (statuses) params.set("status", statuses);

  const releaseDateId = (arg.releaseDateId || "").trim();
  if (releaseDateId) params.set("releaseDateId", releaseDateId);

  const streams = joinOrUndefined(arg.streams);
  if (streams) params.set("stream", streams);

  const customers = joinOrUndefined(arg.customers);
  if (customers) params.set("customer", customers);

  const search = (arg.search || "").trim();
  if (search) params.set("search", search);

  const participantIds = joinOrUndefined(arg.participantIds);
  if (participantIds) params.set("participantId", participantIds);

  const roles = joinOrUndefined(arg.roles);
  if (roles) params.set("role", roles);

  const userStreams = joinOrUndefined(arg.userStreams);
  if (userStreams) params.set("userStream", userStreams);

  const pinnedId = (arg.pinnedId || "").trim();
  if (pinnedId) params.set("id", pinnedId);

  const sortBy = (arg.sortBy || "").trim();
  if (sortBy) params.set("sortBy", sortBy);

  const sortDirection = (arg.sortDirection || "").trim();
  if (sortDirection) params.set("sortDirection", sortDirection);

  if (typeof arg.page === "number") params.set("page", String(arg.page));
  if (typeof arg.size === "number") params.set("size", String(arg.size));

  return params;
}

function formatDateTimeRu(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  const handleCommit = React.useCallback(
    (_: unknown, next: Participant | null) => {
      setDraft(next);
      if (!next) {
        return;
      }
      if (next.id !== value.id) {
        onCommit?.(next);
      }
      setEditing(false);
    },
    [onCommit, value.id]
  );

  const handleAutocompleteClose = React.useCallback(
    (_: unknown, reason: string) => {
      if (reason === "selectOption") return;
      if (reason === "blur" || reason === "escape") {
        setEditing(false);
      }
    },
    []
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
      onClose={handleAutocompleteClose}
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

const LS_HIDDEN_PARTICIPANTS = "backlog.hiddenParticipants";

const STATUS_LABEL: Record<TaskStatus, string> = {
  inprogress: "В работе",
  done: "Выполнена",
  notdone: "Не сделана",
  canceled: "Отменена",
  partial: "Частично",
  backlog: "В бэклоге",
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
  backlog: "default",
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
  allSprints: Sprint[]
): string[] {
  const explicit = Array.isArray((task as any).quarterIds)
    ? ((task as any).quarterIds as string[]).filter(Boolean)
    : [];
  if (explicit.length) return Array.from(new Set(explicit));

  const fromAllocations = new Set<string>();

  if (task.allocations) {
    for (const row of Object.values(task.allocations)) {
      for (const [sid, days] of Object.entries(row)) {
        if (Number(days) <= 0) continue;
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
  return task.initialQuarterId ? [task.initialQuarterId] : [];
}

// taskId -> participantId -> sprintId -> days
const EMPTY_ALLOCATIONS_ROW: Record<string, Record<string, number>> = {};

// ---------- TaskCard (карточка задачи + таблица нагрузок) ----------

type TaskCardProps = {
  task: BacklogItem;
  allocationsByParticipant: Record<string, Record<string, number>>;
  participants: Participant[];
  participantMap: Map<string, Participant>;
  participantOrder: string[];
  sprintsGlobalOrdered: Sprint[];
  sprintsByQuarter: Map<string, Sprint[]>;
  quartersSorted: Quarter[];
  selectedQuarterIds: string[];
  withoutQuarterFilter: boolean;
  quarterFilterOptions: { value: string; label: string }[];
  customerOptions: string[];
  streamOptions: string[];
  releaseOptions: { value: string; label: string }[];
  participantSensors: any;
  onStatusChange: (task: BacklogItem, status: TaskStatus) => void;
  onPriorityChange: (task: BacklogItem, priority: TaskPriority) => void;
  onUpdateTaskPatch: (task: BacklogItem, patch: Partial<BacklogItem>) => void;
  onDuplicateTask: (task: BacklogItem) => void;
  onOpenTaskHistory: (task: BacklogItem) => void;
  onUpdateJiraLinks: (
    task: BacklogItem,
    payload: {
      storyUrl: string;
      participantLinks: {
        participantId: string;
        planningSprintId: string;
        jiraIssueUrl: string;
      }[];
    }
  ) => Promise<void> | void;
  onMoveTask: (id: string, dir: "up" | "down") => void;
  onRemoveTask: (task: BacklogItem) => void;
  isJiraSelected: boolean;
  onToggleJiraSelection: (task: BacklogItem) => void;
  onChangeTaskQuarters: (taskId: string, quarterIds: string[]) => void;
  getTaskQuarters: (task: BacklogItem) => string[];
  hasTaskQuarterOverride: (taskId: string) => boolean;
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
    dir: "left" | "right"
  ) => void;
  onShiftTaskAllocations: (task: BacklogItem, dir: "left" | "right") => void;
  onCopyRowToNextQuarter: (taskId: string, participantId: string) => void;
  onAddParticipant: (task: BacklogItem, participantId: string) => void;
  onRemoveParticipant: (task: BacklogItem, participantId: string) => void;
  onChangeParticipant: (
    task: BacklogItem,
    fromParticipantId: string,
    toParticipantId: string
  ) => void;
  onParticipantOrderChange: (taskId: string, nextOrder: string[]) => void;
  hiddenParticipants: boolean;
  onToggleParticipantsVisibility: (taskId: string, hidden: boolean) => void;
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

const TaskCard = React.memo(function TaskCard(props: TaskCardProps) {
  return <SharedBacklogTaskCard {...props} />;
});

// ---------- Обёртка для DnD задач ----------

type SortableTaskCardProps = Omit<TaskCardProps, "dragHandle">;

const SortableTaskCard = React.memo(function SortableTaskCard({
  task,
  ...taskCardProps
}: SortableTaskCardProps): JSX.Element {
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
        {...taskCardProps}
        dragHandle={{ attributes, listeners }}
      />
    </Box>
  );
});

type TaskCardsListProps = {
  tasks: BacklogItem[];
  allocations: Allocations;
  participantOrders: Record<string, string[]>;
  hideAllParticipants: boolean;
  hiddenParticipantsTaskIds: Set<string>;
  isFetching: boolean;
  onPersistTaskOrder: (orderedIds: string[], movedTaskId: string) => Promise<void>;
  isJiraSelected: (taskId: string) => boolean;
  onToggleJiraSelection: (task: BacklogItem) => void;
} & Omit<
  TaskCardProps,
  | "task"
  | "allocationsByParticipant"
  | "participantOrder"
  | "hiddenParticipants"
  | "isJiraSelected"
  | "dragHandle"
  | "participantSensors"
>;

const TaskCardsList = React.memo(function TaskCardsList({
  tasks,
  allocations,
  participantOrders,
  hideAllParticipants,
  hiddenParticipantsTaskIds,
  isFetching,
  onPersistTaskOrder,
  isJiraSelected,
  ...taskCardProps
}: TaskCardsListProps) {
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);

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
    () => tasks.find((t) => t.id === activeTaskId) || null,
    [activeTaskId, tasks]
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

      const currentIds = tasks.map((t) => t.id);
      const oldIndex = currentIds.indexOf(String(active.id));
      const newIndex = currentIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = arrayMove(currentIds, oldIndex, newIndex);
      void onPersistTaskOrder(reordered, String(active.id));
    },
    [onPersistTaskOrder, tasks]
  );

  return (
    <DndContext
      sensors={taskSensors}
      collisionDetection={closestCenter}
      onDragStart={handleTaskDragStart}
      onDragEnd={handleTaskDragEnd}
      onDragCancel={handleTaskDragCancel}
    >
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <Stack spacing={2}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              allocationsByParticipant={
                allocations[task.id] || EMPTY_ALLOCATIONS_ROW
              }
              participantOrder={participantOrders[task.id] || []}
              participantSensors={participantSensors}
              hiddenParticipants={
                hideAllParticipants
                  ? !hiddenParticipantsTaskIds.has(task.id)
                  : hiddenParticipantsTaskIds.has(task.id)
              }
              isJiraSelected={isJiraSelected(task.id)}
              {...taskCardProps}
            />
          ))}

          {!tasks.length && !isFetching && (
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
                  {activeTask.streams?.join(", ") || "Без стрима"}
                </Typography>
              </Stack>
            </Stack>
          </Paper>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});

const TASK_HISTORY_PAGE_SIZE = 20;

type TaskHistoryDialogProps = {
  task: BacklogItem | null;
  open: boolean;
  onClose: () => void;
  participantMap: Map<string, Participant>;
  releaseLabelById: Map<string, string>;
};

const TaskHistoryDialog = React.memo(function TaskHistoryDialog({
  task,
  open,
  onClose,
  participantMap,
  releaseLabelById,
}: TaskHistoryDialogProps) {
  const [page, setPage] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(0);
  const [items, setItems] = React.useState<TaskHistoryItem[]>([]);

  React.useEffect(() => {
    if (!open || !task) return;
    setPage(0);
    setTotalPages(0);
    setItems([]);
  }, [open, task?.id]);

  const queryArgs =
    open && task
      ? { taskId: task.id, page, size: TASK_HISTORY_PAGE_SIZE }
      : skipToken;
  const { data, isFetching, isError } = useGetTaskHistoryQuery(queryArgs);

  React.useEffect(() => {
    if (!data) return;
    setTotalPages(Math.max(0, data.page?.totalPages ?? 0));
    const incoming = data.content || [];
    setItems((prev) => {
      if (page === 0) return incoming;
      const seen = new Set(prev.map((item) => item.id));
      const merged = prev.slice();
      for (const item of incoming) {
        if (!seen.has(item.id)) {
          merged.push(item);
        }
      }
      return merged;
    });
  }, [data, page]);

  const hasMore = totalPages > 0 && page + 1 < totalPages;
  const isInitialLoading = isFetching && items.length === 0;

  const formatHistoryValue = React.useCallback(
    (field: string, value: unknown): string => {
      if (value === null || value === undefined) return "—";

      if (field === "status") {
        const key = String(value) as TaskStatus;
        return STATUS_LABEL[key] || String(value);
      }

      if (field === "releaseDateId") {
        const key = String(value).trim();
        if (!key) return "—";
        return releaseLabelById.get(key) || key;
      }

      if (field === "leaderId") {
        const key = String(value).trim();
        if (!key) return "—";
        return participantMap.get(key)?.fullName || key;
      }

      if (field === "participantIds" && Array.isArray(value)) {
        const names = value
          .map((entry) => {
            const id = String(entry).trim();
            if (!id) return "";
            return participantMap.get(id)?.fullName || id;
          })
          .filter(Boolean);
        return names.length ? names.join(", ") : "—";
      }

      if (field === "notes" && typeof value === "object" && !Array.isArray(value)) {
        const entries = Object.entries(value as Record<string, unknown>)
          .map(([participantId, note]) => {
            const text = String(note ?? "").trim();
            if (!text) return "";
            const participantName =
              participantMap.get(participantId)?.fullName || participantId;
            return `${participantName}: ${text}`;
          })
          .filter(Boolean);
        return entries.length ? entries.join(" | ") : "—";
      }

      if (Array.isArray(value)) {
        const values = value
          .map((entry) => String(entry ?? "").trim())
          .filter(Boolean);
        return values.length ? values.join(", ") : "—";
      }

      if (typeof value === "object") {
        return JSON.stringify(value);
      }

      const normalized = String(value).trim();
      return normalized || "—";
    },
    [participantMap, releaseLabelById]
  );

  const title = task?.title?.trim() ? task.title : "Задача";

  const rows = React.useMemo(
    () =>
      items.flatMap((item) => {
        const userName = item.userName || "unknown";
        const date = formatDateTimeRu(item.createdAt);
        if (!item.changes || item.changes.length === 0) {
          return [
            {
              id: `${item.id}-action`,
              userName,
              changeText: item.action || "Изменение задачи",
              date,
            },
          ];
        }

        return item.changes.map((change, index) => ({
          id: `${item.id}-${change.field}-${index}`,
          userName,
          changeText: `${change.label || change.field}: ${formatHistoryValue(
            change.field,
            change.before
          )} -> ${formatHistoryValue(change.field, change.after)}`,
          date,
        }));
      }),
    [formatHistoryValue, items]
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>История изменений: {title}</DialogTitle>
      <DialogContent dividers>
        {isInitialLoading && (
          <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
            <CircularProgress size={26} />
          </Box>
        )}

        {!isInitialLoading && isError && items.length === 0 && (
          <Alert severity="error">Не удалось загрузить историю изменений</Alert>
        )}

        {!isInitialLoading && !isError && items.length === 0 && (
          <Alert severity="info">По этой задаче пока нет изменений</Alert>
        )}

        {rows.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 220 }}>Пользователь</TableCell>
                  <TableCell>Изменение</TableCell>
                  <TableCell sx={{ width: 170 }}>Дата</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {row.userName}
                    </TableCell>
                    <TableCell>{row.changeText}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {row.date}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        {hasMore && (
          <Button
            variant="outlined"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={isFetching}
          >
            {isFetching ? "Загрузка..." : "Загрузить еще"}
          </Button>
        )}
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
});

// ---------- BacklogPage ----------

export default function BacklogPage() {
  const location = useLocation();
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
  const teamKey = useAppSelector(selectCurrentTeamKey);
  const {
    selectedTasks: jiraSelectedTasks,
    selectedCount: jiraSelectedCount,
    dialogOpen: isJiraDialogOpen,
    addTasks: addTasksToJiraCart,
    syncTasks: syncTasksInJiraCart,
    removeTask: removeTaskFromJiraCart,
    toggleTask: toggleTaskInJiraCart,
    clearTasks: clearJiraCart,
    isSelected: isTaskInJiraCart,
    closeDialog: closeJiraDialog,
  } = useJiraExport();
  const {
    priorityFilter,
    streamFilter,
    customerFilter,
    withoutStreamFilter,
    withoutCustomerFilter,
    statusFilter,
    releaseSprintFilter,
    searchQuery,
    selectedQuarterIds,
    withoutQuarterFilter,
    tasksPageSize,
    hideAllParticipants,
    sortBy,
    sortDirection,
  } = useAppSelector((s) => s.ui.backlog);

  const [, startFiltersTransition] = React.useTransition();
  const [, startTaskTransition] = React.useTransition();

  const currentQuarterId = currentQ?.id;

  const hasInitializedQuarterFilter = React.useRef(false);

  React.useEffect(() => {
    if (hasInitializedQuarterFilter.current) return;
    if (!quarters.length || !currentQuarterId) return;

    hasInitializedQuarterFilter.current = true;

    if (selectedQuarterIds.length === 0 && !withoutQuarterFilter) {
      dispatch(setBacklogFilters({ selectedQuarterIds: [currentQuarterId] }));
    }
  }, [
    quarters.length,
    currentQuarterId,
    selectedQuarterIds.length,
    withoutQuarterFilter,
    dispatch,
  ]);

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

  const TASKS_PAGE_SIZE = React.useMemo(() => {
    const sanitized = tasksPageSize.replace(/\D/g, "");
    const parsed = Number(sanitized);
    if (!Number.isFinite(parsed) || parsed <= 0) return 20;
    return Math.floor(parsed);
  }, [tasksPageSize]);
  const normalizedSearch = React.useMemo(() => searchQuery.trim(), [searchQuery]);
  const [tasksPageNumber, setTasksPageNumber] = React.useState(0);
  const [pinnedTaskId, setPinnedTaskId] = React.useState<string | null>(null);
  const [historyTask, setHistoryTask] = React.useState<BacklogItem | null>(null);
  const [isAddingAllToJira, setIsAddingAllToJira] = React.useState(false);
  const [addAllToJiraError, setAddAllToJiraError] = React.useState("");
  const [isPreparingBatchAutoDistribution, setIsPreparingBatchAutoDistribution] =
    React.useState(false);
  const [batchAutoDistributionError, setBatchAutoDistributionError] =
    React.useState("");
  const [isBatchAutoDistributionOpen, setIsBatchAutoDistributionOpen] =
    React.useState(false);
  const [batchAutoDistributionTasks, setBatchAutoDistributionTasks] =
    React.useState<BacklogItem[]>([]);
  const loadMoreSentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fromQuery = (params.get("pinnedTaskId") || "").trim();
    setPinnedTaskId(fromQuery || null);
  }, [location.search]);

  const filtersSignature = React.useMemo(
    () =>
      JSON.stringify({
        selectedQuarterIds: selectedQuarterIds.slice().sort(),
        withoutQuarterFilter,
        withoutStreamFilter,
        withoutCustomerFilter,
        priorityFilter,
        statusFilter,
        releaseSprintFilter,
        streamFilter: streamFilter.slice().sort(),
        customerFilter: customerFilter.slice().sort(),
        normalizedSearch,
        pinnedTaskId,
        tasksPageSize: TASKS_PAGE_SIZE,
        sortBy,
        sortDirection,
      }),
    [
      normalizedSearch,
      priorityFilter,
      releaseSprintFilter,
      selectedQuarterIds,
      withoutQuarterFilter,
      withoutStreamFilter,
      withoutCustomerFilter,
      statusFilter,
      streamFilter,
      customerFilter,
      pinnedTaskId,
      TASKS_PAGE_SIZE,
      sortBy,
      sortDirection,
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
      withoutQuarter: withoutQuarterFilter,
      withoutStream: withoutStreamFilter,
      withoutCustomer: withoutCustomerFilter,
      priority: priorityFilter,
      statuses: statusFilter,
      releaseDateId:
        releaseSprintFilter === "all" ? undefined : releaseSprintFilter.trim(),
      streams: streamFilter.length > 0 ? streamFilter : undefined,
      customers: customerFilter.length > 0 ? customerFilter : undefined,
      search: normalizedSearch,
      pinnedId: pinnedTaskId ?? undefined,
      sortBy,
      sortDirection,
      page: effectiveTasksPageNumber,
      size: TASKS_PAGE_SIZE,
    }),
    [
      selectedQuarterIds,
      priorityFilter,
      statusFilter,
      releaseSprintFilter,
      streamFilter,
      customerFilter,
      withoutStreamFilter,
      withoutCustomerFilter,
      normalizedSearch,
      pinnedTaskId,
      effectiveTasksPageNumber,
      TASKS_PAGE_SIZE,
      withoutQuarterFilter,
      sortBy,
      sortDirection,
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

  const {
    data: fetchedTasksPage,
    isFetching,
  } = useGetTasksQuery(tasksQueryArgs);

  const fetchedTasks = React.useMemo(
    () => fetchedTasksPage?.content ?? [],
    [fetchedTasksPage]
  );

  const totalPages = fetchedTasksPage?.page?.totalPages;
  const totalTasksCount = fetchedTasksPage?.page?.totalElements ?? 0;

  const hasMoreTasks = React.useMemo(
    () => fetchedTasks.length < totalTasksCount,
    [fetchedTasks.length, totalTasksCount]
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
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || !hasMoreTasks || isFetching) {
          return;
        }
        loadNextTasksPage(effectiveTasksPageNumber);
      },
      { root: null, rootMargin: LOAD_MORE_SENTINEL_ROOT_MARGIN, threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [effectiveTasksPageNumber, hasMoreTasks, isFetching, loadNextTasksPage]);

  const allTasks = fetchedTasks;
  React.useEffect(() => {
    if (jiraSelectedCount === 0 || allTasks.length === 0) return;
    const latestSelected = allTasks.filter((task) => isTaskInJiraCart(task.id));
    if (latestSelected.length > 0) {
      syncTasksInJiraCart(latestSelected);
    }
  }, [
    allTasks,
    isTaskInJiraCart,
    jiraSelectedCount,
    syncTasksInJiraCart,
  ]);
  const [taskQuartersMap, setTaskQuartersMap] = React.useState<
    Record<string, string[]>
  >({});

  const [allocations, setAllocations] = React.useState<Allocations>({});
  const [participantOrders, setParticipantOrders] = React.useState<
    Record<string, string[]>
  >({});
  const [hiddenParticipantsTaskIds, setHiddenParticipantsTaskIds] =
    React.useState<Set<string>>(
      () => new Set(readLS<string[]>(LS_HIDDEN_PARTICIPANTS, []))
    );
  const prevHideAllParticipants = React.useRef(hideAllParticipants);
  const prevQuarterFilterSignature = React.useRef<string | null>(null);
  const [newTaskQuarterId, setNewTaskQuarterId] = React.useState<string>("");

  React.useEffect(() => {
    if (prevHideAllParticipants.current === hideAllParticipants) return;
    prevHideAllParticipants.current = hideAllParticipants;
    writeLS(LS_HIDDEN_PARTICIPANTS, []);
    setHiddenParticipantsTaskIds(new Set());
  }, [hideAllParticipants]);

  React.useEffect(() => {
    try {
      localStorage.removeItem("backlog.quartersMap:session");
      localStorage.removeItem("backlog.quartersMap:data");
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    if (quarterIdSet.size === 0) return;
    if (selectedQuarterIds.length === 0) return;

    const validSelected = selectedQuarterIds.filter((id) =>
      quarterIdSet.has(id)
    );
    const nextSelected =
      validSelected.length > 0 || withoutQuarterFilter || !currentQuarterId
        ? validSelected
        : [currentQuarterId];
    if (shallowArrayEqual(nextSelected, selectedQuarterIds)) return;

    dispatch(setBacklogFilters({ selectedQuarterIds: nextSelected }));
  }, [selectedQuarterIds, quarterIdSet, withoutQuarterFilter, currentQuarterId, dispatch]);

  React.useEffect(() => {
    const signature = JSON.stringify({
      selectedQuarterIds: selectedQuarterIds.slice().sort(),
      withoutQuarterFilter,
    });
    if (prevQuarterFilterSignature.current === null) {
      prevQuarterFilterSignature.current = signature;
      return;
    }
    if (prevQuarterFilterSignature.current === signature) {
      return;
    }
    prevQuarterFilterSignature.current = signature;
    setTaskQuartersMap({});
  }, [selectedQuarterIds, withoutQuarterFilter]);

  React.useEffect(() => {
    const nextQuarterId = (() => {
      const prevValid =
        newTaskQuarterId === NO_INITIAL_QUARTER_VALUE ||
        (newTaskQuarterId && quarterIdSet.has(newTaskQuarterId))
          ? newTaskQuarterId
          : "";
      if (prevValid) return prevValid;
      if (withoutQuarterFilter && selectedQuarterIds.length === 0) return "";
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
    withoutQuarterFilter,
    defaultQuarterId,
    newTaskQuarterId,
    quarterIdsKey,
  ]);

  React.useEffect(() => {
    if (!quarterIdSet.size) return;
    setTaskQuartersMap((prev) => {
      let changed = false;
      const next: Record<string, string[]> = {};

      for (const [taskId, quarterIds] of Object.entries(prev)) {
        const filtered = Array.from(
          new Set(quarterIds.filter((id) => quarterIdSet.has(id)))
        );
        if (filtered.length) {
          next[taskId] = filtered;
          if (!shallowArrayEqual(filtered, quarterIds)) {
            changed = true;
          }
        } else if (quarterIds.length) {
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [quarterIdSet, quarterIdsKey]);

  // Синхронизация локального состояния allocations с данными задач
  React.useEffect(() => {
    setAllocations((prev) => {
      const next: Allocations = {};
      let changed = false;

      for (const task of allTasks) {
        const nextTask = Object.entries(task.allocations || {}).reduce<Record<string, Record<string, number>>>(
          (acc, [participantId, row]) => {
            const normalizedRow = normalizeSparseRow(row);
            if (normalizedRow) {
              acc[participantId] = normalizedRow;
            }
            return acc;
          },
          {}
        );

        if (Object.keys(nextTask).length > 0) {
          next[task.id] = nextTask;
        }

        if (JSON.stringify(prev[task.id] || {}) !== JSON.stringify(nextTask)) {
          changed = true;
        }
      }

      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [allTasks]);

  React.useEffect(() => {
    setParticipantOrders((prev) => {
      const next = { ...prev } as Record<string, string[]>;
      let changed = false;
      for (const task of allTasks) {
        const ids = task.participantIds || [];
        const existing = next[task.id];
        if (!existing) {
          next[task.id] = ids.slice();
          changed = true;
          continue;
        }
        const kept = existing.filter((id) => ids.includes(id));
        const added = ids.filter((id) => !kept.includes(id));
        const updated = [...kept, ...added];
        if (!shallowArrayEqual(updated, existing)) {
          next[task.id] = updated;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allTasks]);

  const { data: filtersData } = useGetFiltersQuery();

  const streamOptions = React.useMemo(
    () => (filtersData?.streams || []).slice().sort(),
    [filtersData?.streams]
  );

  const customerOptions = React.useMemo(
    () => (filtersData?.customers || []).slice().sort(),
    [filtersData?.customers]
  );

  const getTaskQuarters = React.useCallback(
    (task: BacklogItem): string[] => {
      const fromMap = taskQuartersMap[task.id];
      if (fromMap && fromMap.length) return fromMap;
      const fromFilter = selectedQuarterIds.filter((id) => quarterIdSet.has(id));
      if (fromFilter.length) return fromFilter;
      const derived = deriveTaskQuarters(task, allSprints).filter(
        (id) => quarterIdSet.has(id)
      );
      if (derived.length) return derived;
      return [];
    },
    [taskQuartersMap, selectedQuarterIds, quarterIdSet, allSprints]
  );

  const hasTaskQuarterOverride = React.useCallback(
    (taskId: string) => {
      const fromMap = taskQuartersMap[taskId];
      return Array.isArray(fromMap) && fromMap.length > 0;
    },
    [taskQuartersMap]
  );

  const updateTaskQuarters = React.useCallback(
    (taskId: string, quarterIds: string[]) => {
      const filtered = Array.from(
        new Set(quarterIds.filter((id) => id && quarterIdSet.has(id)))
      );
      if (!filtered.length) return;
      setTaskQuartersMap((prev) => {
        const current = prev[taskId] || [];
        if (shallowArrayEqual(current, filtered)) return prev;
        return { ...prev, [taskId]: filtered };
      });
    },
    [quarterIdSet]
  );

  const taskQuarterOptions = React.useMemo(
    () =>
      quarters
        .slice()
        .sort((a, b) => a.endDate.localeCompare(b.endDate))
        .map((q) => ({ value: q.id, label: q.name })),
    [quarters]
  );

  const quarterFilterOptions = React.useMemo(
    () => [
      { value: WITHOUT_QUARTER_FILTER_VALUE, label: "Без квартала" },
      ...taskQuarterOptions,
    ],
    [taskQuarterOptions]
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

  const streamFilterOptions = React.useMemo(
    () => [
      { value: WITHOUT_STREAM_FILTER_VALUE, label: "Без стрима" },
      ...streamOptions.map((stream) => ({ value: stream, label: stream })),
    ],
    [streamOptions]
  );

  const customerFilterOptions = React.useMemo(
    () => [
      { value: WITHOUT_CUSTOMER_FILTER_VALUE, label: "Без заказчика" },
      ...customerOptions.map((customer) => ({ value: customer, label: customer })),
    ],
    [customerOptions]
  );

  const releaseFilterOptions = React.useMemo(() => {
    const entries = releases
      .map((r: any) => ({
        id: String(r.id ?? r.promId ?? ""),
        promDate: String(r.promDate || r.prom || r.date || ""),
      }))
      .filter((entry) => entry.id && entry.promDate);

    return entries
      .sort((a, b) => moment(a.promDate).valueOf() - moment(b.promDate).valueOf())
      .map((entry) => ({
        value: entry.id,
        label: moment(entry.promDate).format("DD.MM.YYYY"),
      }));
  }, [releases]);

  const releaseLabelById = React.useMemo(
    () => new Map(releaseFilterOptions.map((option) => [option.value, option.label])),
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
  const backlogSortByOptions = React.useMemo(
    () => [
      { value: "manual", label: "Порядок" },
      { value: "load", label: "Нагрузка" },
      { value: "releaseDate", label: "Дата релиза" },
      { value: "priority", label: "Приоритет" },
    ],
    []
  );
  const handleQuarterFilterChange = React.useCallback(
    (ids: string[]) => {
      const existing = new Set(quarters.map((q) => q.id));
      const filtered = ids.filter((id) => existing.has(id));
      const nextWithoutQuarter = ids.includes(WITHOUT_QUARTER_FILTER_VALUE);
      if (
        shallowArrayEqual(filtered, selectedQuarterIds) &&
        nextWithoutQuarter === withoutQuarterFilter
      ) {
        return;
      }
      startFiltersTransition(() => {
        dispatch(
          setBacklogFilters({
            selectedQuarterIds: filtered,
            withoutQuarterFilter: nextWithoutQuarter,
          })
        );
      });
    },
    [
      quarters,
      selectedQuarterIds,
      withoutQuarterFilter,
      startFiltersTransition,
      dispatch,
    ]
  );

  const handlePriorityFilterChange = React.useCallback(
    (values: string[]) => {
      const next = values
        .map(Number)
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
      const next = values as TaskStatus[];
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
    (values: string[]) => {
      const nextWithoutStream = values.includes(WITHOUT_STREAM_FILTER_VALUE);
      const nextValues = values.filter((value) => value !== WITHOUT_STREAM_FILTER_VALUE);
      if (
        nextWithoutStream === withoutStreamFilter &&
        nextValues.length === streamFilter.length &&
        nextValues.every((v, i) => streamFilter[i] === v)
      ) {
        return;
      }
      startFiltersTransition(() => {
        dispatch(
          setBacklogFilters({
            streamFilter: nextValues,
            withoutStreamFilter: nextWithoutStream,
          })
        );
      });
    },
    [dispatch, streamFilter, startFiltersTransition, withoutStreamFilter]
  );

  const handleCustomerFilterChange = React.useCallback(
    (values: string[]) => {
      const nextWithoutCustomer = values.includes(WITHOUT_CUSTOMER_FILTER_VALUE);
      const nextValues = values.filter((value) => value !== WITHOUT_CUSTOMER_FILTER_VALUE);
      if (
        nextWithoutCustomer === withoutCustomerFilter &&
        nextValues.length === customerFilter.length &&
        nextValues.every((v, i) => customerFilter[i] === v)
      ) {
        return;
      }
      startFiltersTransition(() => {
        dispatch(
          setBacklogFilters({
            customerFilter: nextValues,
            withoutCustomerFilter: nextWithoutCustomer,
          })
        );
      });
    },
    [dispatch, customerFilter, startFiltersTransition, withoutCustomerFilter]
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

  const handleSortByChange = React.useCallback(
    (value: string) => {
      const normalized = (value || "manual") as BacklogSortBy;
      if (normalized === sortBy) return;
      startFiltersTransition(() => {
        dispatch(setBacklogFilters({ sortBy: normalized }));
      });
    },
    [dispatch, sortBy, startFiltersTransition]
  );

  const handleSortDirectionChange = React.useCallback(
    (value: string) => {
      const normalized: SortDirection = value === "desc" ? "desc" : "asc";
      if (normalized === sortDirection) return;
      startFiltersTransition(() => {
        dispatch(setBacklogFilters({ sortDirection: normalized }));
      });
    },
    [dispatch, sortDirection, startFiltersTransition]
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
  const filteredTasks = allTasks;

  const displayedTasksCount = filteredTasks.length;

  const fetchAllFilteredTasks = React.useCallback(async () => {
    const baseUrl = process.env.API_URL || "/api/v1/sprints-planning";
    const pageSize = 200;
    const tasks: BacklogItem[] = [];
    let page = 0;
    let totalPages = 1;

    while (page < totalPages) {
      const params = buildTasksSearchParams({
        ...tasksQueryArgs,
        page,
        size: pageSize,
      });
      const response = await fetch(
        `${baseUrl}/${teamKey}/tasks?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Не удалось загрузить задачи по текущим фильтрам");
      }

      const data = (await response.json()) as TasksPage;
      const pageTasks = Array.isArray(data.content) ? data.content : [];
      tasks.push(...pageTasks);

      const reportedTotalPages = Number(data.page?.totalPages || 0);
      totalPages = reportedTotalPages > 0 ? reportedTotalPages : page + 1;
      page += 1;
    }

    return tasks;
  }, [tasksQueryArgs, teamKey]);

  const handleAddAllToJira = React.useCallback(async () => {
    setAddAllToJiraError("");
    setIsAddingAllToJira(true);
    try {
      const tasks =
        totalTasksCount > filteredTasks.length
          ? await fetchAllFilteredTasks()
          : filteredTasks;
      addTasksToJiraCart(tasks);
    } catch (error) {
      console.error("Не удалось добавить задачи в корзину Jira", error);
      setAddAllToJiraError(
        "Не удалось загрузить все задачи по текущим фильтрам"
      );
    } finally {
      setIsAddingAllToJira(false);
    }
  }, [
    addTasksToJiraCart,
    fetchAllFilteredTasks,
    filteredTasks,
      totalTasksCount,
    ]);

  const resolveTaskSprintsForAutoDistribution = React.useCallback(
    (task: BacklogItem): Sprint[] => {
      const taskQuarterIds = getTaskQuarters(task);
      const taskHasQuarterOverride = hasTaskQuarterOverride(task.id);
      const quarterIdsForTask = taskHasQuarterOverride
        ? taskQuarterIds
        : selectedQuarterIds;

      if (quarterIdsForTask.length > 0) {
        return sprintsGlobalOrdered.filter((sprint) =>
          quarterIdsForTask.includes(sprint.quarterId)
        );
      }

      return withoutQuarterFilter ? [] : sprintsGlobalOrdered.slice();
    },
    [
      getTaskQuarters,
      hasTaskQuarterOverride,
      selectedQuarterIds,
      sprintsGlobalOrdered,
      withoutQuarterFilter,
    ]
  );

  const handleOpenBatchAutoDistribution = React.useCallback(async () => {
    setBatchAutoDistributionError("");
    setIsPreparingBatchAutoDistribution(true);
    try {
      const tasks =
        totalTasksCount > filteredTasks.length
          ? await fetchAllFilteredTasks()
          : filteredTasks;
      setBatchAutoDistributionTasks(tasks);
      setIsBatchAutoDistributionOpen(true);
    } catch (error) {
      console.error("Не удалось подготовить глобальное автораспределение", error);
      setBatchAutoDistributionError(
        "Не удалось загрузить все задачи по текущим фильтрам"
      );
    } finally {
      setIsPreparingBatchAutoDistribution(false);
    }
  }, [fetchAllFilteredTasks, filteredTasks, totalTasksCount]);

  const handleResetBacklogFilters = React.useCallback(() => {
    setAddAllToJiraError("");
    startFiltersTransition(() => {
      dispatch(
        setBacklogFilters({
          quarterId: "all",
          selectedQuarterIds: currentQuarterId ? [currentQuarterId] : [],
          withoutQuarterFilter: false,
          withoutStreamFilter: false,
          withoutCustomerFilter: false,
          releaseSprintFilter: "all",
          priorityFilter: [],
          streamFilter: [],
          customerFilter: [],
          statusFilter: [],
          searchQuery: "",
          tasksPageSize: "20",
          sortBy: "manual",
          sortDirection: "asc",
        })
      );
    });
  }, [currentQuarterId, dispatch, startFiltersTransition]);

  const handleOpenTaskHistory = React.useCallback((task: BacklogItem) => {
    setHistoryTask(task);
  }, []);

  const handleCloseTaskHistory = React.useCallback(() => {
    setHistoryTask(null);
  }, []);

  const [addTask] = useAddTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [updateTaskJiraLinks] = useUpdateTaskJiraLinksMutation();
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

  const handleUpdateJiraLinks = React.useCallback(
    async (
      task: BacklogItem,
      payload: {
        storyUrl: string;
        participantLinks: {
          participantId: string;
          planningSprintId: string;
          jiraIssueUrl: string;
        }[];
      }
    ) => {
      await updateTaskJiraLinks({
        taskId: task.id,
        storyUrl: payload.storyUrl,
        participantLinks: payload.participantLinks,
      }).unwrap();
    },
    [updateTaskJiraLinks]
  );

  const persistTaskOrder = React.useCallback(
    async (orderedIds: string[], movedTaskId: string) => {
      const completeIds = [
        ...orderedIds,
        ...allTasks.filter((t) => !orderedIds.includes(t.id)).map((t) => t.id),
      ];

      const targetIndex = completeIds.indexOf(movedTaskId);
      if (targetIndex < 0) return;

      applyTaskOrderOptimistic(completeIds);

      const currentOrderMap = new Map(allTasks.map((t) => [t.id, t.order]));
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
    [allTasks, applyTaskOrderOptimistic, updateTask]
  );

  const createTask = async (quarterId?: string) => {
    const created = await addTask({
      title: "Новая задача",
      description: "",
      dod: "",
      priority: 1 as TaskPriority,
      status: "inprogress" as TaskStatus,
      customers: [],
      streams: [],
      participantIds: [],
      releaseDateId: null,
      initialQuarterId: quarterId || null,
    }).unwrap();
    if (quarterId && quarterIdSet.has(quarterId)) {
      setTaskQuartersMap((prev) => ({ ...prev, [created.id]: [quarterId] }));
    }
    setPinnedTaskId(created.id);
  };

  const handleConfirmAddTask = async () => {
    try {
      await createTask(
        newTaskQuarterId && newTaskQuarterId !== NO_INITIAL_QUARTER_VALUE
          ? newTaskQuarterId
          : undefined
      );
    } catch (error) {
      console.error("Не удалось создать задачу", error);
    }
  };

  const duplicateTask = React.useCallback(
    async (task: BacklogItem) => {
      const taskAllocations = allocations[task.id] || {};
      const allocationsPayload = Object.entries(taskAllocations).reduce<
        Record<string, Record<string, number>>
      >((acc, [pid, row]) => {
        const positive = Object.entries(row)
          .map(([sid, value]) => [sid, normalizeDayAmount(Number(value) || 0)] as const)
          .filter(([, days]) => days > 0);
        if (positive.length) {
          acc[pid] = Object.fromEntries(positive);
        }
        return acc;
      }, {});

      const loadsPayload = task.loads
        ? Object.fromEntries(
            Object.entries(task.loads)
              .map(([sid, days]) => [sid, normalizeDayAmount(Number(days) || 0)] as const)
              .filter(([, days]) => days > 0)
          )
        : undefined;

      const baseOrder = Number.isFinite(task.order)
        ? Number(task.order)
        : allTasks.length;
      const copy = await addTask({
        title: `${task.title} (копия)`,
        description: (task as any).description,
        dod: task.dod,
        priority: task.priority,
        status: task.status ?? "inprogress",
        customers: task.customers?.slice() || [],
        streams: task.streams?.slice() || [],
        participantIds: task.participantIds.slice(),
        releaseDateId: task.releaseDateId ?? null,
        initialQuarterId: task.initialQuarterId ?? null,
        leaderId: (task as any).leaderId ?? undefined,
        order: baseOrder + 1,
        loads: loadsPayload,
        allocations: Object.keys(allocationsPayload).length
          ? allocationsPayload
          : undefined,
      }).unwrap();

      return copy;
    },
    [addTask, allocations, allTasks.length]
  );

  const removeTask = React.useCallback(
    async (t: BacklogItem) => {
      if (!window.confirm(`Удалить задачу «${t.title}»?`)) return;
      await deleteTask({ id: t.id }).unwrap();

      setAllocations((prev) => {
        const copy = { ...prev };
        delete copy[t.id];
        return copy;
      });
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
      startTaskTransition(() => {
        upsertTaskAllocation({
          taskId,
          participantId,
          sprintId,
          days: normalizeDayAmount(Number(value) || 0),
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
      setAllocations((prev) => {
        const prevTask = prev[taskId] || {};
        const prevRow = prevTask[participantId] || {};
        const nextValue = normalizeDayAmount(Number(value) || 0);
        const current = prevRow[sprintId] ?? 0;
        if (current === nextValue) return prev;
        const nextRow = { ...prevRow };
        if (nextValue > 0) {
          nextRow[sprintId] = nextValue;
        } else {
          delete nextRow[sprintId];
        }
        const nextTask = { ...prevTask };
        if (Object.keys(nextRow).length > 0) {
          nextTask[participantId] = nextRow;
        } else {
          delete nextTask[participantId];
        }
        if (Object.keys(nextTask).length === 0) {
          const { [taskId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [taskId]: nextTask };
      });
    },
    []
  );

  const addParticipantToTask = React.useCallback(
    (task: BacklogItem, pid: string) => {
      if (!pid) return;
      if (task.participantIds?.includes(pid)) return;

      updateField(task, { participantIds: [...task.participantIds, pid] });

      setParticipantOrders((prev) => ({
        ...prev,
        [task.id]: [...(prev[task.id] || task.participantIds), pid],
      }));
    },
    [updateField]
  );

  const removeParticipantFromTask = React.useCallback(
    async (task: BacklogItem, pid: string) => {
      setAllocations((prev) => {
        const prevTask = prev[task.id];
        if (!prevTask || !prevTask[pid]) return prev;
        const { [pid]: _, ...restRows } = prevTask;
        return { ...prev, [task.id]: restRows };
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
    },
    [updateField]
  );

  const replaceParticipantInTask = React.useCallback(
    async (task: BacklogItem, fromPid: string, toPid: string) => {
      if (!toPid || fromPid === toPid) return;
      if (!task.participantIds.includes(fromPid)) return;
      if (task.participantIds.includes(toPid)) return;

      const participantIds = task.participantIds.map((id) =>
        id === fromPid ? toPid : id
      );
      const taskAllocations = allocations[task.id] || {};
      const rowToMove = taskAllocations[fromPid] || {};
      const nextAllocations = Object.entries(taskAllocations).reduce<
        Record<string, Record<string, number>>
      >((acc, [pid, row]) => {
        if (pid === fromPid) return acc;
        acc[pid] = { ...row };
        return acc;
      }, {});

      nextAllocations[toPid] = { ...rowToMove };

      setAllocations((prev) => {
        const prevTask = prev[task.id] || {};
        const movedRow = prevTask[fromPid] || rowToMove;
        const { [fromPid]: _, ...rest } = prevTask;
        return {
          ...prev,
          [task.id]: {
            ...rest,
            [toPid]: { ...movedRow },
          },
        };
      });

      setParticipantOrders((prev) => {
        const currentOrder = prev[task.id] || task.participantIds;
        return {
          ...prev,
          [task.id]: currentOrder.map((id) => (id === fromPid ? toPid : id)),
        };
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
    [allocations, updateField]
  );

  const shiftRow = React.useCallback(
    (taskId: string, participantId: string, dir: "left" | "right") => {
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
        if (val > 0) {
          next[targetSid] = (next[targetSid] || 0) + val;
        }
      }

      setAllocations((prev) => {
        const prevTask = prev[taskId] || {};
        const nextTask = { ...prevTask };
        if (Object.keys(next).length > 0) {
          nextTask[participantId] = next;
        } else {
          delete nextTask[participantId];
        }
        if (Object.keys(nextTask).length === 0) {
          const { [taskId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [taskId]: nextTask };
      });

      (async () => {
        try {
          const bulkAllocations = Object.entries(next).reduce<Record<string, number>>((acc, [sid, days]) => {
            acc[sid] = normalizeDayAmount(Number(days) || 0);
            return acc;
          }, {});
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
    [allocations, sprintsGlobalOrdered, upsertTaskAllocationMulti]
  );

  const shiftTaskAllocations = React.useCallback(
    (task: BacklogItem, dir: "left" | "right") => {
      const ids = sprintsGlobalOrdered.map((s) => s.id);
      if (!ids.length) return;
      const taskAllocations = allocations[task.id] || {};
      const participantIds = task.participantIds || [];
      const nextTaskAllocations: Record<string, Record<string, number>> = {};

      for (const participantId of participantIds) {
        const row = taskAllocations[participantId] || {};
        const nextRow: Record<string, number> = {};

        for (let i = 0; i < ids.length; i++) {
          const fromSid = ids[i];
          const targetIdx = dir === "left" ? i - 1 : i + 1;
          const targetSid =
            targetIdx >= 0 && targetIdx < ids.length ? ids[targetIdx] : fromSid;
          const val = Number(row[fromSid] || 0);
          if (val > 0) {
            nextRow[targetSid] = (nextRow[targetSid] || 0) + val;
          }
        }

        if (Object.keys(nextRow).length > 0) {
          nextTaskAllocations[participantId] = nextRow;
        }
      }

      if (!Object.keys(nextTaskAllocations).length) return;

      setAllocations((prev) => {
        const prevTask = prev[task.id] || {};
        return {
          ...prev,
          [task.id]: { ...prevTask, ...nextTaskAllocations },
        };
      });

      (async () => {
        try {
          const bulkAllocations = Object.entries(nextTaskAllocations).reduce<
            Record<string, Record<string, number>>
          >((acc, [participantId, row]) => {
            acc[participantId] = ids.reduce<Record<string, number>>(
              (inner, sid) => {
                inner[sid] = normalizeDayAmount(Number(row[sid] || 0));
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
    [allocations, sprintsGlobalOrdered, upsertTaskAllocationMulti]
  );

  const copyRowToNextQuarter = React.useCallback(
    (taskId: string, participantId: string) => {
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
        const prevTask = prev[taskId] || {};
        return {
          ...prev,
          [taskId]: { ...prevTask, [participantId]: nextRow },
        };
      });

      (async () => {
        try {
          const bulkAllocations = Object.entries(nextRow).reduce<
            Record<string, number>
          >((acc, [sid, days]) => {
            acc[sid] = normalizeDayAmount(Number(days) || 0);
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
    [
      allocations,
      sprintById,
      quartersSorted,
      sprintsByQuarter,
      upsertTaskAllocationBulk,
    ]
  );

  const moveTask = React.useCallback(
    (id: string, dir: "up" | "down") => {
      const current = filteredTasks.map((t) => t.id);
      const idx = current.indexOf(id);
      if (idx < 0) return;
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= current.length) return;

      const reordered = arrayMove(current, idx, swapIdx);
      void persistTaskOrder(reordered, id);
    },
    [filteredTasks, persistTaskOrder]
  );

  const handleParticipantOrderChange = React.useCallback(
    (taskId: string, order: string[]) => {
      setParticipantOrders((prev) => {
        const current = prev[taskId];
        if (current && shallowArrayEqual(current, order)) return prev;
        return { ...prev, [taskId]: order };
      });
      applyParticipantOrderOptimistic(taskId, order);
    },
    [applyParticipantOrderOptimistic]
  );

  const toggleParticipantsVisibility = React.useCallback(
    (taskId: string, hidden: boolean) => {
      // hiddenParticipantsTaskIds используется как набор исключений:
      // - hideAllParticipants=true: исключения = задачи, которые ПОКАЗАНЫ
      // - hideAllParticipants=false: исключения = задачи, которые СКРЫТЫ
      const isException = hideAllParticipants ? !hidden : hidden;

      setHiddenParticipantsTaskIds((prev) => {
        const next = new Set(prev);
        if (isException) {
          next.add(taskId);
        } else {
          next.delete(taskId);
        }
        writeLS(LS_HIDDEN_PARTICIPANTS, Array.from(next));
        return next;
      });
    },
    [hideAllParticipants]
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
                }}
              >
                <MenuItem value={NO_INITIAL_QUARTER_VALUE}>Без квартала</MenuItem>
                {quartersSorted.map((q) => (
                  <MenuItem key={q.id} value={q.id}>
                    {q.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleConfirmAddTask}
            >
              Добавить задачу
            </Button>
          </Stack>
        </Stack>

        {/* Фильтры */}
        <FiltersPanel
          layout="wrap"
          filters={[
            {
              type: "autocomplete",
              key: "quarters",
              minWidth: 200,
              props: {
                multiple: true,
                allowCustom: false,
                label: "Фильтр по кварталам",
                options: quarterFilterOptions,
                value: withoutQuarterFilter
                  ? [...selectedQuarterIds, WITHOUT_QUARTER_FILTER_VALUE]
                  : selectedQuarterIds,
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
                sortOptions: false,
              },
            },
            {
              type: "autocomplete",
              key: "stream",
              minWidth: 200,
              props: {
                multiple: true,
                allowCustom: false,
                label: "Стрим по задаче",
                options: streamFilterOptions,
                value: withoutStreamFilter
                  ? [...streamFilter, WITHOUT_STREAM_FILTER_VALUE]
                  : streamFilter,
                onChange: handleStreamFilterChange,
              },
            },
            {
              type: "autocomplete",
              key: "customer",
              minWidth: 200,
              props: {
                multiple: true,
                allowCustom: false,
                label: "Заказчик",
                options: customerFilterOptions,
                value: withoutCustomerFilter
                  ? [...customerFilter, WITHOUT_CUSTOMER_FILTER_VALUE]
                  : customerFilter,
                onChange: handleCustomerFilterChange,
              },
            },
            {
              type: "autocomplete",
              key: "tasks-page-size",
              minWidth: 200,
              maxWidth: 180,
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
              maxWidth: 420,
              props: {
                label: "Поиск по названию/описанию/DOD",
                value: searchQuery,
                onCommit: handleSearchCommit,
                placeholder: "Введите текст",
                commitOnBlurOnly: true,
              },
            },
          ]}
          actions={
            <Stack
              direction="row"
              spacing={1}
              justifyContent={{ xs: "stretch", md: "flex-end" }}
              sx={{ width: "100%" }}
            >
              <Button
                size="small"
                variant="text"
                color="inherit"
                onClick={handleResetBacklogFilters}
                sx={{ color: "text.secondary" }}
              >
                Очистить
              </Button>
            </Stack>
          }
        />
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "stretch", sm: "center" }}
          justifyContent="space-between"
        >
          <SortControls
            value={sortBy}
            onChange={handleSortByChange}
            options={backlogSortByOptions}
            direction={sortDirection}
            onDirectionChange={handleSortDirectionChange}
            sx={{ width: { xs: "100%", md: "fit-content" } }}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddTask />}
            onClick={handleAddAllToJira}
            disabled={totalTasksCount === 0 || isAddingAllToJira}
          >
            {isAddingAllToJira
              ? "Добавляем..."
              : `Добавить все (${totalTasksCount || displayedTasksCount})`}
          </Button>
        </Stack>

        {addAllToJiraError && <Alert severity="error">{addAllToJiraError}</Alert>}
        {/* Список задач с DnD */}
        <TaskCardsList
          tasks={filteredTasks}
          allocations={allocations}
          participantOrders={participantOrders}
          hideAllParticipants={hideAllParticipants}
          hiddenParticipantsTaskIds={hiddenParticipantsTaskIds}
          isFetching={isFetching}
          onPersistTaskOrder={persistTaskOrder}
          participants={participants}
          participantMap={participantMap}
          sprintsGlobalOrdered={sprintsGlobalOrdered}
          sprintsByQuarter={sprintsByQuarter}
          quartersSorted={quartersSorted}
          selectedQuarterIds={selectedQuarterIds}
          withoutQuarterFilter={withoutQuarterFilter}
          quarterFilterOptions={taskQuarterOptions}
          customerOptions={customerOptions}
          streamOptions={streamOptions}
          releaseOptions={releaseFilterOptions}
          onStatusChange={handleStatusChange}
          onPriorityChange={handlePriorityChange}
          onUpdateTaskPatch={handleUpdateTaskPatch}
          onDuplicateTask={duplicateTask}
          onOpenTaskHistory={handleOpenTaskHistory}
          onUpdateJiraLinks={handleUpdateJiraLinks}
          onMoveTask={moveTask}
          onRemoveTask={removeTask}
          isJiraSelected={isTaskInJiraCart}
          onToggleJiraSelection={toggleTaskInJiraCart}
          onChangeTaskQuarters={updateTaskQuarters}
          getTaskQuarters={getTaskQuarters}
          hasTaskQuarterOverride={hasTaskQuarterOverride}
          onAllocChange={handleAllocChange}
          onAllocCommit={commitCell}
          onShiftRow={shiftRow}
          onShiftTaskAllocations={shiftTaskAllocations}
          onCopyRowToNextQuarter={copyRowToNextQuarter}
          onAddParticipant={addParticipantToTask}
          onRemoveParticipant={removeParticipantFromTask}
          onChangeParticipant={replaceParticipantInTask}
          onParticipantOrderChange={handleParticipantOrderChange}
          onToggleParticipantsVisibility={toggleParticipantsVisibility}
        />

        <Box ref={loadMoreSentinelRef} sx={{ height: 1 }} />

        <TaskHistoryDialog
          task={historyTask}
          open={Boolean(historyTask)}
          onClose={handleCloseTaskHistory}
          participantMap={participantMap}
          releaseLabelById={releaseLabelById}
        />

        <JiraExportDialog
          open={isJiraDialogOpen}
          tasks={jiraSelectedTasks}
          participantMap={participantMap}
          sprints={sprintsGlobalOrdered}
          releases={releases}
          onClose={closeJiraDialog}
          onRemoveTask={removeTaskFromJiraCart}
          onClearTasks={clearJiraCart}
        />

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
              if (fetchedTasks.length >= totalTasksCount || isFetching) return;
              loadNextTasksPage(effectiveTasksPageNumber);
            }}
            disabled={fetchedTasks.length >= totalTasksCount || isFetching}
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
