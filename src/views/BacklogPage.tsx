import { defaultRangeExtractor, useWindowVirtualizer } from "@tanstack/react-virtual";
import { useStore } from "react-redux";
import type { RootState } from "../app/store";
import useResolvedQuarterFilter from "./useResolvedQuarterFilter";
import { releaseFilterParams } from "../utils/releaseFilters";
import useToday from "./useToday";
import * as React from "react";
import { usePlanningSelection } from "../contexts/PlanningSelectionContext";
import {
  Paper,
  Typography,
  Stack,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  LinearProgress,
  Snackbar,
} from "@mui/material";
import {
  Add,
  AddTask,
  DragIndicator,
} from "@mui/icons-material";
import { skipToken } from "@reduxjs/toolkit/query";
import { useLocation, useNavigate } from "react-router-dom";
import moment from "moment";
import "moment/locale/ru";

import {
  api,
  useGetParticipantsQuery,
  useGetQuartersQuery,
  useGetSprintsQuery,
  useGetTasksQuery,
  useGetTaskQuery,
  useAddTaskMutation,
  useUpdateTaskMutation,
  useAddTaskParticipantMutation,
  useRemoveTaskParticipantMutation,
  useReplaceTaskParticipantMutation,
  useDeleteTaskMutation,
  useUpsertTaskAllocationMutation,
  useUpsertTaskAllocationBulkMutation,
  useUpsertTaskAllocationMultiMutation,
  useGetReleaseOptionsQuery,
  useTransferTaskToPlanningMutation,
  useGetFiltersQuery,
  useGetTaskHistoryQuery,
  useUpdateTaskJiraLinksMutation,
} from "../app/api";
import TaskCard, { type BacklogTaskCardProps } from "../components/BacklogTaskCard";
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
import { setTaskListFilters } from "../app/uiSlice";
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
const WITHOUT_QUARTER_OPTIONS = [{ value: WITHOUT_QUARTER_FILTER_VALUE, label: "Без квартала" }];
const EMPTY_QUARTERS: Quarter[] = [];
const EMPTY_PARTICIPANTS: Participant[] = [];
const EMPTY_SPRINTS: Sprint[] = [];
const EMPTY_RELEASES: { id: string; name?: string; promDate: string }[] = [];

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
  workspace?: string;
  releasePromDate?: string;
  releaseDateIds?: string[];
  releasePromDates?: string[];
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
  if (arg.workspace) params.set("workspace", arg.workspace);
  if (arg.releasePromDate) params.set("releasePromDate", arg.releasePromDate);
  if (arg.releaseDateIds?.length) params.set("releaseDateIds", arg.releaseDateIds.join(","));
  if (arg.releasePromDates?.length) params.set("releasePromDates", arg.releasePromDates.join(","));

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

// ---------- LocalStorage ----------

const LS_HIDDEN_PARTICIPANTS = "backlog.hiddenParticipants";

const STATUS_LABEL: Record<TaskStatus, string> = {
  inprogress: "В работе",
  done: "Выполнено",
  canceled: "Отменена",
  backlog: "В бэклоге",
};

const PRIORITY_VALUES: readonly number[] = [1, 2, 3];

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
const TASK_POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 8 } };
const PARTICIPANT_POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 6 } };

// ---------- TaskCard (карточка задачи + таблица нагрузок) ----------

type TaskCardProps = BacklogTaskCardProps;

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

  const dragHandle = React.useMemo(() => ({ attributes, listeners }), [attributes, listeners]);
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
        dragHandle={dragHandle}
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
  isPlanningSelected: (taskId: string) => boolean;
  onToggleJiraSelection: (task: BacklogItem) => void;
} & Omit<
  TaskCardProps,
  | "task"
  | "allocationsByParticipant"
  | "participantOrder"
  | "hiddenParticipants"
  | "isJiraSelected"
  | "isPlanningSelected"
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
  isPlanningSelected,
  ...taskCardProps
}: TaskCardsListProps) {
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);

  const taskSensors = useSensors(
    useSensor(PointerSensor, TASK_POINTER_SENSOR_OPTIONS)
  );
  const participantSensors = useSensors(
    useSensor(PointerSensor, PARTICIPANT_POINTER_SENSOR_OPTIONS)
  );

  const sortableTaskIds = React.useMemo(() => tasks.map(task => task.id), [tasks]);
  const virtualized = tasks.length > 4;
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = React.useState(0);
  const [focusedTaskId, setFocusedTaskId] = React.useState<string | null>(null);
  const getItemKey = React.useCallback((index: number) => tasks[index].id, [tasks]);
  const rangeExtractor = React.useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => {
    const indices = new Set(defaultRangeExtractor(range));
    // Keep a focused editor and the dragged card mounted when they leave the viewport.
    for (const id of [focusedTaskId, activeTaskId]) {
      const index = id ? sortableTaskIds.indexOf(id) : -1;
      if (index >= 0) indices.add(index);
    }
    return [...indices].sort((a, b) => a - b);
  }, [focusedTaskId, activeTaskId, sortableTaskIds]);
  const virtualizer = useWindowVirtualizer({
    count: tasks.length,
    enabled: virtualized,
    estimateSize: () => 560,
    overscan: 1,
    gap: 16,
    scrollMargin,
    getItemKey,
    rangeExtractor,
  });
  React.useLayoutEffect(() => {
    if (!virtualized) return;
    const updateOffset = () => {
      if (listRef.current) setScrollMargin(listRef.current.getBoundingClientRect().top + window.scrollY);
    };
    updateOffset();
    const observer = new ResizeObserver(updateOffset);
    observer.observe(document.body);
    window.addEventListener("resize", updateOffset);
    return () => { observer.disconnect(); window.removeEventListener("resize", updateOffset); };
  }, [virtualized]);

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

  const renderTaskCard = (task: BacklogItem) => (
    <SortableTaskCard
      key={task.id}
      task={task}
      allocationsByParticipant={
        allocations[task.id] || EMPTY_ALLOCATIONS_ROW
      }
      participantOrder={participantOrders[task.id] || task.participantIds}
      participantSensors={participantSensors}
      hiddenParticipants={
        hideAllParticipants
          ? !hiddenParticipantsTaskIds.has(task.id)
          : hiddenParticipantsTaskIds.has(task.id)
      }
      isJiraSelected={isJiraSelected(task.id)}
      isPlanningSelected={isPlanningSelected(task.id)}
      {...taskCardProps}
    />
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
        items={sortableTaskIds}
        strategy={verticalListSortingStrategy}
      >
        <Stack spacing={2}>
          {virtualized ? (
            <Box ref={listRef} data-testid="virtual-task-list"
              onFocusCapture={event => {
                const card = (event.target as HTMLElement).closest<HTMLElement>("[data-task-id]");
                if (card) setFocusedTaskId(card.dataset.taskId ?? null);
              }}
              onBlurCapture={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedTaskId(null);
              }}
              sx={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%", overflowAnchor: "none" }}>
              {virtualizer.getVirtualItems().map(item => {
                const task = tasks[item.index];
                return <Box key={item.key} data-index={item.index} data-task-id={task.id} ref={virtualizer.measureElement}
                  sx={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start - scrollMargin}px)` }}>
                  {renderTaskCard(task)}
                </Box>;
              })}
            </Box>
          ) : tasks.map(renderTaskCard)}

          {!tasks.length && !isFetching && (
            <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
              <Typography color="text.secondary">
                Нет задач по текущим фильтрам
              </Typography>
            </Paper>
          )}
          {!tasks.length && isFetching && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 3 }} role="status">
              <CircularProgress size={20} />
              <Typography color="text.secondary">Загрузка задач…</Typography>
            </Stack>
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
};

const TaskHistoryDialog = React.memo(function TaskHistoryDialog({
  task,
  open,
  onClose,
  participantMap,
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
  const { currentData: data, isFetching, isError } = useGetTaskHistoryQuery(queryArgs);

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

  const teamKey = useAppSelector(selectCurrentTeamKey);
  const releaseIds = React.useMemo(() => [...new Set(items.flatMap(item => item.changes
    .filter(change => change.field === "releaseDateId").flatMap(change => [change.before, change.after]))
    .filter((value): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)))].sort(), [items]);
  const { data: historyReleases = EMPTY_RELEASES } = useGetReleaseOptionsQuery({ teamKey, ids: releaseIds }, { skip: !open || !releaseIds.length });
  const releaseLabelById = React.useMemo(() => new Map(historyReleases.map(release => [release.id,
    moment(release.promDate).format("DD.MM.YYYY")])), [historyReleases]);

  const hasMore = totalPages > 0 && page + 1 < totalPages;
  const isInitialLoading = isFetching && items.length === 0;

  const formatHistoryValue = React.useCallback(
    (field: string, value: unknown): string => {
      if (value === null || value === undefined) return "—";

      if (field === "status") {
        const key = (value === "notdone" ? "canceled" : value === "partial" ? "done" : String(value)) as TaskStatus;
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

type TaskCreationControlsProps = {
  quarters: Quarter[];
  currentQuarterId?: string;
  storageKey: string;
  onCreate: (quarterId?: string) => Promise<void>;
};

const TaskCreationControls = React.memo(function TaskCreationControls({ quarters, currentQuarterId, storageKey, onCreate }: TaskCreationControlsProps) {
  const [newTaskQuarterId, setNewTaskQuarterId] = React.useState(() => {
    const saved = readLS<string | null>(storageKey, null);
    return saved === NO_INITIAL_QUARTER_VALUE || quarters.some(q => q.id === saved)
      ? saved! : currentQuarterId || NO_INITIAL_QUARTER_VALUE;
  });
  React.useEffect(() => {
    setNewTaskQuarterId(previous => previous === NO_INITIAL_QUARTER_VALUE || quarters.some(q => q.id === previous)
      ? previous : currentQuarterId || NO_INITIAL_QUARTER_VALUE);
  }, [quarters, currentQuarterId]);
  const handleConfirmAddTask = async () => {
    try {
      await onCreate(newTaskQuarterId !== NO_INITIAL_QUARTER_VALUE ? newTaskQuarterId : undefined);
    } catch (error) {
      console.error("Не удалось создать задачу", error);
    }
  };
  return (
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
                {quarters.map((q) => (
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
  );
});

// A memoized boundary keeps the entire list (data, sprint scope and callbacks)
// coherent while React renders its next version with interruptible priority.
const DeferredTaskCardsList = React.memo(function DeferredTaskCardsList(props: TaskCardsListProps & { scopeKey: string }) {
  const deferredProps = React.useDeferredValue(props);
  const pending = deferredProps !== props;
  const changingScope = pending && deferredProps.scopeKey !== props.scopeKey;
  const { scopeKey: _scopeKey, ...listProps } = deferredProps;
  return (
    <Box sx={{ position: "relative" }} aria-busy={pending || props.isFetching} data-testid="task-cards-region">
      {pending && <LinearProgress aria-label="Обновление списка задач" sx={{ position: "absolute", top: 0, left: 0, right: 0 }} />}
      <Box component="fieldset" disabled={changingScope} sx={{ m: 0, p: 0, border: 0, minWidth: 0, opacity: changingScope ? 0.65 : 1, pointerEvents: changingScope ? "none" : undefined }}>
        <TaskCardsList {...listProps} />
      </Box>
    </Box>
  );
});

// ---------- BacklogPage ----------

function BacklogPage({ workspace = "ROADMAP" }: { workspace?: "ROADMAP" | "BACKLOG" }) {
  const store = useStore<RootState>();
  const isTodo = workspace === "BACKLOG";
  const today = useToday();
  const location = useLocation();
  const navigate = useNavigate();
  const linkedTaskId = new URLSearchParams(location.search).get("pinnedTaskId");
  const { data: linkedTask } = useGetTaskQuery(linkedTaskId || skipToken, { selectFromResult: ({ data }) => ({ data }) });
  React.useEffect(() => {
    if (linkedTask?.workspace && linkedTask.workspace !== workspace) {
      const target = linkedTask.workspace === "BACKLOG" ? "backlog" : "";
      navigate(`/${location.pathname.split("/")[1]}/${target}?pinnedTaskId=${encodeURIComponent(linkedTask.id)}`, { replace: true });
    }
  }, [linkedTask, workspace, navigate, location.pathname]);
  const { data: quartersData, isError: isQuartersError, refetch: refetchQuarters } = useGetQuartersQuery(undefined, { selectFromResult: ({ data, isError }) => ({ data, isError }) });
  const quarters = quartersData ?? EMPTY_QUARTERS;
  const quartersReady = quartersData !== undefined;
  const { participants } = useGetParticipantsQuery(undefined, {
    selectFromResult: ({ data }) => ({ participants: data ?? EMPTY_PARTICIPANTS }),
  });
  const { allSprints } = useGetSprintsQuery(undefined, {
    selectFromResult: ({ data }) => ({ allSprints: data ?? EMPTY_SPRINTS }),
  });
  const quarterIdsKey = React.useMemo(
    () => quarters.map((q) => q.id).join("|"),
    [quarters]
  );
  const quarterIdSet = React.useMemo(
    () => new Set(quarters.map((q) => q.id)),
    [quarters]
  );

  const currentQ = React.useMemo<Quarter | undefined>(() => {
    return quarters.find((q) => isISOWithin(today, q.startDate, q.endDate));
  }, [quarters, today]);

  const dispatch = useAppDispatch();
  const teamKey = useAppSelector(selectCurrentTeamKey);
  const scopeKey = `${teamKey}:${workspace}`;
  const hiddenParticipantsStorageKey = `${LS_HIDDEN_PARTICIPANTS}:${scopeKey}`;
  const setBacklogFilters = React.useCallback((changes: any) => setTaskListFilters({ key: scopeKey, changes }), [scopeKey]);
  const [transferToPlanning] = useTransferTaskToPlanningMutation();
  const { addTransferredItem, isSourceSelected, removeSourceFromPlan } = usePlanningSelection();
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
    releaseFilters,
    searchQuery,
    selectedQuarterIds: storedQuarterIds,
    withoutQuarterFilter,
    tasksPageSize,
    hideAllParticipants,
    sortBy,
    sortDirection,
  } = useAppSelector((s) => s.ui.taskLists[scopeKey] ?? (isTodo ? s.ui.todo : s.ui.backlog));

  const priorityFilterValues = React.useMemo(() => priorityFilter.map(String), [priorityFilter]);
  const visibleStatusFilters = React.useMemo(() => statusFilter.filter(status => isTodo
    ? ["backlog", "canceled"].includes(status) : ["inprogress", "done", "canceled"].includes(status)), [statusFilter, isTodo]);
  const streamFilterValues = React.useMemo(() => withoutStreamFilter ? [...streamFilter, WITHOUT_STREAM_FILTER_VALUE] : streamFilter, [streamFilter, withoutStreamFilter]);
  const customerFilterValues = React.useMemo(() => withoutCustomerFilter ? [...customerFilter, WITHOUT_CUSTOMER_FILTER_VALUE] : customerFilter, [customerFilter, withoutCustomerFilter]);

  const currentQuarterId = currentQ?.id;

  const persistQuarterFilter = React.useCallback((selectedQuarterIds: string[]) => {
    dispatch(setBacklogFilters({ selectedQuarterIds }));
  }, [dispatch, setBacklogFilters]);
  const selectedQuarterIds = useResolvedQuarterFilter(quartersData, storedQuarterIds, persistQuarterFilter, currentQuarterId, withoutQuarterFilter);
  const quarterFilterValues = React.useMemo(() => withoutQuarterFilter
    ? [...selectedQuarterIds, WITHOUT_QUARTER_FILTER_VALUE] : selectedQuarterIds, [selectedQuarterIds, withoutQuarterFilter]);

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
  const [duplicateNotice, setDuplicateNotice] = React.useState("");
  const handleTransferToPlanning = React.useCallback(async (task: BacklogItem) => {
    try {
      const item = await transferToPlanning({ taskId: task.id }).unwrap();
      addTransferredItem(item);
      setDuplicateNotice("Задача добавлена в текущий набор для планирования");
      return true;
    } catch {
      setDuplicateNotice("Не удалось передать задачу в планирование");
      return false;
    }
  }, [transferToPlanning, addTransferredItem]);
  const handleRemoveFromPlanning = React.useCallback((task: BacklogItem) => {
    removeSourceFromPlan(task.id);
  }, [removeSourceFromPlan]);
  const [pinnedTaskId, setPinnedTaskId] = React.useState<string | null>(() => linkedTaskId?.trim() || null);
  const [historyTask, setHistoryTask] = React.useState<BacklogItem | null>(null);
  const { data: releases = EMPTY_RELEASES } = useGetReleaseOptionsQuery({ teamKey, fromDate: today }, { skip: !isJiraDialogOpen, selectFromResult: ({ data }) => ({ data }) });
  const [isAddingAllToJira, setIsAddingAllToJira] = React.useState(false);
  const [addAllToJiraError, setAddAllToJiraError] = React.useState("");
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
        releaseFilters,
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
      releaseFilters,
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
      teamKey,
      workspace,
      statuses: visibleStatusFilters,
      ...releaseFilterParams(releaseFilters),
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
      workspace, teamKey, isTodo,
      selectedQuarterIds,
      priorityFilter,
      visibleStatusFilters,
      releaseFilters,
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
    currentData: fetchedTasksPage,
    isFetching: isTasksFetching,
  } = useGetTasksQuery(quartersReady ? tasksQueryArgs : skipToken, { selectFromResult: ({ currentData, isFetching }) => ({ currentData, isFetching }) });

  const isFetching = !quartersReady || isTasksFetching;

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
        loadNextTasksPage(fetchedTasksPage?.page.number ?? effectiveTasksPageNumber);
      },
      { root: null, rootMargin: LOAD_MORE_SENTINEL_ROOT_MARGIN, threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [effectiveTasksPageNumber, hasMoreTasks, isFetching, loadNextTasksPage, fetchedTasksPage?.page.number]);

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

  // RTK Query already updates allocations optimistically and rolls them back on failure.
  const allocations = React.useMemo<Allocations>(() => Object.fromEntries(
    allTasks.map(task => [task.id, task.allocations || EMPTY_ALLOCATIONS_ROW])
  ), [allTasks]);
  const selectTaskPage = React.useMemo(() => api.endpoints.getTasks.select(tasksQueryArgs), [tasksQueryArgs]);
  const getCurrentTasks = React.useCallback(() => selectTaskPage(store.getState()).data?.content ?? [], [selectTaskPage, store]);
  const getTaskAllocations = React.useCallback((taskId: string) => getCurrentTasks().find(task => task.id === taskId)?.allocations || EMPTY_ALLOCATIONS_ROW, [getCurrentTasks]);
  const [participantOrders, setParticipantOrders] = React.useState<
    Record<string, string[]>
  >({});
  const [hiddenParticipantsTaskIds, setHiddenParticipantsTaskIds] =
    React.useState<Set<string>>(
      () => new Set(readLS<string[]>(hiddenParticipantsStorageKey, []))
    );
  const prevHideAllParticipants = React.useRef(hideAllParticipants);
  const prevQuarterFilterSignature = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (prevHideAllParticipants.current === hideAllParticipants) return;
    prevHideAllParticipants.current = hideAllParticipants;
    writeLS(hiddenParticipantsStorageKey, []);
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
    setTaskQuartersMap(previous => Object.keys(previous).length ? {} : previous);
  }, [selectedQuarterIds, withoutQuarterFilter]);

  const creationQuarterStorageKey = `task.creationQuarter.v1:${teamKey}`;
  const creationQuarters = React.useMemo(() => quartersSorted.filter(q => q.endDate >= today), [quartersSorted, today]);

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

  React.useEffect(() => {
    setParticipantOrders((prev) => {
      const next = { ...prev } as Record<string, string[]>;
      let changed = false;
      for (const task of allTasks) {
        const ids = task.participantIds || [];
        const existing = next[task.id];
        // Untouched rows already get their order from task.participantIds.
        if (!existing) continue;
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

  const { data: filtersData } = useGetFiltersQuery(undefined, { selectFromResult: ({ data }) => ({ data }) });

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
      if (selectedQuarterIds.length) return selectedQuarterIds;
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
      (Object.keys(STATUS_LABEL) as TaskStatus[]).filter(st => isTodo ? ["backlog", "canceled"].includes(st) : ["inprogress", "done", "canceled"].includes(st)).map((st) => ({
        value: st,
        label: STATUS_LABEL[st],
      })),
    [isTodo]
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
      dispatch(
        setBacklogFilters({
          selectedQuarterIds: filtered,
          withoutQuarterFilter: nextWithoutQuarter,
        })
      );
    },
    [
      quarters,
      selectedQuarterIds,
      withoutQuarterFilter,
      dispatch,
    ]
  );

  const handlePriorityFilterChange = React.useCallback(
    (values: string[]) => {
      const next = values
        .map(Number)
        .filter((n): n is number => PRIORITY_VALUES.includes(n));
      if (shallowArrayEqual(next, priorityFilter)) return;
      dispatch(setBacklogFilters({ priorityFilter: next }));
    },
    [dispatch, priorityFilter]
  );

  const handleStatusFilterChange = React.useCallback(
    (values: string[]) => {
      const next = values as TaskStatus[];
      if (shallowArrayEqual(next, statusFilter)) return;
      dispatch(setBacklogFilters({ statusFilter: next }));
    },
    [dispatch, statusFilter]
  );

  const handleReleaseFilterChange = React.useCallback((values: string[]) => {
    if (shallowArrayEqual(values, releaseFilters)) return;
    dispatch(setBacklogFilters({ releaseFilters: values }));
  }, [dispatch, releaseFilters]);

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
      dispatch(
        setBacklogFilters({
          streamFilter: nextValues,
          withoutStreamFilter: nextWithoutStream,
        })
      );
    },
    [dispatch, streamFilter, withoutStreamFilter]
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
      dispatch(
        setBacklogFilters({
          customerFilter: nextValues,
          withoutCustomerFilter: nextWithoutCustomer,
        })
      );
    },
    [dispatch, customerFilter, withoutCustomerFilter]
  );

  const handleTasksPageSizeChange = React.useCallback(
    (value: string) => {
      const sanitized = value.replace(/\D/g, "");
      const normalized = sanitized.replace(/^0+(?=\d)/, "");
      if (normalized === tasksPageSize) return;
      dispatch(setBacklogFilters({ tasksPageSize: normalized }));
    },
    [dispatch, tasksPageSize]
  );

  const handleSortByChange = React.useCallback(
    (value: string) => {
      const normalized = (value || "manual") as BacklogSortBy;
      if (normalized === sortBy) return;
      dispatch(setBacklogFilters({ sortBy: normalized }));
    },
    [dispatch, sortBy]
  );

  const handleSortDirectionChange = React.useCallback(
    (value: string) => {
      const normalized: SortDirection = value === "desc" ? "desc" : "asc";
      if (normalized === sortDirection) return;
      dispatch(setBacklogFilters({ sortDirection: normalized }));
    },
    [dispatch, sortDirection]
  );

  const handleSearchCommit = React.useCallback(
    (value: string) => {
      const normalized = value.trim();
      if (normalized !== normalizedSearch) {
        dispatch(setBacklogFilters({ searchQuery: normalized }));
      }
    },
    [dispatch, normalizedSearch]
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

  const handleResetBacklogFilters = React.useCallback(() => {
    setAddAllToJiraError("");
    dispatch(
      setBacklogFilters({
        quarterId: "all",
        selectedQuarterIds: currentQuarterId ? [currentQuarterId] : [],
        withoutQuarterFilter: false,
        withoutStreamFilter: false,
        withoutCustomerFilter: false,
        releaseFilters: [],
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
  }, [currentQuarterId, dispatch]);

  const handleOpenTaskHistory = React.useCallback((task: BacklogItem) => {
    setHistoryTask(task);
  }, []);

  const handleCloseTaskHistory = React.useCallback(() => {
    setHistoryTask(null);
  }, []);

  const [addTask] = useAddTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [addTaskParticipant] = useAddTaskParticipantMutation();
  const [removeTaskParticipant] = useRemoveTaskParticipantMutation();
  const [replaceTaskParticipant] = useReplaceTaskParticipantMutation();
  const [updateTaskJiraLinks] = useUpdateTaskJiraLinksMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [upsertTaskAllocation] = useUpsertTaskAllocationMutation();
  const [upsertTaskAllocationBulk] = useUpsertTaskAllocationBulkMutation();
  const [upsertTaskAllocationMulti] = useUpsertTaskAllocationMultiMutation();

  const updateField = React.useCallback(
    (t: BacklogItem, patch: Partial<BacklogItem>) => {
      if (!Object.keys(patch).length) return Promise.resolve();
      const promise = updateTask({ id: t.id, ...patch })
        .unwrap()
        .catch((e) => {
          console.error("Failed to update task", e);
          throw e;
        });
      return promise;
    },
    [updateTask]
  );

  const handleStatusChange = React.useCallback(
    (task: BacklogItem, st: TaskStatus) => {
      if ((task.status ?? "inprogress") === st) return;
      void updateField(task, { status: st }).then(() => {
        if (st === "backlog") removeTaskFromJiraCart(task.id);
        if ((isTodo && (st === "inprogress" || st === "done")) || (!isTodo && st === "backlog")) setPinnedTaskId(null);
      });
    },
    [updateField, removeTaskFromJiraCart, isTodo]
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
      const allTasks = getCurrentTasks();
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
    [getCurrentTasks, applyTaskOrderOptimistic, updateTask]
  );

  const createTask = React.useCallback(async (quarterId?: string) => {
    const created = await addTask({
      title: "Новая задача",
      description: "",
      dod: "",
      priority: 1 as TaskPriority,
      workspace,
      status: (isTodo ? "backlog" : "inprogress") as TaskStatus,
      customers: [],
      streams: [],
      participantIds: [],
      releaseDateId: null,
      initialQuarterId: quarterId || null,
    }).unwrap();
    writeLS(creationQuarterStorageKey, quarterId || NO_INITIAL_QUARTER_VALUE);
    if (quarterId && quarterIdSet.has(quarterId)) {
      setTaskQuartersMap((prev) => ({ ...prev, [created.id]: [quarterId] }));
    }
    setPinnedTaskId(created.id);
  }, [addTask, workspace, isTodo, creationQuarterStorageKey, quarterIdSet]);

  const duplicateTask = React.useCallback(
    async (task: BacklogItem) => {
      const activeParticipantIds = task.participantIds.filter((id) => participantMap.get(id)?.active !== false);
      const taskAllocations = task.allocations || {};
      const allocationsPayload = Object.entries(taskAllocations).reduce<
        Record<string, Record<string, number>>
      >((acc, [pid, row]) => {
        if (!activeParticipantIds.includes(pid)) return acc;
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
      try {
        const copy = await addTask({
          title: `${task.title} (копия)`,
          description: (task as any).description,
          dod: task.dod,
          priority: task.priority,
          workspace,
          status: isTodo ? "backlog" : "inprogress",
          customers: task.customers?.slice() || [],
          streams: task.streams?.slice() || [],
          participantIds: activeParticipantIds,
          planningQuarterIds: task.planningQuarterIds?.slice(),
          planningSprintIds: task.planningSprintIds?.slice(),
          releaseDateId: task.releaseDateId ?? null,
          initialQuarterId: task.initialQuarterId ?? null,
          leaderId: task.leaderId && activeParticipantIds.includes(task.leaderId) ? task.leaderId : undefined,
          order: baseOrder + 1,
          loads: activeParticipantIds.length === task.participantIds.length ? loadsPayload : Object.values(allocationsPayload).reduce<Record<string, number>>((totals, row) => {
            Object.entries(row).forEach(([sid, days]) => { totals[sid] = (totals[sid] || 0) + days; }); return totals;
          }, {}),
          allocations: Object.keys(allocationsPayload).length
            ? allocationsPayload
            : undefined,
        }).unwrap();

        setDuplicateNotice(`Создана задача «${copy.title}»`);
        return copy;
      } catch (error) {
        console.error("Не удалось дублировать задачу", error);
      }
    },
    [addTask, allTasks.length, participantMap, workspace, isTodo]
  );

  const removeTask = React.useCallback(
    async (t: BacklogItem) => {
      if (!window.confirm(`Удалить задачу «${t.title}»?`)) return;
      // The mutation lifecycle reports errors and restores the optimistic cache.
      await deleteTask({ id: t.id });
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
    },
    [upsertTaskAllocation]
  );

  const addParticipantToTask = React.useCallback(
    async (task: BacklogItem, pid: string) => {
      if (!pid) return;
      if (task.participantIds?.includes(pid)) return;

      const previousOrder = (participantOrders[task.id] || task.participantIds).slice();

      setParticipantOrders((prev) => ({
        ...prev,
        [task.id]: [...previousOrder, pid],
      }));

      try {
        await addTaskParticipant({ taskId: task.id, participantId: pid }).unwrap();
      } catch (error) {
        setParticipantOrders((prev) => ({ ...prev, [task.id]: previousOrder }));
        console.error("Failed to add task participant", error);
      }
    },
    [addTaskParticipant, participantOrders]
  );

  const removeParticipantFromTask = React.useCallback(
    async (task: BacklogItem, pid: string) => {
      const previousOrder = (participantOrders[task.id] || task.participantIds).slice();

      setParticipantOrders((prev) => {
        const next = { ...prev };
        if (next[task.id]) {
          next[task.id] = next[task.id].filter((id) => id !== pid);
        }
        return next;
      });

      try {
        await removeTaskParticipant({ taskId: task.id, participantId: pid }).unwrap();
      } catch (error) {
        setParticipantOrders((prev) => ({ ...prev, [task.id]: previousOrder }));
        console.error("Failed to remove participant from task", error);
      }
    },
    [participantOrders, removeTaskParticipant]
  );

  const replaceParticipantInTask = React.useCallback(
    async (task: BacklogItem, fromPid: string, toPid: string) => {
      if (!toPid || fromPid === toPid) return;
      if (!task.participantIds.includes(fromPid)) return;
      if (task.participantIds.includes(toPid)) return;

      const previousOrder = (participantOrders[task.id] || task.participantIds).slice();

      setParticipantOrders((prev) => {
        const currentOrder = prev[task.id] || task.participantIds;
        return {
          ...prev,
          [task.id]: currentOrder.map((id) => (id === fromPid ? toPid : id)),
        };
      });

      try {
        await replaceTaskParticipant({
          taskId: task.id,
          fromParticipantId: fromPid,
          toParticipantId: toPid,
        }).unwrap();
      } catch (error) {
        setParticipantOrders((prev) => ({ ...prev, [task.id]: previousOrder }));
        console.error("Failed to replace participant", error);
      }
    },
    [
      participantOrders,
      replaceTaskParticipant,
    ]
  );

  const shiftRow = React.useCallback(
    (taskId: string, participantId: string, dir: "left" | "right") => {
      const row = getTaskAllocations(taskId)[participantId] || {};
      const ids = sprintsGlobalOrdered.map((s) => s.id);
      if (!ids.length) return;

      const next = ids.reduce<Record<string, number>>((acc, sprintId) => {
        acc[sprintId] = 0;
        return acc;
      }, {});
      let hasLoad = false;

      for (let i = 0; i < ids.length; i++) {
        const fromSid = ids[i];
        const targetIdx = dir === "left" ? i - 1 : i + 1;
        const targetSid =
          targetIdx >= 0 && targetIdx < ids.length ? ids[targetIdx] : fromSid;
        const val = Number(row[fromSid] || 0);
        if (val > 0) {
          hasLoad = true;
          next[targetSid] = (next[targetSid] || 0) + val;
        }
      }
      if (!hasLoad) return;

      (async () => {
        try {
          const bulkAllocations = ids.reduce<Record<string, number>>((acc, sid) => {
            const before = normalizeDayAmount(Number(row[sid] || 0));
            const after = normalizeDayAmount(Number(next[sid] || 0));
            if (before !== after) acc[sid] = after;
            return acc;
          }, {});
          if (!Object.keys(bulkAllocations).length) return;
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
    [getTaskAllocations, sprintsGlobalOrdered, upsertTaskAllocationMulti]
  );

  const shiftTaskAllocations = React.useCallback(
    (task: BacklogItem, dir: "left" | "right") => {
      const ids = sprintsGlobalOrdered.map((s) => s.id);
      if (!ids.length) return;
      const taskAllocations = getTaskAllocations(task.id);
      const participantIds = task.participantIds || [];
      const nextTaskAllocations: Record<string, Record<string, number>> = {};

      for (const participantId of participantIds) {
        const row = taskAllocations[participantId] || {};
        const nextRow = ids.reduce<Record<string, number>>((acc, sprintId) => {
          acc[sprintId] = 0;
          return acc;
        }, {});
        let hasLoad = false;

        for (let i = 0; i < ids.length; i++) {
          const fromSid = ids[i];
          const targetIdx = dir === "left" ? i - 1 : i + 1;
          const targetSid =
            targetIdx >= 0 && targetIdx < ids.length ? ids[targetIdx] : fromSid;
          const val = Number(row[fromSid] || 0);
          if (val > 0) {
            hasLoad = true;
            nextRow[targetSid] = (nextRow[targetSid] || 0) + val;
          }
        }

        if (hasLoad) {
          nextTaskAllocations[participantId] = nextRow;
        }
      }

      if (!Object.keys(nextTaskAllocations).length) return;

      (async () => {
        try {
          const bulkAllocations = Object.entries(nextTaskAllocations).reduce<
            Record<string, Record<string, number>>
          >((acc, [participantId, row]) => {
            const currentRow = taskAllocations[participantId] || {};
            const changes = ids.reduce<Record<string, number>>(
              (inner, sid) => {
                const before = normalizeDayAmount(Number(currentRow[sid] || 0));
                const after = normalizeDayAmount(Number(row[sid] || 0));
                if (before !== after) inner[sid] = after;
                return inner;
              },
              {}
            );
            if (Object.keys(changes).length) acc[participantId] = changes;
            return acc;
          }, {});
          if (!Object.keys(bulkAllocations).length) return;
          await upsertTaskAllocationMulti({
            taskId: task.id,
            allocations: bulkAllocations,
          }).unwrap();
        } catch (error) {
          console.error("Failed to bulk save allocations", error);
        }
      })();
    },
    [getTaskAllocations, sprintsGlobalOrdered, upsertTaskAllocationMulti]
  );

  const copyRowToNextQuarter = React.useCallback(
    (taskId: string, participantId: string) => {
      const row = getTaskAllocations(taskId)[participantId] || {};
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

      (async () => {
        try {
          const bulkAllocations = Object.entries(nextRow).reduce<
            Record<string, number>
          >((acc, [sid, days]) => {
            const before = normalizeDayAmount(Number(row[sid] || 0));
            const after = normalizeDayAmount(Number(days) || 0);
            if (before !== after) acc[sid] = after;
            return acc;
          }, {});
          if (!Object.keys(bulkAllocations).length) return;
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
      getTaskAllocations,
      sprintById,
      quartersSorted,
      sprintsByQuarter,
      upsertTaskAllocationBulk,
    ]
  );

  const moveTask = React.useCallback(
    (id: string, dir: "up" | "down") => {
      const current = getCurrentTasks().map((t) => t.id);
      const idx = current.indexOf(id);
      if (idx < 0) return;
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= current.length) return;

      const reordered = arrayMove(current, idx, swapIdx);
      void persistTaskOrder(reordered, id);
    },
    [getCurrentTasks, persistTaskOrder]
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
        writeLS(hiddenParticipantsStorageKey, Array.from(next));
        return next;
      });
    },
    [hideAllParticipants, hiddenParticipantsStorageKey]
  );

  return (
    <Paper elevation={0} sx={{ p: 2 }}>
      <Stack spacing={2}>
        {isQuartersError && <Alert severity="error" action={<Button color="inherit" onClick={() => { void refetchQuarters(); }}>Повторить</Button>}>Не удалось загрузить кварталы</Alert>}
        {/* Заголовок + добавление задачи */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
          flexWrap="wrap"
        >
          <Typography variant="h6" sx={{ flexShrink: 0 }}>
            {isTodo ? "Бэклог" : "Дорожная карта"}
          </Typography>

          {quartersReady ? <TaskCreationControls key={creationQuarterStorageKey} quarters={creationQuarters} currentQuarterId={currentQuarterId}
            storageKey={creationQuarterStorageKey} onCreate={createTask} /> : <CircularProgress size={24} aria-label="Загрузка кварталов" />}
        </Stack>

        {/* Фильтры */}
        <FiltersPanel
          layout="wrap"
          filters={[
            {
              type: "quarters",
              key: "quarters",
              minWidth: 200,
              props: {
                label: "Фильтр по кварталам",
                extraOptions: WITHOUT_QUARTER_OPTIONS,
                value: quarterFilterValues,
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
                value: priorityFilterValues,
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
                value: visibleStatusFilters,
                onChange: handleStatusFilterChange,
              },
            },
            {
              type: "releases",
              key: "release",
              minWidth: 200,
              props: {
                label: "Релиз",
                quarterIds: selectedQuarterIds,
                ready: quartersReady,
                value: releaseFilters,
                onChange: handleReleaseFilterChange,
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
                value: streamFilterValues,
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
                value: customerFilterValues,
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
          {!isTodo && <Button
            size="small"
            variant="outlined"
            startIcon={<AddTask />}
            onClick={handleAddAllToJira}
            disabled={totalTasksCount === 0 || isAddingAllToJira}
          >
            {isAddingAllToJira
              ? "Добавляем..."
              : `Добавить все (${totalTasksCount || displayedTasksCount})`}
          </Button>}
        </Stack>

        {addAllToJiraError && <Alert severity="error">{addAllToJiraError}</Alert>}
        <Snackbar
          open={Boolean(duplicateNotice)}
          message={duplicateNotice}
          autoHideDuration={5000}
          onClose={() => setDuplicateNotice("")}
        />
        {/* Список задач с DnD */}
        <DeferredTaskCardsList
          scopeKey={`${workspace}:${filtersSignature}`}
          tasks={filteredTasks}
          allocations={allocations}
          participantOrders={participantOrders}
          hideAllParticipants={hideAllParticipants}
          hiddenParticipantsTaskIds={hiddenParticipantsTaskIds}
          isFetching={isFetching && !filteredTasks.length}
          onPersistTaskOrder={persistTaskOrder}
          participants={participants}
          participantMap={participantMap}
          sprintsGlobalOrdered={sprintsGlobalOrdered}
          selectedQuarterIds={selectedQuarterIds}
          withoutQuarterFilter={withoutQuarterFilter}
          quarterFilterOptions={taskQuarterOptions}
          customerOptions={customerOptions}
          streamOptions={streamOptions}
          onStatusChange={handleStatusChange}
          onPriorityChange={handlePriorityChange}
          onUpdateTaskPatch={handleUpdateTaskPatch}
          onTransferToPlanning={isTodo ? handleTransferToPlanning : undefined}
          onRemoveFromPlanning={isTodo ? handleRemoveFromPlanning : undefined}
          onDuplicateTask={duplicateTask}
          onOpenTaskHistory={handleOpenTaskHistory}
          onUpdateJiraLinks={handleUpdateJiraLinks}
          onMoveTask={moveTask}
          onRemoveTask={removeTask}
          isJiraSelected={isTaskInJiraCart}
          isPlanningSelected={isSourceSelected}
          onToggleJiraSelection={toggleTaskInJiraCart}
          onChangeTaskQuarters={updateTaskQuarters}
          getTaskQuarters={getTaskQuarters}
          hasTaskQuarterOverride={hasTaskQuarterOverride}
          onAllocChange={commitCell}
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

        {historyTask && <TaskHistoryDialog
          key={historyTask.id}
          task={historyTask}
          open
          onClose={handleCloseTaskHistory}
          participantMap={participantMap}
        />}

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
              loadNextTasksPage(fetchedTasksPage?.page.number ?? effectiveTasksPageNumber);
            }}
            disabled={fetchedTasks.length >= totalTasksCount || isFetching}
          >
            {isFetching ? "Загрузка..." : "Загрузить еще"}
          </Button>
        </Stack>

      </Stack>
    </Paper>
  );
}

export default React.memo(BacklogPage);
