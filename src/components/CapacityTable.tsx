import * as React from "react";
import { Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import moment from "moment";
import "moment/locale/ru";
import type { CapacityCell, CapacityRow, Participant, Sprint } from "../types";

moment.locale("ru");

const ruDate = (iso: string) => moment(iso, "YYYY-MM-DD", true).format("DD.MM.YYYY");
const round1 = (v: number) => Math.round(v * 10) / 10;

function cellColor(workload: number, available: number, capacityFactor: number): string {
  if (available === 0) {
    return workload > 0 ? "#ffebee" : "#e8f5e9";
  }
  const low = capacityFactor * available;
  const high = (2 - capacityFactor) * available;
  if (workload < low) return "#fff3e0";
  if (workload > high) return "#ffebee";
  return "#e8f5e9";
}

function formatFixedOne(value: number) {
  return value.toFixed(1);
}

type CapacityTableProps = {
  rows: CapacityRow[];
  sprints: Sprint[];
  emptyText?: string;
};

export default function CapacityTable({
  rows,
  sprints,
  emptyText = "Нет участников для отображения",
}: CapacityTableProps) {
  const participants = React.useMemo(() => rows.map((row) => row.participant), [rows]);

  const cellMap = React.useMemo(() => {
    const map = new Map<string, CapacityCell>();
    rows.forEach((row) => {
      row.cells.forEach((cell) => {
        map.set(`${row.participant.id}|${cell.sprintId}`, cell);
      });
    });
    return map;
  }, [rows]);

  const getCell = React.useCallback(
    (participantId: string, sprintId: string) => cellMap.get(`${participantId}|${sprintId}`),
    [cellMap]
  );

  const rowTotals = React.useCallback(
    (participant: Participant) => {
      let sumWork = 0;
      let sumAvail = 0;
      for (const sprint of sprints) {
        const cell = getCell(participant.id, sprint.id);
        if (!cell) continue;
        sumWork += cell.workloadDays || 0;
        sumAvail += cell.availableDays || 0;
      }
      return { sumWork: round1(sumWork), sumAvail: round1(sumAvail) };
    },
    [getCell, sprints]
  );

  return (
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
                zIndex: (theme) => theme.zIndex.appBar,
                backgroundColor: "background.paper",
                minWidth: 260,
              }}
            >
              Участник
            </TableCell>
            {sprints.map((sprint) => (
              <TableCell
                key={sprint.id}
                align="center"
                sx={{ minWidth: 140, whiteSpace: "nowrap" }}
              >
                <Box sx={{ fontWeight: 700 }}>
                  {ruDate(sprint.startDate)} — {ruDate(sprint.endDate)}
                </Box>
                <Box sx={{ color: "text.secondary" }}>{sprint.name}</Box>
              </TableCell>
            ))}
            <TableCell align="center" sx={{ minWidth: 140, fontWeight: 700 }}>
              Итого
            </TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {participants.map((participant) => {
            const totals = rowTotals(participant);
            return (
              <TableRow key={participant.id} hover>
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
                    <Chip size="small" label={participant.role || "—"} />
                    <Typography sx={{ fontWeight: 500 }}>{participant.fullName}</Typography>
                  </Box>
                </TableCell>

                {sprints.map((sprint) => {
                  const cell = getCell(participant.id, sprint.id);
                  const availRaw = cell?.availableDays ?? 0;
                  const workRaw = cell?.workloadDays ?? 0;
                  const capacityFactor = cell?.capacityFactor ?? 0.85;
                  const avail = round1(availRaw);
                  const work = round1(workRaw);
                  const bg = cellColor(workRaw, availRaw, capacityFactor);

                  return (
                    <TableCell
                      key={`${participant.id}-${sprint.id}`}
                      align="center"
                      sx={{ backgroundColor: bg }}
                      title={`Нагрузка: ${work.toFixed(1)} дн • Доступно: ${formatFixedOne(avail)} дн`}
                    >
                      {work.toFixed(1)} / {formatFixedOne(avail)}
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
                colSpan={sprints.length + 2}
                align="center"
                sx={{ color: "text.secondary" }}
              >
                {emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  );
}
