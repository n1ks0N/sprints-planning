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
} from "@mui/material";
import { Add, Delete, ContentCopy } from "@mui/icons-material";

import {
  useGetParticipantsQuery,
  useGetQuartersQuery,
  useGetSprintsQuery,
  useGetTasksQuery,
  useAddTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useUpsertTaskAllocationMutation,
} from "../app/api";
import type {
  BacklogItem,
  Participant,
  Sprint,
  TaskPriority,
} from "../types";

function byStart(a: Sprint, b: Sprint) {
  return a.startDate.localeCompare(b.startDate);
}
function toFixedSafe(n: number) {
  return Number.isFinite(n) ? Number(n.toFixed(0)) : 0;
}

/** Инлайн-редактор текста */
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
        <Typography component="span">{toFixedSafe(value)}</Typography>
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

/** allocations[taskId][participantId][sprintId] = days */
type Allocations = Record<string, Record<string, Record<string, number>>>;

export default function BacklogPage() {
  const { data: quarters = [] } = useGetQuartersQuery();
  const { data: participants = [] } = useGetParticipantsQuery();
  const [selectedQuarterId, setSelectedQuarterId] =
    React.useState<string>("all");

  const allSprints = useGetSprintsQuery(undefined).data ?? [];
  const sprintsInQuarter = React.useMemo(() => {
    if (selectedQuarterId === "all") {
      return [...allSprints].sort(byStart);
    }
    return allSprints
      .filter((s) => s.quarterId === selectedQuarterId)
      .sort(byStart);
  }, [allSprints, selectedQuarterId]);

  const { data: tasks = [] } = useGetTasksQuery(
    selectedQuarterId === "all" ? undefined : { quarterId: selectedQuarterId }
  );

  const [addTask] = useAddTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [upsertTaskAllocation] = useUpsertTaskAllocationMutation();

  const [allocations, setAllocations] = React.useState<Allocations>({});

  // Инициализируем локальные allocations из задачи.
  React.useEffect(() => {
    setAllocations(() => {
      const next: Allocations = {};
      for (const t of tasks) {
        next[t.id] = {};
        const pids = t.participantIds || [];
        const totalLoads = t.loads || {};
        // если есть allocations — используем их
        if (t.allocations && Object.keys(t.allocations).length) {
          for (const pid of pids) {
            next[t.id][pid] = {};
            for (const s of allSprints) {
              const v = t.allocations?.[pid]?.[s.id] ?? 0;
              next[t.id][pid][s.id] = Number(v) || 0;
            }
          }
        } else {
          // иначе делим суммарную нагрузку по спринту поровну между участниками
          for (const pid of pids) {
            next[t.id][pid] = {};
          }
          for (const s of allSprints) {
            const sum = Number(totalLoads[s.id] || 0);
            const share =
              pids.length > 0 ? Math.floor(sum / pids.length) : 0;
            for (const pid of pids) {
              next[t.id][pid][s.id] = share;
            }
          }
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const addParticipantToTask = (task: BacklogItem, pid: string) => {
    if (!pid) return;
    if (task.participantIds?.includes(pid)) return;
    updateTask({ id: task.id, participantIds: [...task.participantIds, pid] });
    setAllocations((prev) => {
      const copy = { ...prev };
      if (!copy[task.id]) copy[task.id] = {};
      copy[task.id] = { ...copy[task.id], [pid]: {} };
      for (const s of allSprints) {
        copy[task.id][pid][s.id] = 0;
      }
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
    updateTask({
      id: task.id,
      participantIds: task.participantIds.filter((x) => x !== pid),
    });
  };

  const copyRow = (
    taskId: string,
    fromPid: string,
    toPid?: string,
    sprintScope?: string[]
  ) => {
    const scope =
      sprintScope && sprintScope.length
        ? sprintScope
        : sprintsInQuarter.map((s) => s.id);
    setAllocations((prev) => {
      const copy = { ...prev };
      const rows = { ...(copy[taskId] || {}) };
      const src = rows[fromPid] || {};
      if (toPid) {
        const dst = { ...(rows[toPid] || {}) };
        for (const sid of scope) dst[sid] = src[sid] ?? 0;
        rows[toPid] = dst;
      } else {
        for (const pid of Object.keys(rows)) {
          if (pid === fromPid) continue;
          const dst = { ...(rows[pid] || {}) };
          for (const sid of scope) dst[sid] = src[sid] ?? 0;
          rows[pid] = dst;
        }
      }
      copy[taskId] = rows;
      return copy;
    });
  };

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
        days: toFixedSafe(Number(v) || 0),
      }).unwrap();
    } catch (e) {
      console.error("Failed to save allocation", e);
    }
  };

  const renderTaskTable = (task: BacklogItem) => {
    const rows = allocations[task.id] || {};
    const participantRows: Participant[] = task.participantIds
      .map((id) => participants.find((p) => p.id === id))
      .filter(Boolean) as Participant[];

    const sumBySprint: Record<string, number> = {};
    for (const s of sprintsInQuarter) {
      sumBySprint[s.id] = Object.values(rows).reduce(
        (a, r) => a + toFixedSafe(Number(r[s.id] || 0)),
        0
      );
    }

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
          <Box sx={{ flex: 1, minWidth: 260 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              <EditableText
                value={task.title}
                onChange={(v) => updateTask({ id: task.id, title: v })}
                placeholder="Название"
              />
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              DOD:{" "}
              <EditableText
                value={task.dod || ""}
                onChange={(v) => updateTask({ id: task.id, dod: v })}
                placeholder="Definition of Done"
              />
            </Typography>
          </Box>

          <Stack direction="row" spacing={2} alignItems="center">
            <Box>
              <Typography variant="caption" color="text.secondary">
                Приоритет
              </Typography>
              <Select
                size="small"
                value={task.priority}
                onChange={(e) =>
                  updateTask({
                    id: task.id,
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

            <Box>
              <Typography variant="caption" color="text.secondary">
                Заказчик
              </Typography>
              <EditableText
                value={task.customer || ""}
                onChange={(v) => updateTask({ id: task.id, customer: v })}
                placeholder="—"
                sx={{ ml: 1 }}
              />
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Стрим
              </Typography>
              <EditableText
                value={task.stream || ""}
                onChange={(v) => updateTask({ id: task.id, stream: v })}
                placeholder="isu2.0 / sm&analytics / ..."
                sx={{ ml: 1 }}
              />
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Релиз (дата)
              </Typography>
              <EditableText
                value={task.releaseDate || ""}
                onChange={(v) => updateTask({ id: task.id, releaseDate: v })}
                placeholder="YYYY-MM-DD"
                sx={{ ml: 1 }}
              />
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Релиз (спринт)
              </Typography>
              <Select
                size="small"
                value={task.releaseSprintId || ""}
                onChange={(e) =>
                  updateTask({
                    id: task.id,
                    releaseSprintId: String(e.target.value),
                  })
                }
                sx={{ ml: 1, minWidth: 120 }}
              >
                <MenuItem value="">
                  <em>—</em>
                </MenuItem>
                {allSprints.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name} ({s.startDate} → {s.endDate})
                  </MenuItem>
                ))}
              </Select>
            </Box>

            <Tooltip title="Удалить задачу">
              <IconButton
                size="small"
                onClick={() => deleteTask({ id: task.id })}
              >
                <Delete />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {/* Таблица участники × спринты */}
        <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 220 }}>Участник</TableCell>
                {sprintsInQuarter.map((s) => (
                  <TableCell key={s.id} align="center">
                    <Stack spacing={0} alignItems="center">
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {s.startDate} → {s.endDate}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {s.name}
                      </Typography>
                    </Stack>
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ minWidth: 100 }}>
                  Итого
                </TableCell>
                <TableCell align="right" sx={{ width: 140 }}>
                  Действия
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {participantRows.map((p) => {
                const row = rows[p.id] || {};
                const rowSum = sprintsInQuarter.reduce(
                  (acc, s) => acc + toFixedSafe(Number(row[s.id] || 0)),
                  0
                );
                return (
                  <TableRow key={p.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={p.role} size="small" />
                        <Typography>{p.fullName}</Typography>
                      </Stack>
                    </TableCell>
                    {sprintsInQuarter.map((s) => (
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
                      {toFixedSafe(rowSum)}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Скопировать в остальные строки">
                        <IconButton
                          size="small"
                          onClick={() => copyRow(task.id, p.id)}
                        >
                          <ContentCopy fontSize="small" />
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
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Добавление участника */}
              <TableRow>
                <TableCell colSpan={sprintsInQuarter.length + 2}>
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
                <TableCell sx={{ fontWeight: 700 }}>
                  Итого по спринтам
                </TableCell>
                {sprintsInQuarter.map((s) => (
                  <TableCell key={s.id} align="center" sx={{ fontWeight: 700 }}>
                    {toFixedSafe(sumBySprint[s.id])}
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ fontWeight: 700 }}>
                  {toFixedSafe(
                    Object.values(sumBySprint).reduce((a, b) => a + b, 0)
                  )}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  };

  const createTask = async () => {
    const created = await addTask({
      title: "Новая задача",
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

  return (
    <Paper elevation={0} sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Бэклог
      </Typography>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Box sx={{ minWidth: 260 }}>
          <Typography variant="caption" color="text.secondary">
            Квартал
          </Typography>
          <Select
            size="small"
            value={selectedQuarterId}
            onChange={(e) => setSelectedQuarterId(String(e.target.value))}
            sx={{ ml: 1, minWidth: 220 }}
          >
            <MenuItem value="all">Все кварталы</MenuItem>
            {quarters.map((q) => (
              <MenuItem key={q.id} value={q.id}>
                {q.name} ({q.startDate} → {q.endDate})
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={createTask}
          sx={{ ml: { md: "auto" } }}
        >
          Добавить задачу
        </Button>
      </Stack>

      <Stack spacing={2}>
        {tasks.map((t) => renderTaskTable(t))}
        {!tasks.length && (
          <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">
              Нет задач под выбранный фильтр
            </Typography>
          </Paper>
        )}
      </Stack>

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary">
        Все поля редактируются по клику. Нагрузка задаётся в ячейках «участник ×
        спринт»; в систему сохраняется распределение, а сумма по спринту
        влияет на Capacity.
      </Typography>
    </Paper>
  );
}
