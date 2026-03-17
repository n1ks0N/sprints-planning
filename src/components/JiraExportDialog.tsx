import * as React from "react";
import {
  Alert,
  Autocomplete,
  Button,
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
} from "../app/api";
import type {
  BacklogItem,
  JiraExportBatchItem,
  Participant,
  Sprint,
} from "../types";
import { useAppDispatch } from "../views/hooks";

type JiraExportDialogProps = {
  open: boolean;
  tasks: BacklogItem[];
  participantMap: Map<string, Participant>;
  sprints: Sprint[];
  onClose: () => void;
  onRemoveTask: (taskId: string) => void;
  onClearTasks: () => void;
};

const JIRA_EXPORT_FORM_STORAGE_KEY = "jiraExportForm_v1";
const JIRA_SPRINT_OPTIONS = [
  { value: "236205", hint: "Classic ИСУ" },
  { value: "236508", hint: "SM&Аналитика" },
  { value: "239460", hint: "GenAI сценарии" },
];
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

function formatStoryPoints(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : String(value);
}

function readStoredForm() {
  try {
    const raw = localStorage.getItem(JIRA_EXPORT_FORM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      planningSprintId:
        typeof parsed?.planningSprintId === "string" ? parsed.planningSprintId : "",
      jiraSprintId:
        typeof parsed?.jiraSprintId === "string" ? parsed.jiraSprintId : "",
      projectKey: typeof parsed?.projectKey === "string" ? parsed.projectKey : "",
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
  labels: string[];
}) {
  try {
    localStorage.setItem(JIRA_EXPORT_FORM_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function buildParticipantsPreview(
  task: BacklogItem,
  planningSprintId: string,
  participantMap: Map<string, Participant>
) {
  const participantIds = Array.isArray(task.participantIds) ? task.participantIds : [];
  if (!participantIds.length) return "—";

  return participantIds
    .map((participantId) => {
      const participantName = participantMap.get(participantId)?.fullName?.trim() || participantId;
      const storyPoints = Number(task.allocations?.[participantId]?.[planningSprintId] ?? 0);
      return `${participantName} - ${formatStoryPoints(storyPoints)} SP`;
    })
    .join(", ");
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
  onClose,
  onRemoveTask,
  onClearTasks,
}: JiraExportDialogProps) {
  const dispatch = useAppDispatch();
  const [planningSprintId, setPlanningSprintId] = React.useState("");
  const [jiraSprintId, setJiraSprintId] = React.useState("");
  const [projectKey, setProjectKey] = React.useState("");
  const [labels, setLabels] = React.useState<string[]>([]);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [requestError, setRequestError] = React.useState("");
  const [activeBatchId, setActiveBatchId] = React.useState<string | null>(null);
  const [batchPollingInterval, setBatchPollingInterval] = React.useState(0);
  const [exportJiraIssues, { isLoading: isStarting }] = useExportJiraIssuesMutation();
  const [confirmCreated, { isLoading: isConfirmingCreated }] = useConfirmJiraIssueCreatedMutation();
  const [confirmNotCreated, { isLoading: isConfirmingNotCreated }] = useConfirmJiraIssueNotCreatedMutation();

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

  const selectedJiraSprintOption = React.useMemo(
    () => JIRA_SPRINT_OPTIONS.find((option) => option.value === jiraSprintId) ?? null,
    [jiraSprintId]
  );

  const selectedProjectOption = React.useMemo(
    () => JIRA_PROJECT_OPTIONS.find((option) => option === projectKey) ?? null,
    [projectKey]
  );

  React.useEffect(() => {
    if (!open) return;
    const storedForm = readStoredForm();
    setSubmitAttempted(false);
    setRequestError("");
    const storedPlanningSprintId = (storedForm?.planningSprintId || "").trim();
    const nextPlanningSprintId = sprints.some((sprint) => sprint.id === storedPlanningSprintId)
      ? storedPlanningSprintId
      : currentPlanningSprintId;
    const nextJiraSprintId =
      (storedForm?.jiraSprintId || "").trim() || JIRA_SPRINT_OPTIONS[0]?.value || "";
    const nextProjectKey =
      (storedForm?.projectKey || "").trim() || JIRA_PROJECT_OPTIONS[0] || "";
    const nextLabels = normalizeStringArray(storedForm?.labels || []);

    setPlanningSprintId(nextPlanningSprintId);
    setJiraSprintId(nextJiraSprintId);
    setProjectKey(nextProjectKey);
    setLabels(nextLabels);

    if (storedPlanningSprintId && storedPlanningSprintId !== nextPlanningSprintId) {
      writeStoredForm({
        planningSprintId: nextPlanningSprintId,
        jiraSprintId: nextJiraSprintId,
        projectKey: nextProjectKey,
        labels: nextLabels,
      });
    }
  }, [open, sprints, currentPlanningSprintId]);

  React.useEffect(() => {
    if (!open) return;
    writeStoredForm({
      planningSprintId,
      jiraSprintId,
      projectKey,
      labels,
    });
  }, [open, planningSprintId, jiraSprintId, projectKey, labels]);

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
    const normalizedProjectKey = projectKey.trim();
    const normalizedJiraSprintId = jiraSprintId.trim();

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
        labels,
      }).unwrap();
      setActiveBatchId(response.batchId);
      setRequestError("");
    } catch (error: any) {
      const message =
        error?.data?.error || error?.data?.message || "Не удалось запустить экспорт в Jira";
      setRequestError(String(message));
    }
  }, [exportJiraIssues, jiraSprintId, labels, planningSprintId, projectKey, selectedPlanningSprint, tasks]);

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
        }).unwrap();
        dispatch(api.util.upsertQueryData("getJiraExportBatch", response.batchId, response));
      } catch (error: any) {
        const message =
          error?.data?.error || error?.data?.message || "Не удалось подтвердить создание Jira-задачи";
        setRequestError(String(message));
      }
    },
    [confirmCreated, dispatch]
  );

  const handleConfirmNotCreated = React.useCallback(
    async (item: JiraExportBatchItem) => {
      if (!item.taskJiraIssueId) return;
      if (!window.confirm("Подтвердить, что Jira-задача не была создана?")) {
        return;
      }
      try {
        const response = await confirmNotCreated({ taskJiraIssueId: item.taskJiraIssueId }).unwrap();
        dispatch(api.util.upsertQueryData("getJiraExportBatch", response.batchId, response));
      } catch (error: any) {
        const message =
          error?.data?.error || error?.data?.message || "Не удалось подтвердить отсутствие Jira-задачи";
        setRequestError(String(message));
      }
    },
    [confirmNotCreated, dispatch]
  );

  const planningSprintError = submitAttempted && !planningSprintId;
  const jiraSprintError =
    submitAttempted && (!jiraSprintId.trim() || !/^\d+$/.test(jiraSprintId.trim()));
  const projectKeyError = submitAttempted && !projectKey.trim();

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
                options={JIRA_SPRINT_OPTIONS}
                value={selectedJiraSprintOption}
                inputValue={jiraSprintId}
                onChange={(_e, value) =>
                  setJiraSprintId(typeof value === "string" ? value : value?.value || "")
                }
                onInputChange={(_e, value, reason) => {
                  if (reason === "reset" && selectedJiraSprintOption) return;
                  setJiraSprintId(value);
                }}
                getOptionLabel={(option) => (typeof option === "string" ? option : option.value)}
                renderOption={(props, option) => {
                  const { key, ...optionProps } = props;
                  return (
                    <li key={key} {...optionProps}>
                      <Stack spacing={0}>
                        <Typography variant="body2">{option.value}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.hint}
                        </Typography>
                      </Stack>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Jira sprint id" error={jiraSprintError} />
                )}
                fullWidth
              />

              <Autocomplete
                freeSolo
                options={JIRA_PROJECT_OPTIONS}
                value={selectedProjectOption}
                inputValue={projectKey}
                onChange={(_e, value) => setProjectKey(typeof value === "string" ? value : value || "")}
                onInputChange={(_e, value, reason) => {
                  if (reason === "reset" && selectedProjectOption) return;
                  setProjectKey(value);
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Jira project.key" error={projectKeyError} />
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
                <Stack direction="row" justifyContent="flex-end">
                  <Button
                    color="error"
                    startIcon={<DeleteSweep />}
                    onClick={onClearTasks}
                    disabled={tasks.length === 0 || isBusy}
                  >
                    Удалить все
                  </Button>
                </Stack>

                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Название задачи</TableCell>
                        <TableCell>Участники</TableCell>
                        <TableCell width={72} align="right">
                          Действия
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tasks.map((task) => (
                        <TableRow key={task.id} hover>
                          <TableCell>{task.title || "Без названия"}</TableCell>
                          <TableCell>
                            {buildParticipantsPreview(task, planningSprintId, participantMap)}
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
                        {item.status === "MANUAL_CHECK_REQUIRED" && item.taskJiraIssueId ? (
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
