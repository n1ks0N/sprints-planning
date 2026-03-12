import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
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
import { Delete } from "@mui/icons-material";

import type { BacklogItem, Participant, Sprint } from "../types";

type JiraExportDialogProps = {
  open: boolean;
  tasks: BacklogItem[];
  participantMap: Map<string, Participant>;
  sprints: Sprint[];
  onClose: () => void;
  onRemoveTask: (taskId: string) => void;
  onClearTasks: () => void;
};

type JiraDraftIssue = {
  issueKey: string;
  taskId: string;
  taskTitle: string;
  participantId: string;
  participantName: string;
  description: string;
  labels: string[];
  storyPoints: number;
  projectValue: string;
  issueTypeId: string;
  issueTypeName: string;
  summary: string;
  jiraSprintId: string;
  planningSprintId: string;
  planningSprintName: string;
};

const JIRA_ISSUE_TYPE_ID = "3";
const JIRA_ISSUE_TYPE_NAME = "Задача";

function planningSprintLabel(sprint: Sprint) {
  return `${sprint.name} (${sprint.startDate} - ${sprint.endDate})`;
}

function buildIssueDescription(description: string, dod: string) {
  const normalizedDescription = description?.trim();
  const normalizedDod = dod?.trim();

  if (normalizedDescription && normalizedDod) {
    return `${normalizedDescription}\n\nDoD:\n${normalizedDod}`;
  }

  if (normalizedDescription) return normalizedDescription;
  if (normalizedDod) return `DoD:\n${normalizedDod}`;
  return "";
}

function parseLabels(labelsInput: string) {
  return labelsInput
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}

function buildPreviewRows(
  tasks: BacklogItem[],
  planningSprintId: string,
  participantMap: Map<string, Participant>
) {
  const rows: Array<{
    taskId: string;
    taskTitle: string;
    taskDescription: string;
    taskDod: string;
    participantId: string;
    participantName: string;
    storyPoints: number;
  }> = [];

  const coveredTaskIds = new Set<string>();

  for (const task of tasks) {
    const participantIds = Array.isArray(task.participantIds)
      ? task.participantIds
      : [];

    for (const participantId of participantIds) {
      const storyPoints = Number(
        task.allocations?.[participantId]?.[planningSprintId] ?? 0
      );

      if (!Number.isFinite(storyPoints) || storyPoints <= 0) {
        continue;
      }

      coveredTaskIds.add(task.id);
      rows.push({
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description,
        taskDod: task.dod,
        participantId,
        participantName:
          participantMap.get(participantId)?.fullName || participantId,
        storyPoints,
      });
    }
  }

  const skippedTasks = tasks.filter((task) => !coveredTaskIds.has(task.id));

  return { rows, skippedTasks };
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
  const [step, setStep] = React.useState(0);
  const [planningSprintId, setPlanningSprintId] = React.useState("");
  const [jiraSprintId, setJiraSprintId] = React.useState("");
  const [projectValue, setProjectValue] = React.useState("");
  const [labelsInput, setLabelsInput] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [createdIssues, setCreatedIssues] = React.useState<JiraDraftIssue[]>([]);
  const [skippedTasks, setSkippedTasks] = React.useState<BacklogItem[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setStep(0);
    setFormError("");
    setCreatedIssues([]);
    setSkippedTasks([]);
    setPlanningSprintId((prev) => prev || sprints[0]?.id || "");
    setJiraSprintId((prev) => prev || "");
    setProjectValue((prev) => prev || "");
    setLabelsInput((prev) => prev || "");
  }, [open, sprints]);

  const selectedPlanningSprint = React.useMemo(
    () => sprints.find((sprint) => sprint.id === planningSprintId) ?? null,
    [planningSprintId, sprints]
  );

  const preview = React.useMemo(
    () => buildPreviewRows(tasks, planningSprintId, participantMap),
    [participantMap, planningSprintId, tasks]
  );

  const handleClose = React.useCallback(() => {
    onClose();
  }, [onClose]);

  const handleFinish = React.useCallback(() => {
    onClearTasks();
    onClose();
  }, [onClearTasks, onClose]);

  const handleContinue = React.useCallback(() => {
    if (step === 0) {
      setStep(1);
      return;
    }

    if (!planningSprintId || !jiraSprintId.trim() || !projectValue.trim()) {
      setFormError("Заполните все обязательные поля");
      return;
    }

    if (!selectedPlanningSprint) {
      setFormError("Не удалось определить параметры экспорта");
      return;
    }

    if (preview.rows.length === 0) {
      setFormError(
        "В выбранном спринте сервиса планирования нет нагрузки по выбранным задачам"
      );
      return;
    }

    const planningSprintName = planningSprintLabel(selectedPlanningSprint);
    const normalizedLabels = parseLabels(labelsInput);
    const issues = preview.rows.map((row, index) => ({
      issueKey: `JIRA-STUB-${String(index + 1).padStart(3, "0")}`,
      taskId: row.taskId,
      taskTitle: row.taskTitle,
      participantId: row.participantId,
      participantName: row.participantName,
      description: buildIssueDescription(row.taskDescription, row.taskDod),
      labels: normalizedLabels,
      storyPoints: row.storyPoints,
      projectValue: projectValue.trim(),
      issueTypeId: JIRA_ISSUE_TYPE_ID,
      issueTypeName: JIRA_ISSUE_TYPE_NAME,
      summary: row.taskTitle || "Без названия",
      jiraSprintId: jiraSprintId.trim(),
      planningSprintId,
      planningSprintName,
    }));

    setCreatedIssues(issues);
    setSkippedTasks(preview.skippedTasks);
    setFormError("");
    setStep(2);
  }, [
    jiraSprintId,
    labelsInput,
    planningSprintId,
    projectValue,
    preview.rows,
    preview.skippedTasks,
    selectedPlanningSprint,
    step,
  ]);

  const title =
    step === 0
      ? "Корзина Jira"
      : step === 1
      ? "Параметры заведения задач в Jira"
      : "Результат заведения задач в Jira";

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {step === 0 && (
          <Stack spacing={2}>
            <Alert severity="info">
              Выбрано задач: {tasks.length}. На следующем шаге нужно будет
              выбрать только пользовательские параметры экспорта в Jira.
            </Alert>

            {!tasks.length ? (
              <Alert severity="warning">Корзина Jira пока пуста</Alert>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Задача</TableCell>
                      <TableCell>Стримы</TableCell>
                      <TableCell>Участники</TableCell>
                      <TableCell sx={{ width: 80 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>{task.title || "Без названия"}</TableCell>
                        <TableCell>
                          {task.streams?.length ? task.streams.join(", ") : "—"}
                        </TableCell>
                        <TableCell>{task.participantIds?.length ?? 0}</TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={() => onRemoveTask(task.id)}
                            title="Убрать из корзины"
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        )}

        {step === 1 && (
          <Stack spacing={2}>
            <Alert severity="info">
              Пользователь заполняет только `project`, `sprint` и при
              необходимости `labels`. Остальные поля будут заполнены
              автоматически из данных задачи.
            </Alert>

            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              alignItems="flex-start"
            >
              <TextField
                select
                fullWidth
                size="small"
                label="Спринт сервиса планирования"
                value={planningSprintId}
                onChange={(e) => setPlanningSprintId(String(e.target.value))}
              >
                {sprints.map((sprint) => (
                  <MenuItem key={sprint.id} value={sprint.id}>
                    {planningSprintLabel(sprint)}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                fullWidth
                size="small"
                label="Jira project (id или key)"
                value={projectValue}
                onChange={(e) => setProjectValue(e.target.value)}
                helperText="Это поле пользователь задает вручную."
              />

              <TextField
                fullWidth
                size="small"
                label="Jira sprint id"
                value={jiraSprintId}
                onChange={(e) => setJiraSprintId(String(e.target.value))}
                helperText="Для первой версии sprint передаем сразу в POST /issue."
              />
            </Stack>

            <TextField
              fullWidth
              size="small"
              label="Labels"
              value={labelsInput}
              onChange={(e) => setLabelsInput(e.target.value)}
              helperText="Опционально. Несколько labels указываются через запятую."
            />

            {formError && <Alert severity="error">{formError}</Alert>}

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Typography fontWeight={700}>Предпросмотр</Typography>
                <Typography variant="body2" color="text.secondary">
                  Пользователь заполняет: project, sprint, labels.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Автоматически заполняются: issueType = 3, summary = название
                  задачи, description = описание + DoD, assignee = участник
                  задачи, story points = нагрузка по выбранному спринту.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Будет создано Jira-задач: {preview.rows.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Задач без нагрузки в выбранном спринте: {preview.skippedTasks.length}
                </Typography>
                {selectedPlanningSprint && (
                  <Typography variant="body2" color="text.secondary">
                    Story points берутся из нагрузки по спринту{" "}
                    {planningSprintLabel(selectedPlanningSprint)}.
                  </Typography>
                )}
              </Stack>
            </Paper>
          </Stack>
        )}

        {step === 2 && (
          <Stack spacing={2}>
            <Alert severity="success">
              Stub-экспорт завершен. Создано Jira-задач: {createdIssues.length}
            </Alert>

            {skippedTasks.length > 0 && (
              <Alert severity="warning">
                Пропущено задач без нагрузки в выбранном спринте:{" "}
                {skippedTasks.map((task) => task.title || task.id).join(", ")}
              </Alert>
            )}

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Issue</TableCell>
                    <TableCell>Summary</TableCell>
                    <TableCell>Исполнитель</TableCell>
                    <TableCell>Project</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Sprint</TableCell>
                    <TableCell>Labels</TableCell>
                    <TableCell>Story points</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {createdIssues.map((issue) => (
                    <TableRow key={issue.issueKey}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {issue.issueKey}
                      </TableCell>
                      <TableCell>{issue.summary}</TableCell>
                      <TableCell>{issue.participantName}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {issue.projectValue}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {issue.issueTypeName} ({issue.issueTypeId})
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {issue.jiraSprintId}
                      </TableCell>
                      <TableCell>
                        {issue.labels.length ? issue.labels.join(", ") : "—"}
                      </TableCell>
                      <TableCell>{issue.storyPoints}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Divider />

            <Box>
              <Typography variant="body2" color="text.secondary">
                В реальной интеграции на этом шаге фронтенд вызовет backend,
                который создаст Jira issues и сохранит связи в БД.
              </Typography>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {step === 2 ? (
          <Button variant="contained" onClick={handleFinish}>
            Закрыть и очистить корзину
          </Button>
        ) : (
          <>
            <Button
              color="inherit"
              onClick={step === 0 ? handleClose : () => setStep((prev) => prev - 1)}
            >
              {step === 0 ? "Закрыть" : "Назад"}
            </Button>
            <Button
              color="inherit"
              onClick={onClearTasks}
              disabled={!tasks.length}
            >
              Очистить корзину
            </Button>
            <Button
              variant="contained"
              onClick={handleContinue}
              disabled={!tasks.length}
            >
              Далее
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
