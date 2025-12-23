// src/views/CapacityPage.tsx
import * as React from "react";
import {
  Paper,
  Typography,
  Stack,
  Box,
  Chip,
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
  useGetCapacityQuery,
} from "../app/api";
import type { Participant, Quarter, Sprint, CapacityCell } from "../types";
import FiltersPanel from "../components/filters/FiltersPanel";
import { useAppDispatch, useAppSelector } from "./hooks";
import { setCapacitySelectedQuarterIds } from "../app/uiSlice";

moment.locale("ru");

const ruDate = (iso: string) =>
  moment(iso, "YYYY-MM-DD", true).format("DD.MM.YYYY");
const round1 = (v: number) => Math.round(v * 10) / 10;

function getCurrentQuarterId(quarters: Quarter[]) {
  const today = moment().format("YYYY-MM-DD");
  const q = quarters.find((x) => x.startDate <= today && today <= x.endDate);
  return q ? q.id : null;
}

function collectSprintIds(
  selectedQuarterIds: string[],
  allSprints: Sprint[]
) {
  if (!selectedQuarterIds.length) {
    return allSprints
      .slice()
      .sort((a, b) => a.endDate.localeCompare(b.endDate));
  }
  const idSet = new Set(selectedQuarterIds);
  return allSprints
    .filter((s) => idSet.has(s.quarterId))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
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

function shallowStringArrayEqual(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export default function CapacityPage() {
  const { data: quarters = [], isLoading: isQuartersLoading } =
    useGetQuartersQuery();
  const { data: sprints = [], isLoading: isSprintsLoading } =
    useGetSprintsQuery(undefined);
  const dispatch = useAppDispatch();
  const selectedQuarterIds = useAppSelector(
    (state) => state.ui.capacity.selectedQuarterIds
  );

  const { data: capacityRows = [], isLoading: isCapacityLoading } =
    useGetCapacityQuery({
      quarterIds: selectedQuarterIds.length ? selectedQuarterIds : undefined,
    });

  const participants = React.useMemo(
    () => capacityRows.map((row) => row.participant),
    [capacityRows]
  );

  React.useEffect(() => {
    if (!quarters.length) return;
    const actualIds = new Set(quarters.map((q) => q.id));
    const filtered = selectedQuarterIds.filter((id) => actualIds.has(id));
    const unique = Array.from(new Set(filtered));
    if (!shallowStringArrayEqual(unique, selectedQuarterIds)) {
      dispatch(setCapacitySelectedQuarterIds(unique));
    }
  }, [quarters, selectedQuarterIds, dispatch]);

  React.useEffect(() => {
    if (!quarters.length || selectedQuarterIds.length > 0) return;
    const currentId = getCurrentQuarterId(quarters);
    if (currentId) {
      dispatch(setCapacitySelectedQuarterIds([currentId]));
    }
  }, [quarters, selectedQuarterIds.length, dispatch]);

  const displaySprints = React.useMemo(() => {
    return collectSprintIds(selectedQuarterIds, sprints);
  }, [selectedQuarterIds, sprints]);

  const cellMap = React.useMemo(() => {
    const map = new Map<string, CapacityCell>();
    capacityRows.forEach((row) => {
      row.cells.forEach((cell) => {
        const key = `${row.participant.id}|${cell.sprintId}`;
        map.set(key, cell);
      });
    });
    return map;
  }, [capacityRows]);

  const quarterFilterOptions = React.useMemo(() => {
    return quarters
      .slice()
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .map((q) => ({
        value: q.id,
        label: `${q.name} — ${ruDate(q.startDate)} → ${ruDate(q.endDate)}`,
      }));
  }, [quarters]);

  const handleQuarterFilterChange = React.useCallback(
    (ids: string[]) => {
      const existing = new Set(quarters.map((q) => q.id));
      const filtered = ids.filter((id) => existing.has(id));
      const unique = Array.from(new Set(filtered));
      if (!shallowStringArrayEqual(unique, selectedQuarterIds)) {
        dispatch(setCapacitySelectedQuarterIds(unique));
      }
    },
    [quarters, dispatch, selectedQuarterIds]
  );

  const getCell = React.useCallback(
    (pid: string, sid: string) => cellMap.get(`${pid}|${sid}`),
    [cellMap]
  );

  const rowTotals = React.useCallback(
    (p: Participant) => {
      let sumWork = 0;
      let sumAvail = 0;
      for (const s of displaySprints) {
        const cell = getCell(p.id, s.id);
        if (!cell) continue;
        sumWork += cell.workloadDays || 0;
        sumAvail += cell.availableDays || 0;
      }
      return { sumWork: round1(sumWork), sumAvail: round1(sumAvail) };
    },
    [displaySprints, getCell]
  );

  return (
    <Paper
      elevation={0}
      sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}
    >
      <>
        <Typography variant="h6">Нагрузка по спринтам</Typography>

          <FiltersPanel
            withPaper={false}
            containerSx={{ mb: 1 }}
            gridSx={{
              gridTemplateColumns: {
                xs: "repeat(auto-fit, minmax(240px, 1fr))",
                md: "repeat(auto-fit, minmax(260px, 1fr))",
              },
            }}
            filters={[
              {
                type: "autocomplete",
                key: "quarters",
                minWidth: 280,
                props: {
                  multiple: true,
                  allowCustom: false,
                  label: "Фильтр по кварталам",
                  options: quarterFilterOptions,
                  value: selectedQuarterIds,
                  onChange: handleQuarterFilterChange,
                },
              },
            ]}
          />

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
                        const cell = getCell(p.id, s.id);
                        const availRaw = cell?.availableDays ?? 0;
                        const workRaw = cell?.workloadDays ?? 0;
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
      </>
    </Paper>
  );
}

// helper just to format decimals with one fraction
function o(n: number) {
  return n.toFixed(1);
}
