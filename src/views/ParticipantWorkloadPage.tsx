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
  Box,
} from "@mui/material";
import {
  useGetParticipantsQuery,
  useGetQuartersQuery,
  useGetSprintsQuery,
  useGetTasksQuery,
  useUpsertTaskAllocationMutation,
} from "../app/api";
import EditableNumberCell from "../components/EditableNumberCell";
import type { Sprint, BacklogItem, Allocations } from "../types";
import {
  getDefaultUIState,
  setParticipantWorkloadFilters,
} from "../app/uiSlice";
import FiltersPanel from "../components/filters/FiltersPanel";
import { useAppDispatch, useAppSelector } from "./hooks";
import {
  hasAnyParams,
  parseNumberArrayParam,
  parseStringArrayParam,
  parseStringParam,
  setNumberArrayParam,
  setStringArrayParam,
  setStringParam,
} from "./filterUrl";
import { useSearchParams } from "react-router-dom";

function byStart(a: Sprint, b: Sprint) {
  return a.startDate.localeCompare(b.startDate);
}
const toInt = (n: any) =>
  Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0;

function shallowArrayEqual<T>(a: readonly T[], b: readonly T[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export default function ParticipantWorkloadPage() {
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const ui = useAppSelector((s) => s.ui.participantWorkload);
  const defaultFilters = React.useMemo(
    () => getDefaultUIState().participantWorkload,
    []
  );
  const filterParamKeys = React.useMemo(
    () => [
      "selectedQuarterIds",
      "selectedParticipantIds",
      "rolesFilter",
      "userStreamsFilter",
      "priorityFilter",
      "taskStreamFilter",
    ],
    []
  );
  const lastSyncedQueryRef = React.useRef<string | null>(null);
  const isApplyingUrlRef = React.useRef(false);

  const buildDefaultFilters = React.useCallback(() => {
    const defaults = getDefaultUIState().participantWorkload;
    return {
      selectedQuarterIds: defaults.selectedQuarterIds.slice(),
      selectedParticipantIds: defaults.selectedParticipantIds.slice(),
      rolesFilter: defaults.rolesFilter.slice(),
      userStreamsFilter: defaults.userStreamsFilter.slice(),
      priorityFilter: defaults.priorityFilter.slice(),
      taskStreamFilter: defaults.taskStreamFilter,
    };
  }, []);

  const applyFiltersFromParams = React.useCallback(
    (params: URLSearchParams) => {
      const nextSelectedQuarterIds = parseStringArrayParam(
        params,
        "selectedQuarterIds"
      );
      const nextSelectedParticipantIds = parseStringArrayParam(
        params,
        "selectedParticipantIds"
      );
      const nextRoles = parseStringArrayParam(params, "rolesFilter");
      const nextUserStreams = parseStringArrayParam(params, "userStreamsFilter");
      const parsedPriority = parseNumberArrayParam(params, "priorityFilter").filter(
        (n): n is number => [1, 2, 3].includes(n)
      );
      const nextPriority =
        parsedPriority.length > 0
          ? parsedPriority
          : defaultFilters.priorityFilter;
      const nextTaskStream = parseStringParam(
        params,
        "taskStreamFilter",
        defaultFilters.taskStreamFilter
      );

      if (
        shallowArrayEqual(nextSelectedQuarterIds, ui.selectedQuarterIds) &&
        shallowArrayEqual(
          nextSelectedParticipantIds,
          ui.selectedParticipantIds
        ) &&
        shallowArrayEqual(nextRoles, ui.rolesFilter) &&
        shallowArrayEqual(nextUserStreams, ui.userStreamsFilter) &&
        shallowArrayEqual(nextPriority, ui.priorityFilter) &&
        nextTaskStream === ui.taskStreamFilter
      ) {
        return;
      }

      dispatch(
        setParticipantWorkloadFilters({
          selectedQuarterIds: nextSelectedQuarterIds,
          selectedParticipantIds: nextSelectedParticipantIds,
          rolesFilter: nextRoles,
          userStreamsFilter: nextUserStreams,
          priorityFilter: nextPriority,
          taskStreamFilter: nextTaskStream,
        })
      );
    },
    [defaultFilters, dispatch, ui]
  );

  const syncFiltersToUrl = React.useCallback(
    (params: URLSearchParams) => {
      setStringArrayParam(params, "selectedQuarterIds", ui.selectedQuarterIds);
      setStringArrayParam(
        params,
        "selectedParticipantIds",
        ui.selectedParticipantIds
      );
      setStringArrayParam(params, "rolesFilter", ui.rolesFilter);
      setStringArrayParam(params, "userStreamsFilter", ui.userStreamsFilter);
      setNumberArrayParam(params, "priorityFilter", ui.priorityFilter);
      setStringParam(params, "taskStreamFilter", ui.taskStreamFilter);
    },
    [ui]
  );

  const hasUrlFilters = hasAnyParams(searchParams, filterParamKeys);
  const hasStoredFilters =
    ui.selectedQuarterIds.length > 0 ||
    ui.selectedParticipantIds.length > 0 ||
    ui.rolesFilter.length > 0 ||
    ui.userStreamsFilter.length > 0 ||
    ui.taskStreamFilter.trim().length > 0 ||
    !shallowArrayEqual(ui.priorityFilter, defaultFilters.priorityFilter);
  const buildSearchParams = React.useCallback(() => {
    const params = new URLSearchParams();
    syncFiltersToUrl(params);
    return params;
  }, [syncFiltersToUrl]);

  React.useEffect(() => {
    const currentQuery = searchParams.toString();
    if (lastSyncedQueryRef.current === currentQuery) return;
    if (hasUrlFilters) {
      isApplyingUrlRef.current = true;
      applyFiltersFromParams(searchParams);
      isApplyingUrlRef.current = false;
      lastSyncedQueryRef.current = currentQuery;
      return;
    }
    if (hasStoredFilters) {
      const nextParams = buildSearchParams();
      const nextQuery = nextParams.toString();
      if (nextQuery === currentQuery) {
        lastSyncedQueryRef.current = currentQuery;
        return;
      }
      lastSyncedQueryRef.current = nextQuery;
      setSearchParams(nextParams, { replace: true });
      return;
    }
    lastSyncedQueryRef.current = currentQuery;
  }, [
    applyFiltersFromParams,
    buildSearchParams,
    hasStoredFilters,
    hasUrlFilters,
    searchParams,
    setSearchParams,
  ]);

  React.useEffect(() => {
    if (isApplyingUrlRef.current) return;
    const currentQuery = searchParams.toString();
    const nextParams = buildSearchParams();
    const nextQuery = nextParams.toString();
    if (nextQuery === currentQuery) {
      lastSyncedQueryRef.current = currentQuery;
      return;
    }
    lastSyncedQueryRef.current = nextQuery;
    setSearchParams(nextParams, { replace: true });
  }, [buildSearchParams, searchParams, setSearchParams]);

  const handleResetFilters = React.useCallback(() => {
    dispatch(setParticipantWorkloadFilters(buildDefaultFilters()));
  }, [buildDefaultFilters, dispatch]);
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
      const next = Array.from(
        new Set(values.map((v) => v.trim()).filter(Boolean))
      );
      if (shallowArrayEqual(next, ui.rolesFilter)) return;
      dispatch(setParticipantWorkloadFilters({ rolesFilter: next }));
    },
    [dispatch, ui.rolesFilter]
  );

  const handleUserStreamsFilterChange = React.useCallback(
    (values: string[]) => {
      const next = Array.from(
        new Set(values.map((v) => v.trim()).filter(Boolean))
      );
      if (shallowArrayEqual(next, ui.userStreamsFilter)) return;
      dispatch(setParticipantWorkloadFilters({ userStreamsFilter: next }));
    },
    [dispatch, ui.userStreamsFilter]
  );

  const handlePriorityFilterChange = React.useCallback(
    (values: string[]) => {
      const next = Array.from(new Set(values))
        .map((v) => Number(v))
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
    let list = participants.slice();
    if (selectedParticipants.length) {
      const set = new Set(selectedParticipants.map((p) => p.id));
      list = list.filter((p) => set.has(p.id));
    }
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
            xs: "repeat(auto-fit, minmax(240px, 1fr))",
            md: "repeat(auto-fit, minmax(260px, 1fr))",
          },
        }}
        onReset={handleResetFilters}
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
                    selectedQuarterIds: Array.from(new Set(ids)),
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
                      return (
                        <TableRow key={`${p.id}-${r.task.id}`}>
                          <TableCell>
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
                                  sx={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                    wordBreak: "break-word",
                                    maxWidth: 300,
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
                        {totalsBySprint.map((v, i) => (
                          <TableCell
                            key={i}
                            align="center"
                            sx={{ fontWeight: 700 }}
                          >
                            {v}
                          </TableCell>
                        ))}
                        <TableCell align="center" sx={{ fontWeight: 700 }}>
                          {totalsBySprint.reduce((a, b) => a + b, 0)}
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
