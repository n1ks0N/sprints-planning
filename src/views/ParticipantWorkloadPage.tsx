import * as React from "react";
import { skipToken } from "@reduxjs/toolkit/query";
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
  TablePagination,
} from "@mui/material";
import {
  useGetParticipantsQuery,
  useGetQuartersQuery,
  useGetSprintsQuery,
  useGetCapacityQuery,
  useGetFiltersQuery,
  useGetParticipantWorkloadQuery,
  useUpsertTaskAllocationMutation,
} from "../app/api";
import EditableNumberCell from "../components/EditableNumberCell";
import type {
  Sprint,
  Quarter,
  ParticipantWorkloadRow,
  ParticipantWorkloadTask,
  Allocations,
  CapacityCell,
} from "../types";
import { setParticipantWorkloadFilters } from "../app/uiSlice";
import FiltersPanel from "../components/filters/FiltersPanel";
import { useAppDispatch, useAppSelector } from "./hooks";
import { selectCurrentTeamKey } from "../app/teamSlice";
import { normalizeDayAmount } from "../utils/dayAmount";

function byStart(a: Sprint, b: Sprint) {
  return a.startDate.localeCompare(b.startDate);
}

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

function getCurrentQuarterId(quarters: Quarter[]) {
  const today = new Date().toISOString().slice(0, 10);
  return quarters.find((quarter) => quarter.startDate <= today && today <= quarter.endDate)?.id || "";
}

export default function ParticipantWorkloadPage() {
  const dispatch = useAppDispatch();
  const currentTeamKey = useAppSelector(selectCurrentTeamKey);
  const ui = useAppSelector((s) => s.ui.participantWorkload);
  const [upsertTaskAllocation] = useUpsertTaskAllocationMutation();
  const [allocations, setAllocations] = React.useState<Allocations>({});
  const [participantPageNumber, setParticipantPageNumber] = React.useState(0);
  const [participantPageSize, setParticipantPageSize] = React.useState(10);

  const { data: quarters = [] } = useGetQuartersQuery();
  const { data: participants = [] } = useGetParticipantsQuery();
  const { data: sprintsData = [] } = useGetSprintsQuery(undefined);
  const { data: filtersData } = useGetFiltersQuery();
  const allSprints = sprintsData;

  React.useEffect(() => {
    if (!quarters.length) return;
    const actualIds = new Set(quarters.map((quarter) => quarter.id));
    const filtered = ui.selectedQuarterIds.filter((id) => actualIds.has(id));
    const nextQuarterIds = filtered.length ? filtered : [getCurrentQuarterId(quarters)].filter(Boolean);
    if (!shallowArrayEqual(nextQuarterIds, ui.selectedQuarterIds)) {
      dispatch(setParticipantWorkloadFilters({ selectedQuarterIds: nextQuarterIds }));
    }
  }, [dispatch, quarters, ui.selectedQuarterIds]);

  const workloadFiltersSignature = React.useMemo(
    () =>
      JSON.stringify({
        quarterIds: ui.selectedQuarterIds,
        participantIds: ui.selectedParticipantIds,
        roles: ui.rolesFilter,
        userStreams: ui.userStreamsFilter,
        priority: ui.priorityFilter,
        taskStream: ui.taskStreamFilter,
      }),
    [
      ui.priorityFilter,
      ui.rolesFilter,
      ui.selectedParticipantIds,
      ui.selectedQuarterIds,
      ui.taskStreamFilter,
      ui.userStreamsFilter,
    ]
  );

  React.useEffect(() => {
    setParticipantPageNumber(0);
  }, [workloadFiltersSignature]);

  const workloadQueryArgs = React.useMemo(
    () => ({
      quarterIds: ui.selectedQuarterIds,
      participantIds: ui.selectedParticipantIds.length
        ? ui.selectedParticipantIds
        : undefined,
      roles: ui.rolesFilter.length ? ui.rolesFilter : undefined,
      userStreams: ui.userStreamsFilter.length ? ui.userStreamsFilter : undefined,
      priority: ui.priorityFilter,
      streams: ui.taskStreamFilter ? [ui.taskStreamFilter] : undefined,
      page: participantPageNumber,
      size: participantPageSize,
    }),
    [
      participantPageNumber,
      participantPageSize,
      ui.priorityFilter,
      ui.rolesFilter,
      ui.selectedParticipantIds,
      ui.selectedQuarterIds,
      ui.taskStreamFilter,
      ui.userStreamsFilter,
    ]
  );
  const {
    data: workloadPage,
    isError: isWorkloadError,
  } = useGetParticipantWorkloadQuery(
    quarters.length > 0 && ui.selectedQuarterIds.length > 0
      ? workloadQueryArgs
      : skipToken
  );
  const workloadRows = workloadPage?.content ?? [];

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

  const taskStreamOptions = React.useMemo(
    () => (filtersData?.streams || []).slice().sort(),
    [filtersData?.streams]
  );

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

  const pageParticipantIds = React.useMemo(
    () => workloadRows.map((row) => row.participant.id),
    [workloadRows]
  );

  const { data: capacityRows = [] } = useGetCapacityQuery({
    quarterIds: ui.selectedQuarterIds.length ? ui.selectedQuarterIds : undefined,
    participantIds: pageParticipantIds,
  }, {
    skip: ui.selectedQuarterIds.length === 0 || pageParticipantIds.length === 0,
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
      const next: Allocations = {};
      let changed = Object.keys(prev).length > 0;
      for (const row of workloadRows) {
        const pid = row.participant.id;
        for (const t of row.tasks) {
          const participantAllocations: Record<string, number> = {};
          for (const s of sprintsInScope) {
            const value = Number(t.allocations?.[s.id] ?? 0) || 0;
            participantAllocations[s.id] = value;
            if (prev[t.id]?.[pid]?.[s.id] !== value) {
              changed = true;
            }
          }
          next[t.id] = {
            ...(next[t.id] || {}),
            [pid]: participantAllocations,
          };
          if (!prev[t.id]?.[pid]) {
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [sprintsInScope, workloadRows]);

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
        days: normalizeDayAmount(value),
      })
        .unwrap()
        .catch((error) => {
          console.error("Failed to save allocation", error);
        });
    },
    [upsertTaskAllocation]
  );

  const getRowsForParticipant = (row: ParticipantWorkloadRow) => {
    const pid = row.participant.id;
    const rows = row.tasks
      .filter((t) => ui.priorityFilter.includes(t.priority) && t.status !== "backlog")
      .map((t) => ({
        task: t,
        perSprint: sprintsInScope.map((s) =>
          normalizeDayAmount(
            allocations[t.id]?.[pid]?.[s.id] ??
              t.allocations?.[s.id] ??
              0
          )
        ),
      }));
    return rows as { task: ParticipantWorkloadTask; perSprint: number[] }[];
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
        {isWorkloadError && (
          <Typography sx={{ color: "error.main" }}>
            Не удалось загрузить задачи по текущим фильтрам
          </Typography>
        )}
        <TablePagination
          component="div"
          count={workloadPage?.page?.totalElements ?? 0}
          page={participantPageNumber}
          rowsPerPage={participantPageSize}
          rowsPerPageOptions={[5, 10, 20, 50]}
          labelRowsPerPage="Сотрудников на странице"
          labelDisplayedRows={({ from, to, count }) =>
            `${from}-${to} из ${count === -1 ? `больше ${to}` : count}`
          }
          onPageChange={(_, nextPage) => setParticipantPageNumber(nextPage)}
          onRowsPerPageChange={(event) => {
            setParticipantPageSize(Number(event.target.value));
            setParticipantPageNumber(0);
          }}
        />
        {workloadRows.map((workloadRow) => {
          const p = workloadRow.participant;
          const rows = getRowsForParticipant(workloadRow);
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

        {!workloadRows.length && (
          <Typography sx={{ color: "text.secondary" }}>
            Нет участников по выбранным фильтрам
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
