// src/views/CapacityPage.tsx
import * as React from "react";
import {
  Paper,
  Typography,
  Stack,
  Box,
  Chip,
  Select,
  MenuItem,
  OutlinedInput,
  InputLabel,
  FormControl,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import moment from "moment";
import "moment/locale/ru";

import {
  useGetQuartersQuery,
  useGetSprintsQuery,
  useGetParticipantsQuery,
  useGetTasksQuery,
} from "../app/api";
import type { Participant, Quarter, Sprint, BacklogItem } from "../types";

moment.locale("ru");

const NORM = 0.75;
const LS_KEY = "capacity.selectedQuarterNames";

const ruDate = (iso: string) =>
  moment(iso, "YYYY-MM-DD", true).format("DD.MM.YYYY");
const round1 = (v: number) => Math.round(v * 10) / 10;

function getCurrentQuarterName(
  quarters: ReturnType<typeof useGetQuartersQuery>["data"] extends infer T
    ? T extends Array<any>
      ? string | null
      : string | null
    : string | null,
  qts?: Quarter[]
) {
  const qs = (qts ?? []) as Quarter[];
  const today = moment().format("YYYY-MM-DD");
  const q = qs.find((x) => x.startDate <= today && today <= x.endDate);
  return q ? q.name : null;
}

function collectSprintIds(
  quartersFilterNames: string[],
  quarters: Quarter[],
  allSprints: Sprint[]
) {
  const nameSet = new Set(quartersFilterNames);
  const qids = quarters.filter((q) => nameSet.has(q.name)).map((q) => q.id);
  const idSet = new HashSet(qids);
  return allSprints
    .filter((s) => idSet.has(s.quarterId))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
}

class HashSet<T> extends Set<T> {
  constructor(iter?: Iterable<T>) {
    super(iter);
  }
}

function buildWorkloadByParticipantSprint(
  tasks: BacklogItem[],
  sprintIds: string[]
) {
  const sset = new Set(sprintIds);
  const map = new Map<string, number>(); // key = participantId|sprintId
  for (const t of tasks) {
    if (t.allocations) {
      for (const [pid, perSprint] of Object.entries(t.allocations)) {
        for (const [sid, days] of Object.entries(perSprint)) {
          if (!sset.has(sid)) continue;
          const key = `${pid}|${sid}`;
          map.set(key, (map.get(key) || 0) + (Number(days) || 0));
        }
      }
    } else if (t.loads) {
      // Если нет распределения по участникам — не учитываем при раскраске
      continue;
    }
  }
  return map;
}

/**
 * Раскраска ячейки:
 * - если workload < 0.75 * available  -> Оранжевый
 * - если workload > 1.25 * available  -> Красный
 * - иначе                              -> Зелёный
 * Частный случай: available === 0 -> workload>0 красный, иначе зелёный
 */
function cellColor(workload: number, available: number): string {
  if (available === 0) {
    return workload > 0 ? "#ffebee" : "#e8f5e9";
  }
  const low = 0.75 * available;
  const high = 1.25 * available;
  if (workload < low) return "#fff3e0"; // оранжевый
  if (workload > high) return "#ffebee"; // красный
  return "#e8f5e9"; // зелёный
}

export default function CapacityPage() {
  const { data: quarters = [] } = useGetQuartersQuery();
  const { data: sprints = [] } = useGetSprintsQuery(undefined);
  const { data: participants = [] } = useGetParticipantsQuery();
  const { data: tasks = [] } = useGetTasksQuery(undefined);

  const [selectedQuarterNames, setSelectedQuarterNames] = React.useState<
    string[]
  >(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  React.useEffect(() => {
    const existing = new Set(quarters.map((q) => q.name));
    const filtered = selectedQuarterNames.filter((n) => existing.has(n));
    if (filtered.length !== selectedQuarterNames.length) {
      setSelectedQuarterNames(filtered);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quarters.length]);

  React.useEffect(() => {
    if (!quarters.length) return;
    if (selectedQuarterNames.length === 0) {
      const current = getCurrentQuarterName(null, quarters);
      if (current) {
        setSelectedQuarterNames([current]);
      }
    }
  }, [quarters, selectedQuarterNames.length]);

  React.useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(selectedQuarterNames));
    } catch {}
  }, [selectedQuarterNames]);

  const displaySprints = React.useMemo(() => {
    const list = collectSprintIds(selectedQuarterNames, quarters, sprints);
    return list.sort((a, b) => a.endDate.localeCompare(b.endDate));
  }, [selectedQuarterNames, quarters, sprints]);

  const workloadMap = React.useMemo(() => {
    const sprintIds = displaySprints.map((s) => s.id);
    return buildWorkloadByParticipantSprint(tasks, sprintIds);
  }, [tasks, displaySprints]);

  const sprintIndex = React.useMemo(() => {
    const m = new Map<string, number>();
    displaySprints.forEach((s, idx) => m.set(s.id, idx));
    return m;
  }, [displaySprints]);

  const allQuarterNamesSorted = React.useMemo(() => {
    return [...quarters]
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .map((q) => q.name);
  }, [quarters]);

  const handleFilterChange = (value: string[]) => {
    const existing = new Set(quarters.map((q) => q.name));
    const filtered = value.filter((v) => existing.has(v));
    setSelectedQuarterNames(filtered);
  };

  const getAvailable = (p: Participant, s: Sprint) =>
    s.workingDays * p.rate * NORM;

  const getWorkload = (pid: string, sid: string) =>
    workloadMap.get(`${pid}|${sid}`) || 0;

  const rowTotals = React.useCallback(
    (p: Participant) => {
      let sumWork = 0;
      let sumAvail = 0;
      for (const s of displaySprints) {
        sumWork += getWorkload(p.id, s.id);
        sumAvail += getAvailable(p, s);
      }
      return { sumWork: round1(sumWork), sumAvail: round1(sumAvail) };
    },
    [displaySprints, getWorkload]
  );

  return (
    <Paper
      elevation={0}
      sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Typography variant="h6">Нагрузка по спринтам</Typography>

      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ flexWrap: "wrap" }}
      >
        <FormControl sx={{ minWidth: 320 }} size="small">
          <InputLabel id="capacity-q-filter">Фильтр по кварталам</InputLabel>
          <Select
            labelId="capacity-q-filter"
            multiple
            value={selectedQuarterNames}
            onChange={(e) => handleFilterChange(e.target.value as string[])}
            input={<OutlinedInput label="Фильтр по кварталам" />}
            renderValue={(selected) => (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {selected.map((name) => (
                  <Chip key={name} label={name} size="small" />
                ))}
              </Box>
            )}
          >
            {allQuarterNamesSorted.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Box sx={{ overflowX: "auto" }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  whiteSpace: "nowrap",
                  fontWeight: 700,
                  position: "sticky",
                  left: 0,
                  zIndex: (theme) => theme.zIndex.appBar, // выше остальных ячеек
                  backgroundColor: "background.paper",
                  minWidth: 260,
                }}
              >
                Участник
              </TableCell>
              {displaySprints.map((s) => (
                <TableCell
                  key={s.id}
                  align="center"
                  sx={{ minWidth: 140, whiteSpace: "nowrap" }}
                >
                  <Box sx={{ fontWeight: 700 }}>
                    {ruDate(s.startDate)} — {ruDate(s.endDate)}
                  </Box>
                  <Box sx={{ color: "text.secondary" }}>{s.name}</Box>
                </TableCell>
              ))}
              <TableCell align="center" sx={{ minWidth: 140, fontWeight: 700 }}>
                Итого
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {participants.map((p) => {
              const totals = rowTotals(p);
              return (
                <TableRow key={p.id} hover>
                  <TableCell
                    sx={{
                      whiteSpace: "nowrap",
                      position: "sticky",
                      left: 0,
                      zIndex: (theme) => theme.zIndex.appBar - 1,
                      backgroundColor: "background.paper",
                      minWidth: 260,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Chip size="small" label={p.role || "—"} />
                      <Typography sx={{ fontWeight: 500 }}>
                        {p.fullName}
                      </Typography>
                    </Box>
                  </TableCell>

                  {displaySprints.map((s) => {
                    const availRaw = getAvailable(p, s);
                    const workRaw = getWorkload(p.id, s.id);
                    const avail = round1(availRaw);
                    const work = round1(workRaw);
                    const bg = cellColor(workRaw, availRaw);

                    return (
                      <TableCell
                        key={`${p.id}-${s.id}`}
                        align="center"
                        sx={{ backgroundColor: bg }}
                        title={`Нагрузка: ${work.toFixed(1)} дн • Доступно: ${o(
                          avail
                        )} дн`}
                      >
                        {work.toFixed(1)} / {o(avail)}
                      </TableCell>
                    );
                  })}

                  <TableCell align="center" sx={{ fontWeight: 600 }}>
                    {totals.sumWork.toFixed(1)} / {totals.sumAvail.toFixed(1)}
                  </TableCell>
                </TableRow>
              );
            })}

            {!participants.length && (
              <TableRow>
                <TableCell
                  colSpan={displaySprints.length + 2}
                  align="center"
                  sx={{ color: "text.secondary" }}
                >
                  Нет участников для отображения
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}

// helper just to format decimals with one fraction
function o(n: number) {
  return n.toFixed(1);
}
