import * as React from "react";
import {
  Alert,
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from "@mui/material";
import type { PlanningDemand, PlanningWorkbenchItem } from "../types";
import { formatDayAmount, normalizeDayAmount } from "../utils/dayAmount";

const getPlanningDemands = (item: PlanningWorkbenchItem): PlanningDemand[] =>
  item.planningDemands || [];

type SprintLoadSummary = {
  label: string;
  days: number;
};

type Props = {
  item: PlanningWorkbenchItem;
  releaseLabel?: string | null;
  participantNameById: Map<string, string>;
  issues?: string[];
  totalDays?: number;
  actionSlot?: React.ReactNode;
  sprintLoads?: SprintLoadSummary[];
};

export default function PlanningWorkbenchItemCard({
  item,
  releaseLabel,
  participantNameById,
  issues = [],
  totalDays,
  actionSlot,
  sprintLoads = [],
}: Props) {
  const planningDemands = getPlanningDemands(item);
  const totalEstimateDays =
    totalDays
    ?? planningDemands.reduce((sum, demand) => sum + normalizeDayAmount(demand.days), 0);
  const customersLabel = item.customers?.filter(Boolean).join(", ");
  const streamsLabel = item.streams?.filter(Boolean).join(", ");

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid={`planning-item-${item.id}`}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {item.title}
            </Typography>
            <Chip
              label={item.priority}
              size="small"
              color="default"
              sx={{
                bgcolor: "grey.200",
                color: "text.primary",
                borderColor: "grey.300",
              }}
            />
            <Chip label={`${totalEstimateDays} дн.`} size="small" variant="outlined" />
          </Stack>
          {actionSlot ? <Stack direction="row" spacing={1}>{actionSlot}</Stack> : null}
        </Stack>

        {item.description && <Typography variant="body2">{item.description}</Typography>}
        {item.dod && <Typography variant="caption">DoD: {item.dod}</Typography>}

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {releaseLabel && <Chip label={`Релиз: ${releaseLabel}`} size="small" variant="outlined" />}
          {customersLabel && (
            <Chip label={`Заказчик: ${customersLabel}`} size="small" variant="outlined" />
          )}
          {streamsLabel && (
            <Chip label={`Стрим: ${streamsLabel}`} size="small" variant="outlined" />
          )}
        </Stack>

        {planningDemands.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableBody>
                <TableRow>
                  {planningDemands.map((demand, index) => (
                    <TableCell key={`${item.id}-demand-label-${index}`} sx={{ fontWeight: 600 }}>
                      {demand.kind === "ROLE"
                        ? demand.role || "Роль не указана"
                        : participantNameById.get(demand.participantId || "") || "Участник не указан"}
                      {demand.stream ? ` / ${demand.stream}` : ""}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  {planningDemands.map((demand, index) => (
                    <TableCell key={`${item.id}-demand-days-${index}`}>
                      {formatDayAmount(demand.days)} дн.                    
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {planningDemands.length > 0 && sprintLoads.length > 0 && <Divider />}

        {sprintLoads.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Нагрузка по спринтам после публикации
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 0.5 }}>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    {sprintLoads.map((load) => (
                      <TableCell key={`${item.id}-sprint-label-${load.label}`} sx={{ fontWeight: 600 }}>
                        {load.label}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    {sprintLoads.map((load) => (
                      <TableCell key={`${item.id}-sprint-days-${load.label}`}>
                        {formatDayAmount(load.days)} дн.
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {issues.length > 0 && (
          <Alert severity="warning" sx={{ py: 0 }}>
            Для автораспределения нужно добить: {issues.join(", ")}.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
