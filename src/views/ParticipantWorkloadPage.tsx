import * as React from "react";
import {
  Paper,
  Typography,
  Stack,
  Chip,
  Select,
  MenuItem,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
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

  const { data: quarters = [] } = useGetQuartersQuery();
  const { data: participants = [] } = useGetParticipantsQuery();
  const allSprints = useGetSprintsQuery(undefined).data ?? [];
  const { data: tasks = [] } = useGetTasksQuery(undefined);

  const sprintsInScope = React.useMemo(() => {
    const list =
      ui.quarterId === "all"
        ? [...allSprints]
        : allSprints.filter((s) => s.quarterId === ui.quarterId);
    return list.sort(byStart);
  }, [allSprints, ui.quarterId]);

  const participantOptions = React.useMemo(
    () =>
      participants.map((p) => ({
        value: p.id,
        label: `${p.fullName}${p.role ? ` (${p.role})` : ""}`,
      })),
    [participants]
  );

  const quarterOptions = React.useMemo(
    () => [
      { value: "all", label: "Все кварталы" },
      ...quarters
        .slice()
        .sort((a, b) => a.endDate.localeCompare(b.endDate))
        .map((q) => ({
          value: q.id,
          label: `${q.name} (${q.startDate} → ${q.endDate})`,
        })),
    ],
    [quarters]
  );

  const roleOptions = React.useMemo(() => {
    const roles = participants
      .map((p) => p.role)
      .filter((role): role is string => Boolean(role && role.trim()));
    return Array.from(new Set(roles)).sort();
  }, [participants]);

  const handleRolesFilterChange = React.useCallback(
    (values: string[]) => {
      const next = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
      if (shallowArrayEqual(next, ui.rolesFilter)) return;
      dispatch(setParticipantWorkloadFilters({ rolesFilter: next }));
    },
    [dispatch, ui.rolesFilter]
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
    return list;
  }, [participants, selectedParticipants, ui.rolesFilter]);

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
    return rows;
  };

  return (
    <Paper elevation={0} sx={{ p: 2 }}>
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
          allowCustom={false}
          label="Квартал"
          options={quarterOptions}
          value={ui.quarterId}
          onChange={(quarterId) =>
            dispatch(
              setParticipantWorkloadFilters({
                quarterId: quarterId || "all",
              })
            )
          }
          disableClearable
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

        <Select
          multiple
          size="small"
          value={ui.priorityFilter}
          onChange={(e) =>
            dispatch(
              setParticipantWorkloadFilters({
                priorityFilter: (e.target.value as number[]).length
                  ? (e.target.value as number[])
                  : [1, 2, 3],
              })
            )
          }
          renderValue={(vals) => (vals as number[]).join(", ")}
          sx={{ minWidth: 140 }}
        >
          {[1, 2, 3].map((p) => (
            <MenuItem key={p} value={p}>
              {p}
            </MenuItem>
          ))}
        </Select>
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
                      <TableCell sx={{ minWidth: 300 }}>Задача</TableCell>
                      {sprintsInScope.map((s) => (
                        <TableCell key={s.id} align="center">
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 700 }}
                          >
                            {s.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {s.startDate} → {s.endDate}
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
                                label={`P${r.task.priority}`}
                                color={
                                  r.task.priority === 1
                                    ? "error"
                                    : r.task.priority === 2
                                    ? "warning"
                                    : "default"
                                }
                              />
                              <Typography>{r.task.title}</Typography>
                            </Stack>
                          </TableCell>
                          {r.perSprint.map((v, i) => (
                            <TableCell key={i} align="center">
                              {v}
                            </TableCell>
                          ))}
                          <TableCell align="center" sx={{ fontWeight: 700 }}>
                            {total}
                          </TableCell>
                        </TableRow>
                      );
                    })}

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
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          );
        })}

        {!participantsInScope.length && (
          <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">
              Нет участников под выбранные фильтры
            </Typography>
          </Paper>
        )}
      </Stack>
    </Paper>
  );
}
