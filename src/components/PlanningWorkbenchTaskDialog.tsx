import * as React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Close } from "@mui/icons-material";
import FilterAutocomplete, {
  type FilterOption,
} from "./filters/FilterAutocomplete";
import type {
  Participant,
  PlanningDemand,
  PlanningDemandKind,
  PlanningWorkbenchItem,
  Quarter,
  Release,
  Sprint,
  TaskPriority,
} from "../types";
import {
  DAY_AMOUNT_STEP,
  formatDayAmount,
  normalizeDayAmount,
  sanitizeDayAmountInput,
} from "../utils/dayAmount";

type DemandRow = {
  id: string;
  kind: PlanningDemandKind;
  role: string;
  participantId: string;
  stream: string;
  days: string;
};

export type PlanningWorkbenchTaskSubmitPayload = {
  title: string;
  description?: string;
  dod?: string;
  priority: TaskPriority;
  customers: string[];
  streams: string[];
  planningDemands: PlanningDemand[];
  releaseDateId?: string | null;
  initialQuarterId?: string | null;
  planningQuarterIds?: string[];
  planningSprintIds?: string[];
};

type Props = {
  open: boolean;
  teamKey: string;
  task?: PlanningWorkbenchItem | null;
  participants: Participant[];
  quarters: Quarter[];
  sprints: Sprint[];
  releases: Release[];
  customerOptions: string[];
  taskStreamOptions: string[];
  participantRoleOptions: string[];
  participantStreamOptions: string[];
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (
    payload: PlanningWorkbenchTaskSubmitPayload,
  ) => Promise<void> | void;
};

type FormState = {
  title: string;
  description: string;
  dod: string;
  priority: TaskPriority;
  customers: string[];
  streams: string[];
  releaseDateId: string;
  initialQuarterId: string;
  planningQuarterIds: string[];
  planningSprintIds: string[];
  planningDemands: DemandRow[];
};

const makeDemandId = () => `demand-${Math.random().toString(36).slice(2, 10)}`;
const STORAGE_KEY_PREFIX = "planning-workbench-initial-quarter";

const storageKey = (teamKey: string) =>
  `${STORAGE_KEY_PREFIX}:${teamKey.toLowerCase()}`;
const formatDate = (value?: string | null) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
};

const readStoredQuarterId = (teamKey: string, quarters: Quarter[]) => {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem(storageKey(teamKey))?.trim();
  if (!stored) return "";
  return quarters.some((quarter) => quarter.id === stored) ? stored : "";
};

const resolveCurrentQuarterId = (quarters: Quarter[]) => {
  const today = new Date().toISOString().slice(0, 10);
  const current = quarters.find(
    (quarter) => quarter.startDate <= today && quarter.endDate >= today,
  );
  if (current) return current.id;
  const future = [...quarters].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  return future[0]?.id ?? "";
};

const createDemandRow = (seed?: Partial<DemandRow>): DemandRow => ({
  id: makeDemandId(),
  kind: seed?.kind ?? "ROLE",
  role: seed?.role ?? "",
  participantId: seed?.participantId ?? "",
  stream: seed?.stream ?? "",
  days: seed?.days != null ? String(seed.days) : "",
});

const fallbackDemands = (
  task?: PlanningWorkbenchItem | null,
): PlanningDemand[] => {
  if (!task) {
    return [];
  }
  if (task.planningDemands?.length) {
    return task.planningDemands;
  }
  return [];
};

const normalizeTask = (
  task: PlanningWorkbenchItem | null | undefined,
  defaultQuarterId: string,
): FormState => {
  const demands = fallbackDemands(task).map((demand) =>
    createDemandRow({
      kind: demand.kind,
      role: demand.role ?? "",
      participantId: demand.participantId ?? "",
      stream: demand.stream ?? "",
      days: formatDayAmount(demand.days),
    }),
  );
  const initialQuarterId = task
    ? (task.initialQuarterId ?? "")
    : defaultQuarterId;
  const planningQuarterIds = task?.planningQuarterIds?.length
    ? task.planningQuarterIds
    : initialQuarterId
      ? [initialQuarterId]
      : [];
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    dod: task?.dod ?? "",
    priority: task?.priority ?? 1,
    customers: task?.customers ?? [],
    streams: task?.streams ?? [],
    releaseDateId: task?.releaseDateId ?? "",
    initialQuarterId,
    planningQuarterIds,
    planningSprintIds: task?.planningSprintIds ?? [],
    planningDemands: demands,
  };
};

const demandSubjectValue = (
  demand: Pick<DemandRow, "kind" | "role" | "participantId">,
) =>
  demand.kind === "ROLE"
    ? demand.role
      ? `role:${demand.role}`
      : ""
    : demand.participantId
      ? `participant:${demand.participantId}`
      : "";

const parseDemandSubjectValue = (value: string): Partial<DemandRow> => {
  const normalized = value.trim();
  if (!normalized) {
    return {
      kind: "ROLE",
      role: "",
      participantId: "",
    };
  }
  if (normalized.startsWith("participant:")) {
    return {
      kind: "PARTICIPANT",
      role: "",
      participantId: normalized.slice("participant:".length),
    };
  }
  return {
    kind: "ROLE",
    role: normalized.startsWith("role:")
      ? normalized.slice("role:".length)
      : normalized,
    participantId: "",
  };
};

export default function PlanningWorkbenchTaskDialog({
  open,
  teamKey,
  task,
  participants,
  quarters,
  sprints,
  releases,
  customerOptions,
  taskStreamOptions,
  participantRoleOptions,
  participantStreamOptions,
  submitting = false,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = React.useState<FormState>(
    normalizeTask(undefined, resolveCurrentQuarterId(quarters)),
  );
  const [error, setError] = React.useState("");

  const participantById = React.useMemo(
    () =>
      new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );

  const demandSubjectOptions = React.useMemo<FilterOption[]>(
    () => [
      ...participantRoleOptions.map((role) => ({
        value: `role:${role}`,
        label: `Роль: ${role}`,
      })),
      ...participants.map((participant) => ({
        value: `participant:${participant.id}`,
        label: participant.role
          ? `Участник: ${participant.fullName} (${participant.role})`
          : `Участник: ${participant.fullName}`,
      })),
    ],
    [participantRoleOptions, participants],
  );

  const priorityOptions = React.useMemo<FilterOption[]>(
    () => ["1", "2", "3"].map((value) => ({ value, label: value })),
    [],
  );

  const releaseOptions = React.useMemo<FilterOption[]>(
    () =>
      releases.map((release) => ({
        value: release.id,
        label: formatDate(release.promDate),
      })),
    [releases],
  );

  const quarterOptions = React.useMemo<FilterOption[]>(
    () =>
      quarters.map((quarter) => ({ value: quarter.id, label: quarter.name })),
    [quarters],
  );

  const sprintOptions = React.useMemo<FilterOption[]>(
    () => sprints.map((sprint) => ({ value: sprint.id, label: sprint.name })),
    [sprints],
  );

  const resolveDefaultQuarterId = React.useCallback(() => {
    const stored = readStoredQuarterId(teamKey, quarters);
    if (stored) return stored;
    return resolveCurrentQuarterId(quarters);
  }, [quarters, teamKey]);

  React.useEffect(() => {
    if (!open) return;
    setForm(normalizeTask(task, resolveDefaultQuarterId()));
    setError("");
  }, [open, resolveDefaultQuarterId, task]);

  const totalEstimateDays = React.useMemo(
    () =>
      form.planningDemands.reduce(
        (sum, demand) => sum + normalizeDayAmount(demand.days),
        0,
      ),
    [form.planningDemands],
  );

  const setInitialQuarter = React.useCallback(
    (nextQuarterId: string) => {
      if (typeof window !== "undefined") {
        if (nextQuarterId) {
          localStorage.setItem(storageKey(teamKey), nextQuarterId);
        } else {
          localStorage.removeItem(storageKey(teamKey));
        }
      }
      setForm((prev) => {
        const syncQuarterIds =
          prev.planningSprintIds.length === 0 &&
          (prev.planningQuarterIds.length === 0 ||
            (prev.planningQuarterIds.length === 1 &&
              prev.planningQuarterIds[0] === prev.initialQuarterId));
        return {
          ...prev,
          initialQuarterId: nextQuarterId,
          planningQuarterIds: syncQuarterIds
            ? nextQuarterId
              ? [nextQuarterId]
              : []
            : prev.planningQuarterIds,
        };
      });
    },
    [teamKey],
  );

  const updateDemand = (demandId: string, patch: Partial<DemandRow>) => {
    setForm((prev) => ({
      ...prev,
      planningDemands: prev.planningDemands.map((demand) =>
        demand.id === demandId ? { ...demand, ...patch } : demand,
      ),
    }));
  };

  const removeDemand = (demandId: string) => {
    setForm((prev) => ({
      ...prev,
      planningDemands: prev.planningDemands.filter(
        (demand) => demand.id !== demandId,
      ),
    }));
  };

  const addDemand = () => {
    setForm((prev) => {
      const last = prev.planningDemands[prev.planningDemands.length - 1];
      const nextRow = last
        ? createDemandRow({
            kind: last.kind,
            role: last.role,
            participantId: last.participantId,
            stream: last.stream,
            days: "",
          })
        : createDemandRow();
      return {
        ...prev,
        planningDemands: [...prev.planningDemands, nextRow],
      };
    });
  };

  const handleSubmit = async () => {
    const title = form.title.trim();
    if (!title) {
      setError("Укажите название задачи.");
      return;
    }

    const normalizedDemands = form.planningDemands.map((demand) => ({
      kind: demand.kind,
      role: demand.kind === "ROLE" ? demand.role.trim() || null : null,
      participantId:
        demand.kind === "PARTICIPANT" ? demand.participantId || null : null,
      stream: demand.stream.trim() || null,
      days: normalizeDayAmount(demand.days),
    }));

    const hasInvalidDemand = normalizedDemands.some(
      (demand) =>
        demand.days > 0 &&
        ((demand.kind === "ROLE" && !demand.role) ||
          (demand.kind === "PARTICIPANT" && !demand.participantId)),
    );
    if (hasInvalidDemand) {
      setError(
        "Для строк с положительной нагрузкой нужно выбрать роль или участника.",
      );
      return;
    }

    if (
      !form.initialQuarterId &&
      form.planningQuarterIds.length === 0 &&
      form.planningSprintIds.length === 0
    ) {
      setError(
        "Нужно указать стартовый квартал, кварталы планирования или конкретные спринты.",
      );
      return;
    }

    const planningDemands = normalizedDemands.filter(
      (demand) =>
        demand.days > 0 &&
        ((demand.kind === "ROLE" && demand.role) ||
          (demand.kind === "PARTICIPANT" && demand.participantId)),
    );

    setError("");
    await onSubmit({
      title,
      description: form.description.trim(),
      dod: form.dod.trim(),
      priority: form.priority,
      customers: form.customers,
      streams: form.streams,
      planningDemands: planningDemands as PlanningDemand[],
      releaseDateId: form.releaseDateId || null,
      initialQuarterId: form.initialQuarterId || null,
      planningQuarterIds: form.planningQuarterIds,
      planningSprintIds: form.planningSprintIds,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {task ? "Редактировать задачу" : "Новая задача для планирования"}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              label="Название"
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              fullWidth
              required
            />
            <FilterAutocomplete
              label="Приоритет"
              allowCustom={false}
              value={String(form.priority)}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  priority: (Number(value) || 1) as TaskPriority,
                }))
              }
              options={priorityOptions}
              sx={{ minWidth: { md: 180 } }}
            />
          </Stack>

          <TextField
            label="Описание"
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
            fullWidth
            multiline
            minRows={2}
          />

          <TextField
            label="DoD"
            value={form.dod}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, dod: event.target.value }))
            }
            fullWidth
            multiline
            minRows={2}
          />

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                alignItems={{ xs: "stretch", md: "center" }}
                justifyContent="space-between"
                spacing={1}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Нагрузка по ролям и участникам
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2">
                    Общая оценка: {totalEstimateDays} дн.
                  </Typography>
                  <Button size="small" startIcon={<Add />} onClick={addDemand}>
                    Добавить
                  </Button>
                </Stack>
              </Stack>

              {form.planningDemands.length === 0 ? (
                <Typography variant="body2">
                  Здесь можно оставить задачу без роли и участника. Для
                  автораспределения потом добавьте строки нагрузки.
                </Typography>
              ) : (
                <Stack spacing={1.25}>
                  {form.planningDemands.map((demand) => {
                    const baseStreamOptions =
                      demand.kind === "PARTICIPANT" && demand.participantId
                        ? (participantById.get(demand.participantId)
                            ?.userStreams ?? participantStreamOptions)
                        : participantStreamOptions;
                    const streamOptionsForDemand = Array.from(
                      new Set([
                        ...(baseStreamOptions || []),
                        ...(demand.stream ? [demand.stream] : []),
                      ]),
                    );
                    return (
                      <Stack
                        key={demand.id}
                        direction={{ xs: "column", md: "row" }}
                        spacing={1.25}
                        alignItems={{ xs: "stretch", md: "center" }}
                      >
                        <FilterAutocomplete
                          label="Роль / Участник"
                          allowCustom={false}
                          value={demandSubjectValue(demand)}
                          onChange={(value) => {
                            const nextSubject = parseDemandSubjectValue(value);
                            const nextParticipantId =
                              nextSubject.kind === "PARTICIPANT"
                                ? nextSubject.participantId || ""
                                : "";
                            const nextStream =
                              nextSubject.kind === "PARTICIPANT"
                                ? demand.stream ||
                                  participantById.get(nextParticipantId)
                                    ?.userStreams?.[0] ||
                                  ""
                                : demand.stream;
                            updateDemand(demand.id, {
                              ...nextSubject,
                              stream: nextStream,
                            });
                          }}
                          options={demandSubjectOptions}
                          sortOptions={false}
                          sx={{ flex: 1.35 }}
                        />

                        <FilterAutocomplete
                          label="Стрим по участнику"
                          value={demand.stream || ""}
                          onChange={(value) =>
                            updateDemand(demand.id, { stream: value })
                          }
                          options={streamOptionsForDemand}
                          sx={{ flex: 1 }}
                        />

                        <TextField
                          label="Дни"
                          type="text"
                          value={demand.days}
                          onChange={(event) => {
                            const normalized = sanitizeDayAmountInput(
                              event.target.value,
                            );
                            updateDemand(demand.id, { days: normalized });
                          }}
                          inputProps={{
                            min: 0,
                            step: DAY_AMOUNT_STEP,
                            inputMode: "decimal",
                            pattern: "[0-9]*[.,]?[0-9]?",
                          }}
                          sx={{ width: { xs: "100%", md: 120 } }}
                        />

                        <IconButton
                          onClick={() => removeDemand(demand.id)}
                          aria-label="Удалить строку"
                        >
                          <Close />
                        </IconButton>
                      </Stack>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <FilterAutocomplete
              multiple
              label="Заказчики"
              options={customerOptions}
              value={form.customers}
              onChange={(customers) =>
                setForm((prev) => ({
                  ...prev,
                  customers,
                }))
              }
            />
            <FilterAutocomplete
              multiple
              label="Стримы по задаче"
              options={taskStreamOptions}
              value={form.streams}
              onChange={(streams) =>
                setForm((prev) => ({
                  ...prev,
                  streams,
                }))
              }
            />
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <FilterAutocomplete
              label="Релиз"
              allowCustom={false}
              value={form.releaseDateId}
              onChange={(releaseDateId) =>
                setForm((prev) => ({ ...prev, releaseDateId }))
              }
              options={releaseOptions}
              placeholder="Без релиза"
            />
            <FilterAutocomplete
              label="Стартовый квартал"
              allowCustom={false}
              value={form.initialQuarterId}
              onChange={setInitialQuarter}
              options={quarterOptions}
              placeholder="Не задан"
            />
          </Stack>

          <FilterAutocomplete
            multiple
            allowCustom={false}
            label="Кварталы планирования"
            options={quarterOptions}
            value={form.planningQuarterIds}
            onChange={(planningQuarterIds) =>
              setForm((prev) => ({
                ...prev,
                planningQuarterIds,
              }))
            }
          />

          <FilterAutocomplete
            multiple
            allowCustom={false}
            label="Спринты планирования"
            options={sprintOptions}
            value={form.planningSprintIds}
            onChange={(planningSprintIds) =>
              setForm((prev) => ({
                ...prev,
                planningSprintIds,
              }))
            }
          />

          {error && <Typography color="error">{error}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting}
        >
          {submitting ? "Сохраняем..." : "Сохранить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
