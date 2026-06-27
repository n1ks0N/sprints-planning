import * as React from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Delete, DeleteSweep, OpenInNew } from "@mui/icons-material";
import moment from "moment";
import "moment/locale/ru";

import {
  api,
  useConfirmJiraIssueCreatedMutation,
  useConfirmJiraIssueNotCreatedMutation,
  useExportJiraIssuesMutation,
  useGetJiraExportBatchQuery,
  useGetJiraSprintOptionsQuery,
} from "../app/api";
import type {
  BacklogItem,
  JiraExportBatchItem,
  JiraSprintOption,
  Participant,
  Release,
  Sprint,
} from "../types";
import { useAppDispatch } from "../views/hooks";

type JiraExportDialogProps = {
  open: boolean;
  tasks: BacklogItem[];
  participantMap: Map<string, Participant>;
  sprints: Sprint[];
  releases: Release[];
  onClose: () => void;
  onRemoveTask: (taskId: string) => void;
  onClearTasks: () => void;
};

const JIRA_EXPORT_FORM_STORAGE_KEY = "jiraExportForm_v1";
const JIRA_PROJECT_OPTIONS = ["ISUWEBNAPP", "CUSTOMLAB"];
const JIRA_LABEL_OPTIONS = ["ai-core", "an&sm", "isugenai"];

moment.locale("ru");

function normalizeStringArray(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function planningSprintLabel(sprint: Sprint) {
  return `${sprint.name} (${moment(sprint.startDate).format("DD.MM.YYYY")} - ${moment(sprint.endDate).format("DD.MM.YYYY")})`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isISOWithin(iso: string, startISO: string, endISO: string) {
  return iso >= startISO && iso <= endISO;
}

function formatLoad(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : String(value);
}

function readStoredForm() {
  try {
    const raw = sessionStorage.getItem(JIRA_EXPORT_FORM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const createStoryByTaskId =
      parsed?.createStoryByTaskId &&
      typeof parsed.createStoryByTaskId === "object" &&
      !Array.isArray(parsed.createStoryByTaskId)
        ? Object.fromEntries(
            Object.entries(parsed.createStoryByTaskId).filter(
              ([taskId, selected]) => typeof taskId === "string" && typeof selected === "boolean"
            )
          )
        : {};
    return {
      planningSprintId:
        typeof parsed?.planningSprintId === "string" ? parsed.planningSprintId : "",
      jiraSprintId:
        typeof parsed?.jiraSprintId === "string" ? parsed.jiraSprintId : "",
      projectKey:
        typeof parsed?.projectKey === "string" ? parsed.projectKey : "",
      createStoryByTaskId,
      taskLabelsByTaskId:
        parsed?.taskLabelsByTaskId &&
        typeof parsed.taskLabelsByTaskId === "object" &&
        !Array.isArray(parsed.taskLabelsByTaskId)
          ? Object.fromEntries(
              Object.entries(parsed.taskLabelsByTaskId).map(([taskId, values]) => [
                taskId,
                Array.isArray(values)
                  ? values.filter((value: unknown): value is string => typeof value === "string")
                  : [],
              ])
            )
          : {},
      labels: Array.isArray(parsed?.labels)
        ? parsed.labels.filter((value: unknown): value is string => typeof value === "string")
        : [],
    };
  } catch {
    return null;
  }
}

function writeStoredForm(value: {
  planningSprintId: string;
  jiraSprintId: string;
  projectKey: string;
  createStoryByTaskId: Record<string, boolean>;
  taskLabelsByTaskId: Record<string, string[]>;
  labels: string[];
}) {
  try {
    sessionStorage.setItem(JIRA_EXPORT_FORM_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function participantOptionLabel(participantId: string, participantMap: Map<string, Participant>) {
  const participant = participantMap.get(participantId);
  if (!participant) return participantId;
  const login = participant.jiraLogin?.trim();
  return login ? `${participant.fullName} (${login})` : participant.fullName;
}

function buildDefaultParticipantIds(
  task: BacklogItem,
  planningSprintId: string
) {
  const participantIds = Array.isArray(task.participantIds) ? task.participantIds : [];
  const withLoad = participantIds.filter((participantId) => {
    const storyPoints = Number(task.allocations?.[participantId]?.[planningSprintId] ?? 0);
    return storyPoints > 0;
  });
  return withLoad.length ? withLoad : participantIds;
}

function selectedStoryPoints(task: BacklogItem, planningSprintId: string, participantIds: string[]) {
  return participantIds.reduce(
    (sum, participantId) => sum + Number(task.allocations?.[participantId]?.[planningSprintId] ?? 0),
    0
  );
}

function participantLoad(task: BacklogItem, planningSprintId: string, participantId: string) {
  return Number(task.allocations?.[participantId]?.[planningSprintId] ?? 0);
}

function sprintOptionLabel(option: JiraSprintOption | string) {
  if (typeof option === "string") return option;
  const dates = option.startDate || option.endDate
    ? ` · ${option.startDate ? moment(option.startDate).format("DD.MM") : "?"}-${option.endDate ? moment(option.endDate).format("DD.MM") : "?"}`
    : "";
  return `${option.name} · ${option.id}${dates}`;
}

function releaseDefaultLabel(task: BacklogItem, releaseMap: Map<string, Release>) {
  if (!task.releaseDateId) return null;
  const release = releaseMap.get(task.releaseDateId);
  if (!release?.promDate) return null;
  const promDate = moment(release.promDate, "YYYY-MM-DD", true);
  if (!promDate.isValid()) return null;
  return `plan_release_${promDate.format("YYYYMMDD")}`;
}

function isTerminalBatchStatus(status?: string | null) {
  return (
    status === "COMPLETED" ||
    status === "COMPLETED_WITH_ERRORS" ||
    status === "COMPLETED_WITH_MANUAL_ACTION"
  );
}

function ResultAlert({
  createdItems,
  failedItems,
  skippedItems,
  manualCheckItems,
}: {
  createdItems: number;
  failedItems: number;
  skippedItems: number;
  manualCheckItems: number;
}) {
  if (manualCheckItems > 0) {
    return (
      <Alert severity="warning">
        Создано: {createdItems}, пропущено: {skippedItems}, с ошибкой: {failedItems}, требуют ручной проверки: {manualCheckItems}
      </Alert>
    );
  }

  if (failedItems > 0) {
    return (
      <Alert severity="warning">
        Создано: {createdItems}, пропущено: {skippedItems}, с ошибкой: {failedItems}
      </Alert>
    );
  }

  return <Alert severity="success">Создано: {createdItems}, пропущено: {skippedItems}</Alert>;
}

function statusLabel(item: JiraExportBatchItem) {
  switch (item.status) {
    case "PENDING":
      return "ожидает";
    case "IN_PROGRESS":
      return "в работе";
    case "CREATED":
      return "created";
    case "FAILED":
      return "failed";
    case "SKIPPED":
      return "skipped";
    case "MANUAL_CHECK_REQUIRED":
      return "требует проверки";
    default:
      return item.status;
  }
}

export default function JiraExportDialog({
  open,
  tasks,
  participantMap,
  sprints,
  releases,
  onClose,
  onRemoveTask,
  onClearTasks,
}: JiraExportDialogProps) {
  const dispatch = useAppDispatch();
  const [planningSprintId, setPlanningSprintId] = React.useState("");
  const [jiraSprintId, setJiraSprintId] = React.useState("");
  const [jiraSprintInputValue, setJiraSprintInputValue] = React.useState("");
  const [jiraSprintSearch, setJiraSprintSearch] = React.useState("");
  const [jiraSprintQuery, setJiraSprintQuery] = React.useState("");
  const [projectKey, setProjectKey] = React.useState("");
  const [labels, setLabels] = React.useState<string[]>([]);
  const [taskLabelsByTaskId, setTaskLabelsByTaskId] = React.useState<Record<string, string[]>>({});
  const [participantIdsByTaskId, setParticipantIdsByTaskId] = React.useState<Record<string, string[]>>({});
  const [createStoryByTaskId, setCreateStoryByTaskId] = React.useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [requestError, setRequestError] = React.useState("");
  const [activeBatchId, setActiveBatchId] = React.useState<string | null>(null);
  const [batchPollingInterval, setBatchPollingInterval] = React.useState(0);
  const [exportJiraIssues, { isLoading: isStarting }] = useExportJiraIssuesMutation();
  const [confirmCreated, { isLoading: isConfirmingCreated }] = useConfirmJiraIssueCreatedMutation();
  const [confirmNotCreated, { isLoading: isConfirmingNotCreated }] = useConfirmJiraIssueNotCreatedMutation();
  const sprintOptionsQuery = useGetJiraSprintOptionsQuery(
    jiraSprintQuery ? { query: jiraSprintQuery } : undefined,
    { skip: !open }
  );
  const jiraSprintOptions = sprintOptionsQuery.data || [];

  const batchQuery = useGetJiraExportBatchQuery(activeBatchId || "", {
    skip: !open || !activeBatchId,
    pollingInterval: batchPollingInterval,
  });
  const batchData = batchQuery.data;
  const batchStatus = batchData?.status || null;
  const terminal = isTerminalBatchStatus(batchStatus);

  React.useEffect(() => {
    if (open && activeBatchId && !terminal) {
      setBatchPollingInterval(3000);
      return;
    }
    setBatchPollingInterval(0);
  }, [open, activeBatchId, terminal]);

  const currentPlanningSprintId = React.useMemo(() => {
    const today = todayISO();
    return (
      sprints.find((sprint) => isISOWithin(today, sprint.startDate, sprint.endDate))?.id ??
      sprints[0]?.id ??
      ""
    );
  }, [sprints]);

  const releaseMap = React.useMemo(
    () => new Map(releases.map((release) => [release.id, release])),
    [releases]
  );

  const selectedJiraSprintOption = React.useMemo(
    () => jiraSprintOptions.find((option) => option.id === jiraSprintId) ?? null,
    [jiraSprintId, jiraSprintOptions]
  );
  const selectedProjectOption = React.useMemo(
    () => JIRA_PROJECT_OPTIONS.find((option) => option === projectKey) ?? null,
    [projectKey]
  );

  React.useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      setJiraSprintQuery(jiraSprintSearch.trim());
    }, 400);
    return () => window.clearTimeout(handle);
  }, [jiraSprintSearch, open]);

  React.useEffect(() => {
    if (!open) return;
    const storedForm = readStoredForm();
    setSubmitAttempted(false);
    setRequestError("");
    const storedPlanningSprintId = (storedForm?.planningSprintId || "").trim();
    const nextPlanningSprintId = sprints.some((sprint) => sprint.id === storedPlanningSprintId)
      ? storedPlanningSprintId
      : currentPlanningSprintId;
    const nextJiraSprintId = (storedForm?.jiraSprintId || "").trim();
    const nextProjectKey = (storedForm?.projectKey || "").trim().toUpperCase() || JIRA_PROJECT_OPTIONS[0] || "";
    const nextCreateStoryByTaskId = tasks.reduce<Record<string, boolean>>((acc, task) => {
      acc[task.id] = Boolean(storedForm?.createStoryByTaskId?.[task.id]);
      return acc;
    }, {});
    const nextTaskLabelsByTaskId = tasks.reduce<Record<string, string[]>>((acc, task) => {
      const defaultLabel = releaseDefaultLabel(task, releaseMap);
      acc[task.id] = normalizeStringArray([
        ...(storedForm?.taskLabelsByTaskId?.[task.id] || []),
        ...(defaultLabel ? [defaultLabel] : []),
      ]);
      return acc;
    }, {});
    const nextLabels = normalizeStringArray(storedForm?.labels || []);

    setPlanningSprintId(nextPlanningSprintId);
    setJiraSprintId(nextJiraSprintId);
    setJiraSprintInputValue(nextJiraSprintId);
    setJiraSprintSearch("");
    setJiraSprintQuery("");
    setProjectKey(nextProjectKey);
    setLabels(nextLabels);
    setTaskLabelsByTaskId(nextTaskLabelsByTaskId);
    setCreateStoryByTaskId(nextCreateStoryByTaskId);

    if (storedPlanningSprintId && storedPlanningSprintId !== nextPlanningSprintId) {
      writeStoredForm({
        planningSprintId: nextPlanningSprintId,
        jiraSprintId: nextJiraSprintId,
        projectKey: nextProjectKey,
        createStoryByTaskId: nextCreateStoryByTaskId,
        taskLabelsByTaskId: nextTaskLabelsByTaskId,
        labels: nextLabels,
      });
    }
  }, [open, sprints, currentPlanningSprintId, releaseMap, tasks]);

  React.useEffect(() => {
    if (!open || jiraSprintId || jiraSprintOptions.length === 0) return;
    const firstOption = jiraSprintOptions[0];
    setJiraSprintId(firstOption.id);
    setJiraSprintInputValue(sprintOptionLabel(firstOption));
  }, [jiraSprintId, jiraSprintOptions, open]);

  React.useEffect(() => {
    if (!open || !selectedJiraSprintOption) return;
    setJiraSprintInputValue(sprintOptionLabel(selectedJiraSprintOption));
  }, [open, selectedJiraSprintOption]);

  React.useEffect(() => {
    if (!open || !planningSprintId) return;
    setParticipantIdsByTaskId((prev) => {
      const next: Record<string, string[]> = {};
      for (const task of tasks) {
        const validTaskParticipantIds = new Set(Array.isArray(task.participantIds) ? task.participantIds : []);
        const previous = (prev[task.id] || []).filter((participantId) => validTaskParticipantIds.has(participantId));
        next[task.id] = previous.length ? previous : buildDefaultParticipantIds(task, planningSprintId);
      }
      return next;
    });
    setCreateStoryByTaskId((prev) => {
      const next: Record<string, boolean> = {};
      for (const task of tasks) {
        next[task.id] = Boolean(prev[task.id]);
      }
      return next;
    });
    setTaskLabelsByTaskId((prev) => {
      const next: Record<string, string[]> = {};
      for (const task of tasks) {
        const defaultLabel = releaseDefaultLabel(task, releaseMap);
        next[task.id] = normalizeStringArray([
          ...(prev[task.id] || []),
          ...(defaultLabel ? [defaultLabel] : []),
        ]);
      }
      return next;
    });
  }, [open, planningSprintId, releaseMap, tasks]);

  React.useEffect(() => {
    if (!open) return;
    writeStoredForm({
      planningSprintId,
      jiraSprintId,
      projectKey,
      createStoryByTaskId,
      taskLabelsByTaskId,
      labels,
    });
  }, [open, planningSprintId, jiraSprintId, projectKey, createStoryByTaskId, taskLabelsByTaskId, labels]);

  const selectedPlanningSprint = React.useMemo(
    () => sprints.find((sprint) => sprint.id === planningSprintId) ?? null,
    [planningSprintId, sprints]
  );

  const invalidatedBatchesRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!batchData || !terminal) return;
    if (invalidatedBatchesRef.current.has(batchData.batchId)) return;
    invalidatedBatchesRef.current.add(batchData.batchId);
    const taskIds = Array.from(new Set((batchData.items || []).map((item) => item.taskId).filter(Boolean)));
    dispatch(
      api.util.invalidateTags([
        { type: "Task", id: "LIST" },
        ...taskIds.map((taskId) => ({ type: "Task" as const, id: taskId })),
      ])
    );
  }, [batchData, dispatch, terminal]);

  const handleClose = React.useCallback(() => {
    onClose();
  }, [onClose]);

  const handleFinish = React.useCallback(() => {
    onClearTasks();
    setActiveBatchId(null);
    setRequestError("");
    onClose();
  }, [onClearTasks, onClose]);

  const handleSubmit = React.useCallback(async () => {
    setSubmitAttempted(true);
    const normalizedJiraSprintId = jiraSprintId.trim();
    const normalizedProjectKey = projectKey.trim().toUpperCase();

    if (!planningSprintId || !normalizedJiraSprintId || !normalizedProjectKey) {
      return;
    }

    if (!selectedPlanningSprint) {
      setRequestError("Не удалось определить выбранный спринт сервиса");
      return;
    }

    if (!/^\d+$/.test(normalizedJiraSprintId)) {
      setRequestError("Jira sprint id должен быть числом");
      return;
    }

    try {
      const response = await exportJiraIssues({
        taskIds: tasks.map((task) => task.id),
        planningSprintId,
        jiraSprintId: normalizedJiraSprintId,
        projectKey: normalizedProjectKey,
        participantIdsByTaskId,
        createStoryByTaskId,
        labels,
        taskLabelsByTaskId,
      }).unwrap();
      setActiveBatchId(response.batchId);
      setRequestError("");
    } catch (error: any) {
      const message =
        error?.data?.error || error?.data?.message || "Не удалось запустить экспорт в Jira";
      setRequestError(String(message));
    }
  }, [createStoryByTaskId, exportJiraIssues, jiraSprintId, labels, participantIdsByTaskId, planningSprintId, projectKey, selectedPlanningSprint, taskLabelsByTaskId, tasks]);

  const handleConfirmCreated = React.useCallback(
    async (item: JiraExportBatchItem) => {
      if (!item.taskJiraIssueId) return;
      const jiraIssueKey = window.prompt("Введите Jira issue key", item.jiraIssueKey || "");
      if (!jiraIssueKey || !jiraIssueKey.trim()) {
        return;
      }
      try {
        const response = await confirmCreated({
          taskJiraIssueId: item.taskJiraIssueId,
          jiraIssueKey: jiraIssueKey.trim(),
          batchId: activeBatchId,
        }).unwrap();
        dispatch(api.util.upsertQueryData("getJiraExportBatch", response.batchId, response));
      } catch (error: any) {
        const message =
          error?.data?.error || error?.data?.message || "Не удалось подтвердить создание Jira-задачи";
        setRequestError(String(message));
      }
    },
    [activeBatchId, confirmCreated, dispatch]
  );

  const handleConfirmNotCreated = React.useCallback(
    async (item: JiraExportBatchItem) => {
      if (!item.taskJiraIssueId) return;
      if (!window.confirm("Подтвердить, что Jira-задача не была создана?")) {
        return;
      }
      try {
        const response = await confirmNotCreated({
          taskJiraIssueId: item.taskJiraIssueId,
          batchId: activeBatchId,
        }).unwrap();
        dispatch(api.util.upsertQueryData("getJiraExportBatch", response.batchId, response));
      } catch (error: any) {
        const message =
          error?.data?.error || error?.data?.message || "Не удалось подтвердить отсутствие Jira-задачи";
        setRequestError(String(message));
      }
    },
    [activeBatchId, confirmNotCreated, dispatch]
  );

  const planningSprintError = submitAttempted && !planningSprintId;
  const jiraSprintError =
    submitAttempted && (!jiraSprintId.trim() || !/^\d+$/.test(jiraSprintId.trim()));
  const projectKeyError = submitAttempted && !projectKey.trim();
  const taskIds = React.useMemo(() => tasks.map((task) => task.id), [tasks]);
  const selectedStoryTaskCount = React.useMemo(
    () => taskIds.filter((taskId) => Boolean(createStoryByTaskId[taskId])).length,
    [createStoryByTaskId, taskIds]
  );
  const allStoryTasksSelected = taskIds.length > 0 && selectedStoryTaskCount === taskIds.length;
  const someStoryTasksSelected =
    selectedStoryTaskCount > 0 && selectedStoryTaskCount < taskIds.length;

  const batchItems = batchData?.items || [];
  const isBusy = isStarting || isConfirmingCreated || isConfirmingNotCreated || batchQuery.isFetching;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg">
      <DialogTitle>
        {activeBatchId ? "Статус заведения задач в Jira" : "Заведение задач в Jira"}
      </DialogTitle>
      <DialogContent dividers>
        {!activeBatchId ? (
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                select
                fullWidth
                label="Спринт сервиса планирования"
                value={planningSprintId}
                onChange={(e) => setPlanningSprintId(String(e.target.value))}
                error={planningSprintError}
              >
                {sprints.map((sprint) => (
                  <MenuItem key={sprint.id} value={sprint.id}>
                    {planningSprintLabel(sprint)}
                  </MenuItem>
                ))}
              </TextField>

              <Autocomplete
                freeSolo
                options={jiraSprintOptions}
                value={selectedJiraSprintOption}
                inputValue={jiraSprintInputValue}
                onChange={(_e, value) => {
                  if (typeof value === "string") {
                    const normalized = value.trim();
                    setJiraSprintId(/^\d+$/.test(normalized) ? normalized : "");
                    setJiraSprintInputValue(value);
                    setJiraSprintSearch(value);
                    return;
                  }
                  setJiraSprintId(value?.id || "");
                  setJiraSprintInputValue(value ? sprintOptionLabel(value) : "");
                  setJiraSprintSearch(value?.name || "");
                }}
                onInputChange={(_e, value, reason) => {
                  if (reason === "reset") return;
                  const normalized = value.trim();
                  const selectedLabel = selectedJiraSprintOption
                    ? sprintOptionLabel(selectedJiraSprintOption)
                    : "";
                  setJiraSprintInputValue(value);
                  if (normalized !== selectedLabel) {
                    setJiraSprintId(/^\d+$/.test(normalized) ? normalized : "");
                  }
                  setJiraSprintSearch(value);
                }}
                getOptionLabel={sprintOptionLabel}
                loading={sprintOptionsQuery.isFetching}
                renderOption={(props, option) => {
                  const { key, ...optionProps } = props;
                  return (
                    <li key={key} {...optionProps}>
                      <Stack spacing={0}>
                        <Typography variant="body2">{option.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.id} · {option.state}
                          {option.startDate || option.endDate
                            ? ` · ${option.startDate ? moment(option.startDate).format("DD.MM.YYYY") : "?"} - ${option.endDate ? moment(option.endDate).format("DD.MM.YYYY") : "?"}`
                            : ""}
                        </Typography>
                      </Stack>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Jira sprint"
                    error={jiraSprintError}
                    helperText={sprintOptionsQuery.error ? "Не удалось загрузить спринты Jira" : "Поиск по названию или id; в Jira будет передан id выбранного спринта"}
                  />
                )}
                fullWidth
              />

              <Autocomplete
                freeSolo
                options={JIRA_PROJECT_OPTIONS}
                value={selectedProjectOption}
                inputValue={projectKey}
                onChange={(_e, value) => {
                  setProjectKey((typeof value === "string" ? value : value || "").toUpperCase());
                }}
                onInputChange={(_e, value, reason) => {
                  if (reason === "reset" && selectedProjectOption) return;
                  setProjectKey(value.toUpperCase());
                }}
                renderInput={(params) => (
                  <TextField {...params} label="ProjectKey" error={projectKeyError} />
                )}
                fullWidth
              />

            </Stack>

            <Autocomplete
              multiple
              freeSolo
              options={JIRA_LABEL_OPTIONS}
              value={labels}
              onChange={(_e, value) =>
                setLabels(
                  normalizeStringArray(
                    value.map((item) => (typeof item === "string" ? item : String(item)))
                  )
                )
              }
              renderInput={(params) => <TextField {...params} label="Labels" />}
              fullWidth
            />

            {requestError ? (
              <Typography variant="body2" color="error">
                {requestError}
              </Typography>
            ) : null}

            {tasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Список задач пуст.
              </Typography>
            ) : (
              <Stack spacing={1}>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell width={88} align="center">
                          <Tooltip title={`Story для всех: выбрано ${selectedStoryTaskCount} из ${tasks.length}`}>
                            <span>
                              <Checkbox
                                size="small"
                                checked={allStoryTasksSelected}
                                indeterminate={someStoryTasksSelected}
                                disabled={tasks.length === 0}
                                onChange={(event) => {
                                  const checked = event.target.checked;
                                  setCreateStoryByTaskId(
                                    taskIds.reduce<Record<string, boolean>>((acc, taskId) => {
                                      acc[taskId] = checked;
                                      return acc;
                                    }, {})
                                  );
                                }}
                                inputProps={{ "aria-label": "Выбрать Story для всех задач" }}
                                sx={{ p: 0.5 }}
                              />
                            </span>
                          </Tooltip>
                        </TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell width={72} align="right">
                          <Tooltip title="Удалить все задачи из списка">
                            <span>
                              <IconButton
                                color="default"
                                size="small"
                                onClick={onClearTasks}
                                disabled={tasks.length === 0 || isBusy}
                                aria-label="Удалить все задачи из списка"
                                sx={{ color: "text.secondary" }}
                              >
                                <DeleteSweep fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell width={88} align="center">
                          Story
                        </TableCell>
                        <TableCell>Название задачи</TableCell>
                        <TableCell width={280}>Labels</TableCell>
                        <TableCell>Участники для Jira</TableCell>
                        <TableCell width={72} align="right">
                          Действия
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tasks.map((task) => (
                        <TableRow key={task.id} hover>
                          <TableCell align="center">
                            <Checkbox
                              size="small"
                              checked={Boolean(createStoryByTaskId[task.id])}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                setCreateStoryByTaskId((prev) => ({
                                  ...prev,
                                  [task.id]: checked,
                                }));
                              }}
                              sx={{ p: 0.5 }}
                            />
                          </TableCell>
                          <TableCell>
                            {task.title || "Без названия"}
                          </TableCell>
                          <TableCell>
                            <Autocomplete
                              multiple
                              freeSolo
                              size="small"
                              options={normalizeStringArray([
                                ...JIRA_LABEL_OPTIONS,
                                ...(releaseDefaultLabel(task, releaseMap)
                                  ? [releaseDefaultLabel(task, releaseMap) as string]
                                  : []),
                              ])}
                              value={taskLabelsByTaskId[task.id] || []}
                              onChange={(_event, value) => {
                                setTaskLabelsByTaskId((prev) => ({
                                  ...prev,
                                  [task.id]: normalizeStringArray(
                                    value.map((item) =>
                                      typeof item === "string" ? item : String(item)
                                    )
                                  ),
                                }));
                              }}
                              limitTags={2}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  placeholder="Labels задачи"
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <Autocomplete
                              multiple
                              size="small"
                              disableCloseOnSelect
                              limitTags={2}
                              options={Array.isArray(task.participantIds) ? task.participantIds : []}
                              value={participantIdsByTaskId[task.id] || []}
                              onChange={(_event, value) => {
                                setParticipantIdsByTaskId((prev) => ({
                                  ...prev,
                                  [task.id]: value,
                                }));
                              }}
                              getOptionLabel={(participantId) => participantOptionLabel(participantId, participantMap)}
                              renderOption={(props, participantId) => {
                                const { key, ...optionProps } = props;
                                const load = participantLoad(task, planningSprintId, participantId);
                                return (
                                  <li key={key} {...optionProps}>
                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
                                      <Typography variant="body2" sx={{ flex: 1 }}>
                                        {participantOptionLabel(participantId, participantMap)}
                                      </Typography>
                                      <Typography variant="caption" color={load > 0 ? "text.primary" : "text.secondary"}>
                                        {formatLoad(load)} SP
                                      </Typography>
                                    </Stack>
                                  </li>
                                );
                              }}
                              renderTags={(value, getTagProps) =>
                                value.map((participantId, index) => {
                                  const { key, ...tagProps } = getTagProps({ index });
                                  const load = participantLoad(task, planningSprintId, participantId);
                                  return (
                                    <Chip
                                      key={key}
                                      size="small"
                                      label={`${participantOptionLabel(participantId, participantMap)} · ${formatLoad(load)} SP`}
                                      {...tagProps}
                                    />
                                  );
                                })
                              }
                              renderInput={(params) => {
                                const selectedIds = participantIdsByTaskId[task.id] || [];
                                const total = selectedStoryPoints(task, planningSprintId, selectedIds);
                                return (
                                  <TextField
                                    {...params}
                                    placeholder="Выбрать участников"
                                    helperText={`${selectedIds.length} выбрано, суммарно ${formatLoad(total)} SP`}
                                  />
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <IconButton size="small" onClick={() => onRemoveTask(task.id)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            )}
          </Stack>
        ) : (
          <Stack spacing={2}>
            {batchData ? (
              <ResultAlert
                createdItems={batchData.createdItems}
                failedItems={batchData.failedItems}
                skippedItems={batchData.skippedItems}
                manualCheckItems={batchData.manualCheckItems}
              />
            ) : null}

            {!terminal && batchData ? (
              <Alert severity="info">
                Обработано {batchData.processedItems} из {batchData.totalItems}
              </Alert>
            ) : null}

            {requestError ? (
              <Typography variant="body2" color="error">
                {requestError}
              </Typography>
            ) : null}

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Задача</TableCell>
                    <TableCell>Тип</TableCell>
                    <TableCell>Project</TableCell>
                    <TableCell>Участник</TableCell>
                    <TableCell>Спринт</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>Сообщение</TableCell>
                    <TableCell>Jira</TableCell>
                    <TableCell align="right">Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {batchItems.map((item) => (
                    <TableRow key={item.itemId} hover>
                      <TableCell>{item.taskTitle || item.taskId}</TableCell>
                      <TableCell>{item.issueScope === "STORY" ? "Story" : "Участник"}</TableCell>
                      <TableCell>{item.projectKey || "—"}</TableCell>
                      <TableCell>{item.participantName || "—"}</TableCell>
                      <TableCell>{item.planningSprintName || "—"}</TableCell>
                      <TableCell>{statusLabel(item)}</TableCell>
                      <TableCell>{item.message || "—"}</TableCell>
                      <TableCell>
                        {item.jiraIssueUrl && item.jiraIssueKey ? (
                          <Link
                            href={item.jiraIssueUrl}
                            target="_blank"
                            rel="noreferrer"
                            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                          >
                            {item.jiraIssueKey}
                            <OpenInNew fontSize="inherit" />
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {item.manualActionRequired && item.taskJiraIssueId ? (
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleConfirmCreated(item)}
                              disabled={isBusy}
                            >
                              Создана
                            </Button>
                            <Button
                              size="small"
                              color="warning"
                              variant="outlined"
                              onClick={() => handleConfirmNotCreated(item)}
                              disabled={isBusy}
                            >
                              Не создана
                            </Button>
                          </Stack>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Divider />
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        {activeBatchId && terminal ? (
          <Button onClick={handleFinish}>Закрыть</Button>
        ) : (
          <Button onClick={handleClose}>Закрыть</Button>
        )}

        {!activeBatchId ? (
          <Button variant="contained" onClick={handleSubmit} disabled={tasks.length === 0 || isBusy}>
            {isStarting ? "Запуск..." : "Завести"}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
