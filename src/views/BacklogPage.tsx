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
  ArrowUpward,
  ArrowDownward,
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
  TaskHistoryItem,
} from "../types";
import { setBacklogFilters } from "../app/uiSlice";
import { useAppDispatch, useAppSelector } from "./hooks";
import FilterAutocomplete from "../components/filters/FilterAutocomplete";
import FiltersPanel from "../components/filters/FiltersPanel";
import JiraExportDialog from "../components/JiraExportDialog";
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

moment.locale("ru");

const WITHOUT_QUARTER_FILTER_VALUE = "__WITHOUT_QUARTER__";
const NO_INITIAL_QUARTER_VALUE = "__NO_INITIAL_QUARTER__";

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

function buildTasksSearchParams(arg: {
  quarterIds?: string[];
  withoutQuarter?: boolean;
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

const TaskCard = React.memo(function TaskCard({
  task,
  allocationsByParticipant,
  participants,
  participantMap,
  participantOrder,
  sprintsGlobalOrdered,
  sprintsByQuarter,
  quartersSorted,
  selectedQuarterIds,
  withoutQuarterFilter,
  quarterFilterOptions,
  customerOptions,
  streamOptions,
  releaseOptions,
  participantSensors,
  onStatusChange,
  onPriorityChange,
  onUpdateTaskPatch,
  onDuplicateTask,
  onOpenTaskHistory,
  onMoveTask,
  onRemoveTask,
  isJiraSelected,
  onToggleJiraSelection,
  onChangeTaskQuarters,
  getTaskQuarters,
  hasTaskQuarterOverride,
  onAllocChange,
  onAllocCommit,
  onShiftRow,
  onShiftTaskAllocations,
  onCopyRowToNextQuarter,
  onAddParticipant,
  onRemoveParticipant,
  onChangeParticipant,
  onParticipantOrderChange,
  hiddenParticipants,
  onToggleParticipantsVisibility,
  dragHandle,
}: TaskCardProps) {
  const rows = allocationsByParticipant || {};
  const taskStatus = task.status ?? "inprogress";
  const taskQuarterIds = getTaskQuarters(task);
  const taskHasQuarterOverride = hasTaskQuarterOverride(task.id);
  const [selectedParticipantToAdd, setSelectedParticipantToAdd] =
    React.useState<Participant | null>(null);
  const addParticipantInputRef = React.useRef<HTMLInputElement | null>(null);

  const effectiveSprints = React.useMemo(() => {
    const quarterIdsForTask = taskHasQuarterOverride
      ? taskQuarterIds
      : selectedQuarterIds;

    if (quarterIdsForTask.length > 0) {
      return sprintsGlobalOrdered.filter((s) =>
        quarterIdsForTask.includes(s.quarterId)
      );
    }

    return withoutQuarterFilter ? [] : sprintsGlobalOrdered.slice();
  }, [
    sprintsGlobalOrdered,
    selectedQuarterIds,
    withoutQuarterFilter,
    taskQuarterIds,
    taskHasQuarterOverride,
  ]);

  const orderedParticipantIds =
    participantOrder.length > 0 ? participantOrder : task.participantIds || [];
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

  const leaderPid = (task as any).leaderId || undefined;
  const releaseDateId = task.releaseDateId || "";
  const relSprintId = task.releaseSprintId || "";

  const [customersDraft, setCustomersDraft] = React.useState<string[]>(
    task.customers || []
  );
  const [streamsDraft, setStreamsDraft] = React.useState<string[]>(
    task.streams || []
  );
  const [customersInput, setCustomersInput] = React.useState("");
  const [streamsInput, setStreamsInput] = React.useState("");
  const [noteParticipant, setNoteParticipant] =
    React.useState<Participant | null>(null);
  const [noteDraft, setNoteDraft] = React.useState("");
  const [jiraMenuAnchorEl, setJiraMenuAnchorEl] =
    React.useState<HTMLElement | null>(null);
  const [jiraMenuParticipantId, setJiraMenuParticipantId] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    setCustomersDraft(task.customers || []);
  }, [task.customers]);

  React.useEffect(() => {
    setStreamsDraft(task.streams || []);
  }, [task.streams]);

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

  const handleOpenJiraMenu = React.useCallback(
    (participantId: string) => (event: React.MouseEvent<HTMLElement>) => {
      setJiraMenuParticipantId(participantId);
      setJiraMenuAnchorEl(event.currentTarget);
    },
    []
  );

  const handleCloseJiraMenu = React.useCallback(() => {
    setJiraMenuAnchorEl(null);
    setJiraMenuParticipantId(null);
  }, []);

  const jiraMenuParticipantIssues = React.useMemo(
    () => (jiraMenuParticipantId ? task.jiraIssues?.[jiraMenuParticipantId] || {} : {}),
    [jiraMenuParticipantId, task.jiraIssues]
  );

  const tooltipContent = (
    <Stack spacing={0.5} sx={{ maxWidth: 360 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        Заголовок: {task.title || "—"}
      </Typography>
      <Typography variant="body2">
        Описание: {task.description || "—"}
      </Typography>
      <Typography variant="body2">DOD: {task.dod || "—"}</Typography>
    </Stack>
  );

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

  const assignedParticipantIds = task.participantIds || [];
  const availableParticipants = participants
    .filter((p) => !assignedParticipantIds.includes(p.id))
    .sort((a, b) =>
      a.fullName.localeCompare(b.fullName, "ru", { sensitivity: "base" })
    );

  React.useEffect(() => {
    if (
      selectedParticipantToAdd &&
      !availableParticipants.some((p) => p.id === selectedParticipantToAdd.id)
    ) {
      setSelectedParticipantToAdd(null);
    }
  }, [availableParticipants, selectedParticipantToAdd]);

  const allowedReleaseValues = React.useMemo(
    () => new Set(releaseOptions.map((opt) => opt.value)),
    [releaseOptions]
  );
  const normalizedReleaseValue = allowedReleaseValues.has(releaseDateId)
    ? releaseDateId
    : "";

  const clampedTextSx = {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
    wordBreak: "break-word" as const,
  };

  const HeaderSprint = React.useCallback(
    ({ s, highlight }: { s: Sprint; highlight?: boolean }) => (
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
    ),
    []
  );

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
        <Tooltip title={tooltipContent} arrow placement="top-start">
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
            options={quarterFilterOptions}
            value={taskQuarterIds}
            onChange={(values) => {
              if (!values.length) return;
              onChangeTaskQuarters(task.id, values);
            }}
            sx={{ minWidth: 200, maxWidth: 240, flexShrink: 0 }}
          />

          {/* Заказчик (множественный выбор) */}
          <Autocomplete
            size="small"
            multiple
            freeSolo
            options={customerOptions}
            value={customersDraft}
            inputValue={customersInput}
            onInputChange={(_, value, reason) => {
              if (reason === "input") setCustomersInput(value);
              else if (reason === "reset" || reason === "clear") setCustomersInput("");
            }}
            onChange={(_, values) => {
              const filtered = (values as string[]).filter(
                (v) => typeof v === "string" && v.trim()
              );
              setCustomersDraft(filtered);
              setCustomersInput("");
              const prev = task.customers || [];
              if (
                filtered.length !== prev.length ||
                !filtered.every((v, i) => prev[i] === v)
              ) {
                onUpdateTaskPatch(task, { customers: filtered });
              }
            }}
            onBlur={() => {
              const trimmed = customersInput.trim();
              const alreadyExists = customersDraft.some(
                (c) => c.toLowerCase() === trimmed.toLowerCase()
              );
              if (trimmed && !alreadyExists) {
                const next = [...customersDraft, trimmed];
                setCustomersDraft(next);
                setCustomersInput("");
                onUpdateTaskPatch(task, { customers: next });
              } else {
                setCustomersInput("");
              }
            }}
            renderInput={(params) => (
              <TextField {...params} label="Заказчик" size="small" />
            )}
            sx={{ minWidth: 180, maxWidth: 300, flexShrink: 0 }}
          />

          {/* Стрим (множественный выбор) */}
          <Autocomplete
            size="small"
            multiple
            freeSolo
            options={streamOptions}
            value={streamsDraft}
            inputValue={streamsInput}
            onInputChange={(_, value, reason) => {
              if (reason === "input") setStreamsInput(value);
              else if (reason === "reset" || reason === "clear") setStreamsInput("");
            }}
            onChange={(_, values) => {
              const filtered = (values as string[]).filter(
                (v) => typeof v === "string" && v.trim()
              );
              setStreamsDraft(filtered);
              setStreamsInput("");
              const prev = task.streams || [];
              if (
                filtered.length !== prev.length ||
                !filtered.every((v, i) => prev[i] === v)
              ) {
                onUpdateTaskPatch(task, { streams: filtered });
              }
            }}
            onBlur={() => {
              const trimmed = streamsInput.trim();
              const alreadyExists = streamsDraft.some(
                (s) => s.toLowerCase() === trimmed.toLowerCase()
              );
              if (trimmed && !alreadyExists) {
                const next = [...streamsDraft, trimmed];
                setStreamsDraft(next);
                setStreamsInput("");
                onUpdateTaskPatch(task, { streams: next });
              } else {
                setStreamsInput("");
              }
            }}
            renderInput={(params) => (
              <TextField {...params} label="Стрим" size="small" />
            )}
            sx={{ minWidth: 180, maxWidth: 300, flexShrink: 0 }}
          />

          {/* Релиз (ПРОМ) */}
          <TextField
            select
            size="small"
            label="Релиз (ПРОМ)"
            value={normalizedReleaseValue}
            onChange={(e) => {
              const nextId = String(e.target.value);
              onUpdateTaskPatch(task, {
                releaseDateId: nextId,
              });
            }}
            sx={{ minWidth: 180, maxWidth: 220, flexShrink: 0 }}
            InputLabelProps={{ shrink: true }}
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
                onClick={() => onShiftTaskAllocations(task, "left")}
              >
                <ArrowBack fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Сдвинуть всех участников вправо (по всем спринтам)">
              <IconButton
                size="small"
                onClick={() => onShiftTaskAllocations(task, "right")}
              >
                <ArrowForward fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Дублировать">
              <IconButton size="small" onClick={() => onDuplicateTask(task)}>
                <CopyAll fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip
              title={
                isJiraSelected
                  ? "Убрать из корзины Jira"
                  : "Добавить в корзину Jira"
              }
            >
              <IconButton
                size="small"
                onClick={() => onToggleJiraSelection(task)}
                sx={{ color: isJiraSelected ? "success.main" : undefined }}
              >
                <Add fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="История изменений">
              <IconButton
                size="small"
                onClick={() => onOpenTaskHistory(task)}
              >
                <History fontSize="small" />
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
                  <HeaderSprint
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
                  const participantEditOptions = participants.filter(
                    (candidate) =>
                      candidate.id === p.id ||
                      !assignedParticipantIds.includes(candidate.id)
                  );
                  const participantNote = task.notes?.[p.id] ?? "";
                  const participantJiraIssues = task.jiraIssues?.[p.id] || {};
                  const hasNote = participantNote.trim().length > 0;
                  const hasDisplayedJiraIssue = effectiveSprints.some((s) =>
                    Boolean(participantJiraIssues[s.id]?.jiraIssueUrl)
                  );

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
                                  onChangeParticipant(task, p.id, next.id)
                                }
                              />
                            </Stack>
                          </TableCell>

                          {effectiveSprints.map((s) => {
                            return (
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
                            );
                          })}

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
                                title="Jira по отображаемым спринтам"
                              >
                                <IconButton
                                  size="small"
                                  color={hasDisplayedJiraIssue ? "info" : "default"}
                                  onClick={handleOpenJiraMenu(p.id)}
                                >
                                  <OpenInNew fontSize="small" />
                                </IconButton>
                              </Tooltip>
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
                                    onShiftRow(task.id, p.id, "left")
                                  }
                                >
                                  <ArrowBack fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              <Tooltip title="Сдвинуть вправо (по всем спринтам)">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    onShiftRow(task.id, p.id, "right")
                                  }
                                >
                                  <ArrowForward fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              <Tooltip title="Скопировать нагрузку в следующий квартал">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    onCopyRowToNextQuarter(task.id, p.id)
                                  }
                                >
                                  <CopyAll fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              <Tooltip title="Удалить участника из задачи">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    onRemoveParticipant(task, p.id)
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
                          onAddParticipant(task, value.id);
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

      <Menu
        anchorEl={jiraMenuAnchorEl}
        open={Boolean(jiraMenuAnchorEl)}
        onClose={handleCloseJiraMenu}
        keepMounted
      >
        {effectiveSprints.length === 0 ? (
          <MenuItem disabled>Спринты не отображаются</MenuItem>
        ) : (
          effectiveSprints.map((sprint) => {
            const sprintJiraIssue = jiraMenuParticipantIssues[sprint.id];
            const sprintLabel = `${moment(sprint.startDate).format("DD.MM.YYYY")} — ${moment(
              sprint.endDate
            ).format("DD.MM.YYYY")}`;

            if (sprintJiraIssue?.jiraIssueUrl) {
              return (
                <MenuItem
                  key={sprint.id}
                  component="a"
                  href={sprintJiraIssue.jiraIssueUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handleCloseJiraMenu}
                >
                  <Stack
                    direction="row"
                    spacing={2}
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ width: "100%", minWidth: 360 }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {sprintLabel}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {sprint.name}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="primary">
                      {sprintJiraIssue.jiraIssueKey}
                    </Typography>
                  </Stack>
                </MenuItem>
              );
            }

            return (
              <MenuItem key={sprint.id} disabled>
                <Stack
                  direction="row"
                  spacing={2}
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ width: "100%", minWidth: 360 }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {sprintLabel}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {sprint.name}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.disabled">
                    —
                  </Typography>
                </Stack>
              </MenuItem>
            );
          })
        )}
      </Menu>

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
    statusFilter,
    releaseSprintFilter,
    searchQuery,
    selectedQuarterIds,
    withoutQuarterFilter,
    tasksPageSize,
    hideAllParticipants,
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
        priorityFilter,
        statusFilter,
        releaseSprintFilter,
        streamFilter: streamFilter.slice().sort(),
        customerFilter: customerFilter.slice().sort(),
        normalizedSearch,
        pinnedTaskId,
        tasksPageSize: TASKS_PAGE_SIZE,
      }),
    [
      normalizedSearch,
      priorityFilter,
      releaseSprintFilter,
      selectedQuarterIds,
      withoutQuarterFilter,
      statusFilter,
      streamFilter,
      customerFilter,
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
      withoutQuarter: withoutQuarterFilter,
      priority: priorityFilter,
      statuses: statusFilter,
      releaseDateId:
        releaseSprintFilter === "all" ? undefined : releaseSprintFilter.trim(),
      streams: streamFilter.length > 0 ? streamFilter : undefined,
      customers: customerFilter.length > 0 ? customerFilter : undefined,
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
      customerFilter,
      normalizedSearch,
      pinnedTaskId,
      effectiveTasksPageNumber,
      TASKS_PAGE_SIZE,
      withoutQuarterFilter,
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
    if (shallowArrayEqual(validSelected, selectedQuarterIds)) return;

    dispatch(setBacklogFilters({ selectedQuarterIds: validSelected }));
  }, [selectedQuarterIds, quarterIdSet, dispatch]);

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
      const next: Allocations = { ...prev };
      let changed = false;
      for (const t of allTasks) {
        const taskAllocations: Record<string, Record<string, number>> = next[
          t.id
        ] ?? (next[t.id] = {});
        const pids = t.participantIds || [];

        Object.keys(taskAllocations).forEach((pid) => {
          if (!pids.includes(pid)) {
            delete taskAllocations[pid];
            changed = true;
          }
        });

        for (const pid of pids) {
          const participantAllocations: Record<string, number> =
            taskAllocations[pid] ?? (taskAllocations[pid] = {});
          for (const s of allSprints) {
            const existing = participantAllocations[s.id];
            const incoming = t.allocations?.[pid]?.[s.id];
            const value = Number(incoming ?? existing ?? 0) || 0;
            if (participantAllocations[s.id] !== value) {
              participantAllocations[s.id] = value;
              changed = true;
            }
          }
        }
      }
      return changed ? next : prev;
    });
  }, [allTasks, allSprints]);

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

  const streamOptions = React.useMemo(() => {
    const s = new Set<string>();
    // From filters API
    if (filtersData?.streams) {
      filtersData.streams.forEach((v) => s.add(v));
    }
    // From tasks
    for (const t of allTasks) {
      if (t.streams) {
        t.streams.forEach((v) => {
          if (v?.trim()) s.add(v.trim());
        });
      }
    }
    return Array.from(s).sort();
  }, [allTasks, filtersData?.streams]);

  const customerOptions = React.useMemo(() => {
    const s = new Set<string>();
    // From filters API
    if (filtersData?.customers) {
      filtersData.customers.forEach((v) => s.add(v));
    }
    // From tasks
    for (const t of allTasks) {
      if (t.customers) {
        t.customers.forEach((v) => {
          if (v?.trim()) s.add(v.trim());
        });
      }
    }
    return Array.from(s).sort();
  }, [allTasks, filtersData?.customers]);

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
      if (
        values.length === streamFilter.length &&
        values.every((v, i) => streamFilter[i] === v)
      ) {
        return;
      }
      startFiltersTransition(() => {
        dispatch(setBacklogFilters({ streamFilter: values }));
      });
    },
    [dispatch, streamFilter, startFiltersTransition]
  );

  const handleCustomerFilterChange = React.useCallback(
    (values: string[]) => {
      if (
        values.length === customerFilter.length &&
        values.every((v, i) => customerFilter[i] === v)
      ) {
        return;
      }
      startFiltersTransition(() => {
        dispatch(setBacklogFilters({ customerFilter: values }));
      });
    },
    [dispatch, customerFilter, startFiltersTransition]
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
  const deferredStatusFilter = React.useDeferredValue(statusFilter);

  const filteredTasks = React.useMemo(() => {
    const byStatus =
      deferredStatusFilter.length === 0
        ? allTasks
        : allTasks.filter((t) => {
            const st = t.status ?? "inprogress";
            return deferredStatusFilter.includes(st);
          });

    const pinnedTask = pinnedTaskId
      ? allTasks.find((t) => t.id === pinnedTaskId) ?? null
      : null;
    const withPinned =
      pinnedTask && !byStatus.some((t) => t.id === pinnedTask.id)
        ? [pinnedTask, ...byStatus]
        : byStatus;

    const withOrder = withPinned.slice().sort((a, b) => {
      if (pinnedTaskId) {
        if (a.id === pinnedTaskId) return -1;
        if (b.id === pinnedTaskId) return 1;
      }
      const oa = Number.isFinite(a.order)
        ? Number(a.order)
        : Number.MAX_SAFE_INTEGER;
      const ob = Number.isFinite(b.order)
        ? Number(b.order)
        : Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });

    return withOrder;
  }, [allTasks, deferredStatusFilter, pinnedTaskId]);

  const displayedTasksCount = filteredTasks.length;

  const fetchAllFilteredTasks = React.useCallback(async () => {
    const baseUrl = process.env.API_URL || "/api/v1/sprints-planning";
    const requestedSize = Math.max(1, totalTasksCount);
    const params = buildTasksSearchParams({
      ...tasksQueryArgs,
      page: 0,
      size: requestedSize,
    });
    const response = await fetch(
      `${baseUrl}/${teamKey}/tasks?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error("Не удалось загрузить задачи по текущим фильтрам");
    }

    const data = (await response.json()) as TasksPage;
    const tasks = Array.isArray(data.content) ? data.content : [];

    return tasks.slice().sort((a, b) => {
      const oa = Number.isFinite(a.order) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
      const ob = Number.isFinite(b.order) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
  }, [tasksQueryArgs, teamKey, totalTasksCount]);

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

  const handleResetBacklogFilters = React.useCallback(() => {
    setAddAllToJiraError("");
    startFiltersTransition(() => {
      dispatch(
        setBacklogFilters({
          quarterId: "all",
          selectedQuarterIds: [],
          withoutQuarterFilter: false,
          releaseSprintFilter: "all",
          priorityFilter: [],
          streamFilter: [],
          customerFilter: [],
          statusFilter: [],
          searchQuery: "",
          tasksPageSize: "20",
        })
      );
    });
  }, [dispatch, startFiltersTransition]);

  const handleOpenTaskHistory = React.useCallback((task: BacklogItem) => {
    setHistoryTask(task);
  }, []);

  const handleCloseTaskHistory = React.useCallback(() => {
    setHistoryTask(null);
  }, []);

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

    setAllocations((prev) => ({ ...prev, [created.id]: {} }));
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
      setAllocations((prev) => {
        const prevTask = prev[taskId] || {};
        const prevRow = prevTask[participantId] || {};
        const current = prevRow[sprintId] ?? 0;
        if (current === value) return prev;
        const nextRow = { ...prevRow, [sprintId]: value };
        const nextTask = { ...prevTask, [participantId]: nextRow };
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

      setAllocations((prev) => {
        const prevTask = prev[task.id] || {};
        if (prevTask[pid]) return prev;
        const newRow: Record<string, number> = {};
        for (const s of allSprints) newRow[s.id] = 0;
        return {
          ...prev,
          [task.id]: {
            ...prevTask,
            [pid]: newRow,
          },
        };
      });
    },
    [allSprints, updateField]
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

      setAllocations((prev) => {
        const prevTask = prev[taskId] || {};
        return {
          ...prev,
          [taskId]: {
            ...prevTask,
            [participantId]: next,
          },
        };
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
                options: streamOptions.map((s) => ({ label: s, value: s })),
                value: streamFilter,
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
                options: customerOptions.map((c) => ({ label: c, value: c })),
                value: customerFilter,
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
          }
        />

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
