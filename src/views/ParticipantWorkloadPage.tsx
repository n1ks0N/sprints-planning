import * as React from "react";
import {
  Paper,
  Typography,
  Stack,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Tooltip,
} from "@mui/material";
import {
  useGetParticipantsQuery,
  useGetQuartersQuery,
  useGetSprintsQuery,
  useGetCapacityQuery,
  useGetTasksQuery,
  useUpsertTaskAllocationMutation,
} from "../app/api";
import EditableNumberCell from "../components/EditableNumberCell";
import type {
  Sprint,
  BacklogItem,
  Allocations,
  CapacityCell,
} from "../types";
import { setParticipantWorkloadFilters } from "../app/uiSlice";
import FiltersPanel from "../components/filters/FiltersPanel";
import { useAppDispatch, useAppSelector } from "./hooks";
import { selectCurrentTeamKey } from "../app/teamSlice";

function byStart(a: Sprint, b: Sprint) {
  return a.startDate.localeCompare(b.startDate);
}
const toInt = (n: any) =>
  Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0;

const round1 = (v: number) => Math.round(v * 10) / 10;

function cellColor(
  workload: number,
  available: number,
  capacityFactor: number
): string {
  if (available === 0) {
    return workload > 0 ? "#ffebee" : "#e8f5e9";
  }
  const low = capacityFactor * available;
  const high = (2 - capacityFactor) * available;
  if (workload < low) return "#fff3e0";
  if (workload > high) return "#ffebee";
  return "#e8f5e9";
}

function shallowArrayEqual<T>(a: readonly T[], b: readonly T[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export default function ParticipantWorkloadPage() {
  const dispatch = useAppDispatch();
  const currentTeamKey = useAppSelector(selectCurrentTeamKey);
  const ui = useAppSelector((s) => s.ui.participantWorkload);
  const [upsertTaskAllocation] = useUpsertTaskAllocationMutation();
  const [allocations, setAllocations] = React.useState<Allocations>({});

  const { data: quarters = [] } = useGetQuartersQuery();
  const { data: participants = [] } = useGetParticipantsQuery();
  const { data: sprintsData = [] } = useGetSprintsQuery(undefined);
  const allSprints = sprintsData;
  const { data: tasksPage } = useGetTasksQuery({
    quarterIds: ui.selectedQuarterIds,
    participantIds: ui.selectedParticipantIds,
    roles: ui.rolesFilter,
    userStreams: ui.userStreamsFilter,
    priority: ui.priorityFilter,
    stream: ui.taskStreamFilter,
  });
  const tasks: BacklogItem[] = tasksPage?.content ?? [];

  const sprintsInScope = React.useMemo(() => {
    const selected = new Set(ui.selectedQuarterIds);
    const list =
      selected.size === 0
        ? [...allSprints]
        : allSprints.filter((s) => selected.has(s.quarterId));
    return list.sort(byStart);
  }, [allSprints, ui.selectedQuarterIds]);

  const participantOptions = React.useMemo(
    () =>
      participants.map((p) => ({
        value: p.id,
        label: `${p.fullName}${p.role ? ` (${p.role})` : ""}`,
      })),
    [participants]
  );

  const quarterOptions = React.useMemo(
    () =>
      quarters
        .slice()
        .sort((a, b) => a.endDate.localeCompare(b.endDate))
        .map((q) => ({
          value: q.id,
          label: `${q.name} (${q.startDate} → ${q.endDate})`,
        })),
    [quarters]
  );

  const priorityOptions = React.useMemo(
    () => [1, 2, 3].map((p) => ({ value: String(p), label: String(p) })),
    []
  );

  const roleOptions = React.useMemo(() => {
    const roles = participants
      .map((p) => p.role)
      .filter((role): role is string => Boolean(role && role.trim()));
    return Array.from(new Set(roles)).sort();
  }, [participants]);

  const userStreamOptions = React.useMemo(() => {
    const streams = participants
      .flatMap((p) => p.userStreams || [])
      .filter((stream): stream is string => Boolean(stream && stream.trim()));
    return Array.from(new Set(streams)).sort();
  }, [participants]);

  const taskStreamOptions = React.useMemo(() => {
    const streams = tasks
      .map((t) => t.stream)
      .filter((stream): stream is string => Boolean(stream && stream.trim()));
    return Array.from(new Set(streams)).sort();
  }, [tasks]);

  const handleTaskStreamFilterChange = React.useCallback(
    (value: string) => {
      const next = value.trim();
      if (next === ui.taskStreamFilter) return;
      dispatch(setParticipantWorkloadFilters({ taskStreamFilter: next }));
    },
    [dispatch, ui.taskStreamFilter]
  );

  const handleRolesFilterChange = React.useCallback(
    (values: string[]) => {
      if (shallowArrayEqual(values, ui.rolesFilter)) return;
      dispatch(setParticipantWorkloadFilters({ rolesFilter: values }));
    },
    [dispatch, ui.rolesFilter]
  );

  const handleUserStreamsFilterChange = React.useCallback(
    (values: string[]) => {
      if (shallowArrayEqual(values, ui.userStreamsFilter)) return;
      dispatch(setParticipantWorkloadFilters({ userStreamsFilter: values }));
    },
    [dispatch, ui.userStreamsFilter]
  );

  const handlePriorityFilterChange = React.useCallback(
    (values: string[]) => {
      const next = values
        .map(Number)
        .filter((n): n is number => [1, 2, 3].includes(n));
      if (shallowArrayEqual(next, ui.priorityFilter)) return;
      dispatch(
        setParticipantWorkloadFilters({
          priorityFilter: next.length ? next : [1, 2, 3],
        })
      );
    },
    [dispatch, ui.priorityFilter]
  );

  const selectedParticipants = React.useMemo(
    () => participants.filter((p) => ui.selectedParticipantIds.includes(p.id)),
    [participants, ui.selectedParticipantIds]
  );

  const participantsInScope = React.useMemo(() => {
    let list = selectedParticipants.length ? selectedParticipants : participants;
    if (ui.rolesFilter.length) {
      const rset = new Set(ui.rolesFilter);
      list = list.filter((p) => rset.has(p.role));
    }
    if (ui.userStreamsFilter.length) {
      const streamSet = new Set(ui.userStreamsFilter.map((s) => s.trim()));
      list = list.filter((p) =>
        (p.userStreams || []).some((stream) => streamSet.has(stream.trim()))
      );
    }
    return list;
  }, [
    participants,
    selectedParticipants,
    ui.rolesFilter,
    ui.userStreamsFilter,
  ]);

  const capacityParticipantIds = React.useMemo(
    () => participantsInScope.map((p) => p.id),
    [participantsInScope]
  );

  const { data: capacityRows = [] } = useGetCapacityQuery({
    quarterIds: ui.selectedQuarterIds.length ? ui.selectedQuarterIds : undefined,
    participantIds: capacityParticipantIds.length
      ? capacityParticipantIds
      : undefined,
    roles: ui.rolesFilter.length ? ui.rolesFilter : undefined,
    userStreams: ui.userStreamsFilter.length ? ui.userStreamsFilter : undefined,
  });

  const capacityCellMap = React.useMemo(() => {
    const map = new Map<string, CapacityCell>();
    capacityRows.forEach((row) => {
      row.cells.forEach((cell) => {
        map.set(`${row.participant.id}|${cell.sprintId}`, cell);
      });
    });
    return map;
  }, [capacityRows]);

  const getCapacityCell = React.useCallback(
    (pid: string, sid: string) => capacityCellMap.get(`${pid}|${sid}`),
    [capacityCellMap]
  );

  const buildBacklogHref = React.useCallback(
    (taskId: string) => {
      const encodedId = encodeURIComponent(taskId);
      if (typeof window === "undefined") {
        return `#/${currentTeamKey}/?pinnedTaskId=${encodedId}`;
      }
      const base = window.location.href.split("#")[0];
      return `${base}#/${currentTeamKey}/?pinnedTaskId=${encodedId}`;
    },
    [currentTeamKey]
  );

  React.useEffect(() => {
    setAllocations((prev) => {
      const next: Allocations = { ...prev };
      let changed = false;
      const taskIdSet = new Set(tasks.map((t) => t.id));

      Object.keys(next).forEach((taskId) => {
        if (!taskIdSet.has(taskId)) {
          delete next[taskId];
          changed = true;
        }
      });

      for (const t of tasks) {
        if (!next[t.id]) {
          next[t.id] = {};
          changed = true;
        }
        const taskAllocations = next[t.id];
        const pids = t.participantIds || [];

        Object.keys(taskAllocations).forEach((pid) => {
          if (!pids.includes(pid)) {
            delete taskAllocations[pid];
            changed = true;
          }
        });

        for (const pid of pids) {
          if (!taskAllocations[pid]) {
            taskAllocations[pid] = {};
            changed = true;
          }
          const participantAllocations = taskAllocations[pid];
          for (const s of sprintsInScope) {
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
  }, [tasks, sprintsInScope]);

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
        days: toInt(Number(value) || 0),
      })
        .unwrap()
        .catch((error) => {
          console.error("Failed to save allocation", error);
        });
    },
    [upsertTaskAllocation]
  );

  const getRowsForParticipant = (pid: string) => {
    const rows = tasks
      .filter(
        (t) =>
          t.participantIds.includes(pid) &&
          ui.priorityFilter.includes(t.priority)
      )
      .map((t) => ({
        task: t,
        perSprint: sprintsInScope.map((s) =>
          toInt(
            allocations[t.id]?.[pid]?.[s.id] ??
              t.allocations?.[pid]?.[s.id] ??
              0
          )
        ),
      }));
    return rows as { task: BacklogItem; perSprint: number[] }[];
  };

  return (
    <Paper elevation={0} sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Нагрузка по участникам
      </Typography>

      <FiltersPanel
        withPaper={false}
        containerSx={{ mb: 2 }}
        gridSx={{
          gridTemplateColumns: {
            xs: "repeat(auto-fit, minmax(260px, 1fr))",
            md: "repeat(auto-fit, minmax(240px, 1fr))",
          },
          alignItems: "start",
        }}
        filters={[
          {
            type: "autocomplete",
            key: "quarters",
            minWidth: 200,
            props: {
              multiple: true,
              allowCustom: false,
              label: "Фильтр по кварталам",
              options: quarterOptions,
              value: ui.selectedQuarterIds,
              onChange: (ids) =>
                dispatch(
                  setParticipantWorkloadFilters({
                    selectedQuarterIds: ids,
                  })
                ),
            },
          },
          {
            type: "autocomplete",
            key: "participants",
            minWidth: 260,
            props: {
              multiple: true,
              allowCustom: false,
              label: "Фильтр по ФИО",
              options: participantOptions,
              value: ui.selectedParticipantIds,
              onChange: (ids) =>
                dispatch(
                  setParticipantWorkloadFilters({
                    selectedParticipantIds: ids,
                  })
                ),
            },
          },
          {
            type: "autocomplete",
            key: "roles",
            minWidth: 200,
            props: {
              multiple: true,
              allowCustom: false,
              label: "Роли",
              options: roleOptions,
              value: ui.rolesFilter,
              onChange: handleRolesFilterChange,
            },
          },
          {
            type: "autocomplete",
            key: "streams",
            minWidth: 200,
            props: {
              multiple: true,
              allowCustom: false,
              label: "Стрим по участнику",
              options: userStreamOptions,
              value: ui.userStreamsFilter,
              onChange: handleUserStreamsFilterChange,
            },
          },
          {
            type: "autocomplete",
            key: "task-stream",
            minWidth: 200,
            props: {
              allowCustom: false,
              label: "Стрим по задаче",
              options: taskStreamOptions,
              value: ui.taskStreamFilter,
              onChange: handleTaskStreamFilterChange,
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
              value: ui.priorityFilter.map(String),
              onChange: handlePriorityFilterChange,
            },
          },
        ]}
      />

      <Stack spacing={2}>
        {participantsInScope.map((p) => {
          const rows = getRowsForParticipant(p.id);
          const totalsBySprint = sprintsInScope.map((_, idx) =>
            rows.reduce((sum, r) => sum + r.perSprint[idx], 0)
          );
          const totalWork = totalsBySprint.reduce((sum, v) => sum + v, 0);
          const totalAvailable = sprintsInScope.reduce((sum, s) => {
            const cell = getCapacityCell(p.id, s.id);
            return sum + (cell?.availableDays ?? 0);
          }, 0);

          return (
            <Paper key={p.id} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 1 }}
              >
                <Chip label={p.role} size="small" />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {p.fullName}
                </Typography>
              </Stack>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell
                        sx={{ minWidth: 260, maxWidth: 360, width: 360 }}
                      >
                        Задача
                      </TableCell>
                      {sprintsInScope.map((s) => (
                        <TableCell key={s.id} align="center">
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 700 }}
                          >
                            {s.startDate} → {s.endDate}
                          </Typography>
                          <br />
                          <Typography variant="caption" color="text.secondary">
                            {s.name}
                          </Typography>
                        </TableCell>
                      ))}
                      <TableCell align="center" sx={{ fontWeight: 700 }}>
                        Итого
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r) => {
                      const total = r.perSprint.reduce((a, b) => a + b, 0);
                      const isLeader = r.task.leaderId === p.id;
                      const backlogHref = buildBacklogHref(r.task.id);
                      return (
                        <TableRow key={`${p.id}-${r.task.id}`}>
                          <TableCell
                            sx={{
                              bgcolor: isLeader ? "warning.light" : undefined,
                            }}
                          >
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                            >
                              <Chip
                                size="small"
                                label={r.task.priority}
                                color="default"
                                sx={{
                                  bgcolor: "grey.200",
                                  color: "text.primary",
                                  borderColor: "grey.300",
                                }}
                              />
                              <Tooltip
                                title={r.task.title}
                                placement="top"
                                arrow
                              >
                                <Typography
                                  component="a"
                                  href={backlogHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  sx={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                    wordBreak: "break-word",
                                    maxWidth: 300,
                                    color: "inherit",
                                    textDecoration: "none",
                                    "&:hover": {
                                      textDecoration: "none",
                                    },
                                  }}
                                >
                                  {r.task.title}
                                </Typography>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                          {sprintsInScope.map((s, i) => {
                            const v = r.perSprint[i] ?? 0;
                            return (
                              <TableCell
                                key={`${p.id}-${r.task.id}-${s.id}`}
                                align="center"
                              >
                                <EditableNumberCell
                                  value={v}
                                  onChange={(next) =>
                                    handleAllocChange(
                                      r.task.id,
                                      p.id,
                                      s.id,
                                      next
                                    )
                                  }
                                  onCommit={(next) =>
                                    commitCell(r.task.id, p.id, s.id, next)
                                  }
                                  title={`${r.task.title} / ${s.name}`}
                                />
                              </TableCell>
                            );
                          })}
                          <TableCell align="center" sx={{ fontWeight: 700 }}>
                            {total}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {rows.length > 0 && (
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>
                          Итого по спринтам
                        </TableCell>
                        {totalsBySprint.map((v, i) => {
                          const sprint = sprintsInScope[i];
                          const cell = sprint
                            ? getCapacityCell(p.id, sprint.id)
                            : undefined;
                          const availRaw = cell?.availableDays ?? 0;
                          const capacityFactor = cell?.capacityFactor ?? 0.85;
                          const bg = cellColor(v, availRaw, capacityFactor);
                          const work = round1(v);
                          const avail = round1(availRaw);
                          return (
                            <TableCell
                              key={sprint?.id ?? i}
                              align="center"
                              sx={{
                                fontWeight: 700,
                                backgroundColor: bg,
                              }}
                              title={`Нагрузка: ${work.toFixed(
                                1
                              )} дн • Доступно: ${avail.toFixed(1)} дн`}
                            >
                              {work.toFixed(1)} / {avail.toFixed(1)}
                            </TableCell>
                          );
                        })}
                        <TableCell align="center" sx={{ fontWeight: 700 }}>
                          {round1(totalWork).toFixed(1)} /{" "}
                          {round1(totalAvailable).toFixed(1)}
                        </TableCell>
                      </TableRow>
                    )}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={sprintsInScope.length + 2}
                          align="center"
                          sx={{ color: "text.secondary" }}
                        >
                          Нет задач по выбранным фильтрам
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          );
        })}

        {!participantsInScope.length && (
          <Typography sx={{ color: "text.secondary" }}>
            Нет участников по выбранным фильтрам
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
