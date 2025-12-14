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
  CircularProgress,
} from "@mui/material";
import {
  useGetParticipantsQuery,
  useGetQuartersQuery,
  useGetSprintsQuery,
  useGetTasksQuery,
} from "../app/api";
import type { Sprint, BacklogItem } from "../types";
import { setParticipantWorkloadFilters } from "../app/uiSlice";
import FilterAutocomplete from "../components/filters/FilterAutocomplete";
import { useAppDispatch, useAppSelector } from "./hooks";

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
  const ui = useAppSelector((s) => s.ui.participantWorkload);

  const { data: quarters = [], isLoading: isQuartersLoading } =
    useGetQuartersQuery();
  const { data: participants = [], isLoading: isParticipantsLoading } =
    useGetParticipantsQuery();
  const { data: sprintsData = [], isLoading: isSprintsLoading } =
    useGetSprintsQuery(undefined);
  const allSprints = sprintsData;
  const { data: tasksPage, isLoading: isTasksLoading } = useGetTasksQuery({
    quarterIds: ui.selectedQuarterIds,
    participantIds: ui.selectedParticipantIds,
    roles: ui.rolesFilter,
    userStreams: ui.userStreamsFilter,
    priority: ui.priorityFilter,
  });
  const tasks: BacklogItem[] = tasksPage?.content ?? [];

  const isInitialLoading =
    (isQuartersLoading ||
      isParticipantsLoading ||
      isSprintsLoading ||
      isTasksLoading) &&
    !quarters.length &&
    !participants.length &&
    !allSprints.length &&
    !tasks.length;

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

  const handleRolesFilterChange = React.useCallback(
    (values: string[]) => {
      const next = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
      if (shallowArrayEqual(next, ui.rolesFilter)) return;
      dispatch(setParticipantWorkloadFilters({ rolesFilter: next }));
    },
    [dispatch, ui.rolesFilter]
  );

  const handleUserStreamsFilterChange = React.useCallback(
    (values: string[]) => {
      const next = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
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
  }, [participants, selectedParticipants, ui.rolesFilter, ui.userStreamsFilter]);

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
          toInt(t.allocations?.[pid]?.[s.id] ?? 0)
        ),
      }));
    return rows as { task: BacklogItem; perSprint: number[] }[];
  };

  return (
    <Paper elevation={0} sx={{ p: 2 }}>
      {isInitialLoading ? (
        <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 240 }}>
          <CircularProgress />
        </Stack>
      ) : (
        <>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Нагрузка по участникам
          </Typography>

          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            sx={{ mb: 2, flexWrap: { xs: "wrap", md: "nowrap" } }}
          >
            <FilterAutocomplete
              multiple
              allowCustom={false}
              label="Фильтр по кварталам"
              options={quarterOptions}
              value={ui.selectedQuarterIds}
              onChange={(ids) =>
                dispatch(
                  setParticipantWorkloadFilters({
                    selectedQuarterIds: Array.from(new Set(ids)),
                  })
                )
              }
              sx={{ minWidth: 240 }}
            />

            <FilterAutocomplete
              multiple
              allowCustom={false}
              label="Фильтр по ФИО"
              options={participantOptions}
              value={ui.selectedParticipantIds}
              onChange={(ids) =>
                dispatch(
                  setParticipantWorkloadFilters({
                    selectedParticipantIds: ids,
                  })
                )
              }
              sx={{ minWidth: 320 }}
            />

            <FilterAutocomplete
              multiple
              allowCustom={false}
              label="Роли"
              options={roleOptions}
              value={ui.rolesFilter}
              onChange={handleRolesFilterChange}
              sx={{ minWidth: 240 }}
            />

            <FilterAutocomplete
              multiple
              allowCustom={false}
              label="Стрим"
              options={userStreamOptions}
              value={ui.userStreamsFilter}
              onChange={handleUserStreamsFilterChange}
              sx={{ minWidth: 240 }}
            />

            <FilterAutocomplete
              multiple
              allowCustom={false}
              label="Приоритет"
              options={priorityOptions}
              value={ui.priorityFilter.map(String)}
              onChange={handlePriorityFilterChange}
              sx={{ minWidth: 180 }}
            />
          </Stack>

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
                          <TableCell sx={{ minWidth: 260, maxWidth: 360, width: 360 }}>
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
                                  <Tooltip title={r.task.title} placement="top" arrow>
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
                              {r.perSprint.map((v, i) => (
                                <TableCell key={`${p.id}-${r.task.id}-${i}`} align="center">
                                  {v}
                                </TableCell>
                              ))}
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
        </>
      )}
    </Paper>
  );
}
