import * as React from "react";
import {
  Paper,
  Typography,
  Stack,
  Box,
  Chip,
  Select,
  MenuItem,
  Autocomplete,
  TextField,
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
import type { Participant, Sprint, BacklogItem } from "../types";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../app/store";
import { setParticipantWorkloadFilters } from "../app/uiSlice";

function byStart(a: Sprint, b: Sprint) {
  return a.startDate.localeCompare(b.startDate);
}
const toInt = (n: any) =>
  Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0;

export default function ParticipantWorkloadPage() {
  const dispatch = useDispatch();
  const ui = useSelector((s: RootState) => s.ui.participantWorkload);

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

  const roleOptions = React.useMemo(
    () => Array.from(new Set(participants.map((p) => p.role))).sort(),
    [participants]
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
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems="center"
        sx={{ mb: 2, flexWrap: "wrap" }}
      >
        <Box sx={{ minWidth: 260 }}>
          <Typography variant="caption" color="text.secondary">
            Квартал
          </Typography>
          <Select
            size="small"
            value={ui.quarterId}
            onChange={(e) =>
              dispatch(
                setParticipantWorkloadFilters({
                  quarterId: String(e.target.value),
                })
              )
            }
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

        <Autocomplete
          multiple
          size="small"
          sx={{ minWidth: 320 }}
          options={participants}
          getOptionLabel={(p) => (p ? `${p.fullName} (${p.role})` : "")}
          value={participants.filter((p) =>
            ui.selectedParticipantIds.includes(p.id)
          )}
          onChange={(_, val) =>
            dispatch(
              setParticipantWorkloadFilters({
                selectedParticipantIds: (val as Participant[]).map((p) => p.id),
              })
            )
          }
          renderInput={(params) => (
            <TextField {...params} label="Фильтр по ФИО" />
          )}
        />

        <Autocomplete
          multiple
          size="small"
          sx={{ minWidth: 240 }}
          options={roleOptions}
          value={ui.rolesFilter}
          onChange={(_, val) =>
            dispatch(
              setParticipantWorkloadFilters({ rolesFilter: val as string[] })
            )
          }
          renderInput={(params) => <TextField {...params} label="Роли" />}
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
