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
  InputBase,
  MenuItem,
  Menu,
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
  History,
  OpenInNew,
} from "@mui/icons-material";
import moment from "moment";
import "moment/locale/ru";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import EditableNumberCell from "./EditableNumberCell";
import FilterAutocomplete from "./filters/FilterAutocomplete";
import type {
  BacklogItem,
  Participant,
  Sprint,
  Quarter,
  TaskPriority,
  TaskStatus,
} from "../types";
import { formatDayAmount, normalizeDayAmount } from "../utils/dayAmount";

moment.locale("ru");

const PARTICIPANT_HANDLE_COL_WIDTH = 52;
const PARTICIPANT_COL_WIDTH = 260;
const TASK_TOTAL_COL_WIDTH = 100;
const TASK_ACTIONS_COL_WIDTH = 220;

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

export type DragHandleProps = {
  listeners: any;
  attributes: any;
};

type EditableTextProps = {
  value: string;
  onCommit?: (v: string) => void;
  placeholder?: string;
  dataTestId?: string;
  sx?: any;
  multiline?: boolean;
  minRows?: number;
  maxRows?: number;
  displaySx?: any;
  inputSx?: any;
};

const EditableText = React.memo(function EditableText({
  value,
  onCommit,
  placeholder,
  dataTestId,
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
        data-testid={dataTestId}
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
        "data-testid": dataTestId ? `${dataTestId}-input` : undefined,
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

export type BacklogTaskCardProps = {
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
  mode?: "backlog" | "preview";
};

const BacklogTaskCard = React.memo(function BacklogTaskCard({
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
  mode = "backlog",
}: BacklogTaskCardProps) {
  const isPreview = mode === "preview";
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
      return a + normalizeDayAmount(v);
    }, 0);
  }

  const leaderPid = task.leaderId || undefined;
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
  const storyJiraIssue = task.jiraStoryIssue || null;

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
          {moment(s.startDate).format("DD.MM.YYYY")} — {" "}
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
    <Paper
      variant="outlined"
      sx={{ p: 2 }}
      data-testid={isPreview ? `planning-preview-task-${task.id}` : `backlog-task-${task.id}`}
    >
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
                dataTestId={isPreview ? `planning-preview-title-${task.id}` : undefined}
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
          <TextField
            select
            size="small"
            label="Статус"
            data-testid={isPreview ? `planning-preview-status-${task.id}` : undefined}
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

          <TextField
            select
            size="small"
            label="Приоритет"
            data-testid={isPreview ? `planning-preview-priority-${task.id}` : undefined}
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

          <Stack direction="row" spacing={0.5} sx={{ ml: "auto" }}>
            {dragHandle && !isPreview && (
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

            {!isPreview && (
              <>
                {storyJiraIssue?.jiraIssueUrl ? (
                  <Tooltip title={`Story в Jira: ${storyJiraIssue.jiraIssueKey}`}>
                    <IconButton
                      size="small"
                      color="info"
                      component="a"
                      href={storyJiraIssue.jiraIssueUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <OpenInNew fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Tooltip title="Story в Jira не заведена">
                    <span>
                      <IconButton size="small" disabled>
                        <OpenInNew fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}

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
              </>
            )}

            <Tooltip title={isPreview ? "Убрать задачу из preview" : "Удалить задачу"}>
              <IconButton
                size="small"
                onClick={() => onRemoveTask(task)}
                aria-label={isPreview ? `Убрать задачу ${task.title} из preview` : `Удалить задачу ${task.title}`}
                data-testid={isPreview ? `planning-preview-remove-task-${task.id}` : `remove-task-${task.id}`}
              >
                <Delete />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Stack>

      {!hiddenParticipants && (
        <DndContext
          sensors={participantSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleParticipantDragEnd}
        >
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ mt: 1, position: "relative", overflowX: "auto", maxWidth: "100%" }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      width: PARTICIPANT_HANDLE_COL_WIDTH,
                      position: "sticky",
                      left: 0,
                      zIndex: 3,
                      bgcolor: "background.paper",
                    }}
                  />
                  <TableCell
                    sx={{
                      minWidth: PARTICIPANT_COL_WIDTH,
                      position: "sticky",
                      left: PARTICIPANT_HANDLE_COL_WIDTH,
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
                  <TableCell
                    align="center"
                    sx={{
                      width: TASK_TOTAL_COL_WIDTH,
                      minWidth: TASK_TOTAL_COL_WIDTH,
                      position: "sticky",
                      right: TASK_ACTIONS_COL_WIDTH,
                      zIndex: 3,
                      bgcolor: "background.paper",
                    }}
                  >
                    Итого
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      width: TASK_ACTIONS_COL_WIDTH,
                      minWidth: TASK_ACTIONS_COL_WIDTH,
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
                      (acc, s) => acc + normalizeDayAmount(Number(row[s.id] || 0)),
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
                              width={PARTICIPANT_HANDLE_COL_WIDTH}
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
                                left: PARTICIPANT_HANDLE_COL_WIDTH,
                                zIndex: 2,
                                minWidth: PARTICIPANT_COL_WIDTH,
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
                                  dataTestId={
                                    isPreview
                                      ? `planning-preview-allocation-${task.id}-${p.id}-${s.id}`
                                      : undefined
                                  }
                                />
                              </TableCell>
                            ))}

                            <TableCell
                              align="center"
                              sx={{
                                fontWeight: 700,
                                position: "sticky",
                                right: TASK_ACTIONS_COL_WIDTH,
                                bgcolor: "background.paper",
                                zIndex: 2,
                                width: TASK_TOTAL_COL_WIDTH,
                                minWidth: TASK_TOTAL_COL_WIDTH,
                              }}
                            >
                              {formatDayAmount(rowSum)}
                            </TableCell>

                            <TableCell
                              align="right"
                              sx={{
                                position: "sticky",
                                right: 0,
                                bgcolor: "background.paper",
                                zIndex: 2,
                                width: TASK_ACTIONS_COL_WIDTH,
                                minWidth: TASK_ACTIONS_COL_WIDTH,
                              }}
                            >
                              <Stack
                                direction="row"
                                spacing={0.5}
                                justifyContent="flex-end"
                              >
                                {!isPreview && (
                                  <Tooltip title="Jira по отображаемым спринтам">
                                    <IconButton
                                      size="small"
                                      color={hasDisplayedJiraIssue ? "info" : "default"}
                                      onClick={handleOpenJiraMenu(p.id)}
                                    >
                                      <OpenInNew fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
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
                      {formatDayAmount(sumBySprint[s.id])}
                    </TableCell>
                  ))}
                  <TableCell align="center" sx={{ fontWeight: 700 }}>
                    {formatDayAmount(Object.values(sumBySprint).reduce((a, b) => a + b, 0))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </DndContext>
      )}

      {!isPreview && (
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

export default BacklogTaskCard;
