import { shallowEqual } from "react-redux";
import useResolvedQuarterFilter from "./useResolvedQuarterFilter";
import useToday from "./useToday";
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
  Box,
  Button,
  TextField,
  MenuItem,
  Alert,
} from "@mui/material";
import {
  useActiveParticipantsQuery,
  useGetQuartersQuery,
  useGetSprintsQuery,
  useGetCapacityQuery,
  useGetFiltersQuery,
  useGetParticipantWorkloadQuery,
  useUpsertTaskAllocationMutation,
} from "../app/api";
import TaskAllocationCell from "../components/TaskAllocationCell";
import type {
  Sprint,
  Quarter,
  ParticipantWorkloadRow,
  ParticipantWorkloadTask,
  Allocations,
  CapacityCell,
  CapacityRow,
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

const EMPTY_QUARTERS: Quarter[] = [];
const EMPTY_SPRINTS: Sprint[] = [];
const EMPTY_WORKLOAD: ParticipantWorkloadRow[] = [];
const EMPTY_CAPACITY: CapacityRow[] = [];

function ParticipantWorkloadPage() {
  const dispatch = useAppDispatch();
  const currentTeamKey = useAppSelector(selectCurrentTeamKey);
  const ui = useAppSelector((s) => s.ui.participantWorkload);
  const [upsertTaskAllocation] = useUpsertTaskAllocationMutation();
  const [allocations, setAllocations] = React.useState<Allocations>({});
  const [participantPageNumber, setParticipantPageNumber] = React.useState(0);
  const [participantPageSize, setParticipantPageSize] = React.useState(10);

  const { data: quartersData } = useGetQuartersQuery(undefined, { selectFromResult: ({ data }) => ({ data }) });
  const quarters = quartersData ?? EMPTY_QUARTERS;
  const { data: participants } = useActiveParticipantsQuery();
  const { data: allSprints = EMPTY_SPRINTS } = useGetSprintsQuery(undefined, { selectFromResult: ({ data }) => ({ data }) });
  const { data: filtersData } = useGetFiltersQuery(undefined, { selectFromResult: ({ data }) => ({ data }) });
  const today = useToday();
  const currentQuarterId = React.useMemo(() => quarters.find(q => q.startDate <= today && today <= q.endDate)?.id, [quarters, today]);
  const persistQuarters = React.useCallback((ids: string[]) => { dispatch(setParticipantWorkloadFilters({ selectedQuarterIds: ids })); }, [dispatch]);
  const selectedQuarterIds = useResolvedQuarterFilter(quartersData, ui.selectedQuarterIds, persistQuarters, currentQuarterId);
  const hasSelectedQuarter = selectedQuarterIds.length > 0;
  const isQuarterRequired = quartersData !== undefined && !hasSelectedQuarter;

  const workloadFiltersSignature = React.useMemo(
    () =>
      JSON.stringify({
        teamKey: currentTeamKey,
        pageSize: participantPageSize,
        quarterIds: selectedQuarterIds,
        participantIds: ui.selectedParticipantIds,
        roles: ui.rolesFilter,
        userStreams: ui.userStreamsFilter,
        priority: ui.priorityFilter,
        taskStream: ui.taskStreamFilter,
      }),
    [
      currentTeamKey, participantPageSize,
      ui.priorityFilter,
      ui.rolesFilter,
      ui.selectedParticipantIds,
      selectedQuarterIds,
      ui.taskStreamFilter,
      ui.userStreamsFilter,
    ]
  );

  const previousFiltersSignature = React.useRef(workloadFiltersSignature);
  const effectivePageNumber = previousFiltersSignature.current === workloadFiltersSignature ? participantPageNumber : 0;
  React.useEffect(() => {
    previousFiltersSignature.current = workloadFiltersSignature;
    setParticipantPageNumber(0);
  }, [workloadFiltersSignature]);

  const workloadQueryArgs = React.useMemo(
    () => ({
      teamKey: currentTeamKey,
      quarterIds: selectedQuarterIds,
      participantIds: ui.selectedParticipantIds.length
        ? ui.selectedParticipantIds
        : undefined,
      roles: ui.rolesFilter.length ? ui.rolesFilter : undefined,
      userStreams: ui.userStreamsFilter.length ? ui.userStreamsFilter : undefined,
      priority: ui.priorityFilter,
      streams: ui.taskStreamFilter ? [ui.taskStreamFilter] : undefined,
      page: effectivePageNumber,
      size: participantPageSize,
    }),
    [
      currentTeamKey, effectivePageNumber,
      participantPageSize,
      ui.priorityFilter,
      ui.rolesFilter,
      ui.selectedParticipantIds,
      selectedQuarterIds,
      ui.taskStreamFilter,
      ui.userStreamsFilter,
    ]
  );
  const {
    currentData: workloadPage,
    isFetching: isWorkloadFetching,
    refetch: refetchWorkload,
    isError: isWorkloadError,
  } = useGetParticipantWorkloadQuery(
    quartersData !== undefined && hasSelectedQuarter
      ? workloadQueryArgs
      : skipToken
  );
  const workloadRows = hasSelectedQuarter ? workloadPage?.content ?? EMPTY_WORKLOAD : EMPTY_WORKLOAD;
  const loadMoreSentinelRef = React.useRef<HTMLDivElement>(null);
  const totalParticipants = hasSelectedQuarter ? workloadPage?.page.totalElements ?? 0 : 0;
  const hasMoreParticipants = workloadRows.length < totalParticipants;
  const loadNextPage = React.useCallback(() => {
    if (!hasMoreParticipants || isWorkloadFetching || isWorkloadError) return;
    setParticipantPageNumber(page => Math.max(page, (workloadPage?.page.number ?? 0) + 1));
  }, [hasMoreParticipants, isWorkloadFetching, isWorkloadError, workloadPage?.page.number]);
  React.useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadNextPage();
    }, { rootMargin: "300px", threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadNextPage]);


  const sprintsInScope = React.useMemo(() => {
    const selected = new Set(selectedQuarterIds);
    const list =
      selected.size === 0
        ? [...allSprints]
        : allSprints.filter((s) => selected.has(s.quarterId));
    return list.sort(byStart);
  }, [allSprints, selectedQuarterIds]);

  const participantOptions = React.useMemo(
    () =>
      participants.map((p) => ({
        value: p.id,
        label: `${p.fullName}${p.role ? ` (${p.role})` : ""}`,
      })),
    [participants]
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

  const { data: capacityRows = EMPTY_CAPACITY } = useGetCapacityQuery({
    quarterIds: selectedQuarterIds.length ? selectedQuarterIds : undefined,
    participantIds: pageParticipantIds,
  }, {
    skip: !quartersData || pageParticipantIds.length === 0,
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
      let changed = false;
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
            [pid]: shallowEqual(prev[t.id]?.[pid], participantAllocations) ? prev[t.id][pid] : participantAllocations,
          };
          if (!prev[t.id]?.[pid]) {
            changed = true;
          }
        }
      }
      Object.entries(next).forEach(([taskId, taskRows]) => {
        if (shallowEqual(prev[taskId], taskRows)) next[taskId] = prev[taskId];
        else changed = true;
      });
      return changed || Object.keys(prev).length !== Object.keys(next).length ? next : prev;
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
      .filter((t) => ui.priorityFilter.includes(t.priority))
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
            type: "quarters",
            key: "quarters",
            minWidth: 200,
            props: {
              label: "Фильтр по кварталам",
              value: selectedQuarterIds,
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
      <TextField select size="small" label="Количество сотрудников" value={participantPageSize}
        onChange={event => setParticipantPageSize(Number(event.target.value))} sx={{ width: 220, my: 2 }}>
        {[5, 10, 20, 50].map(size => <MenuItem key={size} value={size}>{size}</MenuItem>)}
      </TextField>

      <Stack spacing={2}>
        {isQuarterRequired && <Alert severity="error">Квартал обязателен</Alert>}
        {!isQuarterRequired && isWorkloadError && (
          <Typography sx={{ color: "error.main" }}>
            Не удалось загрузить задачи по текущим фильтрам
          </Typography>
        )}
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
                                <TaskAllocationCell
                                  taskId={r.task.id} participantId={p.id} sprintId={s.id}
                                  value={v}
                                  onChange={handleAllocChange}
                                  onCommit={commitCell}
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

        {hasSelectedQuarter && !workloadRows.length && !isWorkloadFetching && !isWorkloadError && (
          <Typography sx={{ color: "text.secondary" }}>
            Нет участников по выбранным фильтрам
          </Typography>
        )}
        <Box ref={loadMoreSentinelRef} sx={{ height: 1 }} />
        {hasSelectedQuarter && <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">Загружено {workloadRows.length} из {totalParticipants} сотрудников</Typography>
          <Button variant="outlined" onClick={isWorkloadError ? () => { void refetchWorkload(); } : loadNextPage} disabled={isWorkloadFetching || (!hasMoreParticipants && !isWorkloadError)}>
            {isWorkloadFetching ? "Загрузка..." : isWorkloadError ? "Повторить загрузку" : "Загрузить еще"}
          </Button>
        </Stack>}
      </Stack>
    </Paper>
  );
}

export default React.memo(ParticipantWorkloadPage);
