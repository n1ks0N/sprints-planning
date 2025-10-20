// src/views/CapacityPage.tsx
import * as React from "react";
import {
  Paper,
  Typography,
  Stack,
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  TextField,
  Button,
  Autocomplete,
  Divider,
} from "@mui/material";
import {
  useGetQuartersQuery,
  useGetSprintsQuery,
  useGetCapacityQuery,
  useUpsertRunVacationMutation,
  useBulkRunVacationMutation,
} from "../app/api";
import type { Quarter, Sprint, CapacityRow, CapacityCell } from "../types";

/** Небольшой хук-дебаунсер (без внешних зависимостей) */
function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
) {
  const cbRef = React.useRef(callback);
  React.useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  const timerRef = React.useRef<number | undefined>(undefined);

  return React.useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        cbRef.current(...args);
      }, delay);
    },
    [delay]
  );
}

/** Выделение всего значения инпута при фокусе/клике */
const selectAllOnFocus: React.FocusEventHandler<HTMLInputElement> = (e) => {
  const input = e.currentTarget;
  // после внутренних обработчиков MUI
  setTimeout(() => {
    try {
      input.select();
    } catch {}
  }, 0);
};
const selectAllOnMouseDown: React.MouseEventHandler<HTMLInputElement> = (e) => {
  const input = e.currentTarget;
  // Если инпут ещё не в фокусе — не даём браузеру поставить каретку в место клика
  if (document.activeElement !== input) {
    e.preventDefault();
    input.focus();
    try {
      input.select();
    } catch {}
  }
};

/** Редактор ячейки: локальное состояние + дебаунс + отправка пары значений */
function CellEditor({
  cell,
  onCommit, // (runDays, vacationNormDays) => Promise<void>
}: {
  cell: CapacityCell;
  onCommit: (runDays: number, vacationNormDays: number) => Promise<void>;
}) {
  // Локальные значения, чтобы не триггерить запрос на каждый кейдаун
  const [runVal, setRunVal] = React.useState<number>(cell.runDays);
  const [vacVal, setVacVal] = React.useState<number>(cell.vacationNormDays);

  // Синхронизация с сервером/кэшем при смене ячейки или внешнем апдейте
  const prevIds = React.useRef({ p: cell.participantId, s: cell.sprintId });
  React.useEffect(() => {
    const idChanged =
      prevIds.current.p !== cell.participantId ||
      prevIds.current.s !== cell.sprintId;
    prevIds.current = { p: cell.participantId, s: cell.sprintId };

    if (
      idChanged ||
      cell.runDays !== runVal ||
      cell.vacationNormDays !== vacVal
    ) {
      setRunVal(cell.runDays);
      setVacVal(cell.vacationNormDays);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.participantId, cell.sprintId, cell.runDays, cell.vacationNormDays]);

  // Дебаунс-commit пары значений
  const debouncedCommit = useDebouncedCallback(
    (nextRun: number, nextVac: number) => {
      // отправляем оба поля, чтобы не было «сброса» одного из них
      onCommit(nextRun, nextVac);
    },
    400
  );

  const onRunChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(0, Math.round(Number(e.target.value) || 0));
    setRunVal(v);
    debouncedCommit(v, vacVal);
  };

  const onVacChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(0, Math.round(Number(e.target.value) || 0));
    setVacVal(v);
    debouncedCommit(runVal, v);
  };

  return (
    <Stack spacing={0.5} alignItems="center">
      {/* Доступно / База — уже округлены на сервере */}
      <Box sx={{ fontSize: 13 }}>
        <b>{cell.availableDays}</b> / <b>{cell.baseCapacity}</b>
      </Box>

      {/* RUN и Отпуск — редактируем нормированные значения с дебаунсом */}
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          type="number"
          value={runVal}
          onChange={onRunChange}
          inputProps={{
            step: 1,
            min: 0,
            style: { width: 64 },
            onFocus: selectAllOnFocus,
            onMouseDown: selectAllOnMouseDown,
          }}
          label="RUN"
        />
        <TextField
          size="small"
          type="number"
          value={vacVal}
          onChange={onVacChange}
          inputProps={{
            step: 1,
            min: 0,
            style: { width: 64 },
            onFocus: selectAllOnFocus,
            onMouseDown: selectAllOnMouseDown,
          }}
          label="Отп"
        />
      </Stack>
    </Stack>
  );
}

export default function CapacityPage() {
  const { data: quarters = [] } = useGetQuartersQuery();
  const [quarterId, setQuarterId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!quarterId && quarters.length) setQuarterId(quarters[0].id);
  }, [quarters, quarterId]);

  const { data: sprints = [] } = useGetSprintsQuery(
    quarterId ? { quarterId } : (undefined as any)
  );
  const { data: rows = [] } = useGetCapacityQuery(
    quarterId ? { quarterId } : (null as any)
  );

  const [upsertRun] = useUpsertRunVacationMutation();
  const [bulkRun, { isLoading: bulkBusy }] = useBulkRunVacationMutation();

  // роли для фильтра/массового применения
  const roleOptions = React.useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.participant.role).filter(Boolean))),
    [rows]
  );

  // массовое редактирование RUN
  const [massDays, setMassDays] = React.useState<number>(2);
  const [massMultiplyByRate, setMassMultiplyByRate] =
    React.useState<boolean>(true);
  const [massRoles, setMassRoles] = React.useState<string[]>([]);

  const applyBulk = async () => {
    if (!quarterId) return;
    await bulkRun({
      quarterId,
      roles: massRoles.length ? massRoles : undefined,
      daysPerSprint: Number.isFinite(massDays) ? massDays : 0,
      multiplyByRate: massMultiplyByRate,
    }).unwrap();
  };

  // Коммит из ячейки: ВСЕГДА отправляем оба поля (фикс баг с «обнулением»)
  const commitCell = React.useCallback(
    async (
      participantId: string,
      sprintId: string,
      runDays: number,
      vacationNormDays: number
    ) => {
      await upsertRun({
        participantId,
        sprintId,
        runDays,
        vacationNormDays,
      }).unwrap();
    },
    [upsertRun]
  );

  return (
    <Paper elevation={0} sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Нагрузка по спринтам (нормировано × 0.75)
      </Typography>

      {/* выбор квартала */}
      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: "wrap" }}>
        <Autocomplete
          size="small"
          options={quarters}
          getOptionLabel={(q: Quarter) => q.name}
          value={quarters.find((q) => q.id === quarterId) || null}
          onChange={(_, v) => setQuarterId(v ? v.id : null)}
          renderInput={(params) => <TextField {...params} label="Квартал" />}
          sx={{ minWidth: 280 }}
        />
      </Stack>

      {/* массовое редактирование RUN */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems="center"
        >
          <Autocomplete
            multiple
            size="small"
            options={roleOptions}
            value={massRoles}
            onChange={(_, v) => setMassRoles(v)}
            renderInput={(p) => (
              <TextField {...p} label="Роли (по умолчанию — все)" />
            )}
            sx={{ minWidth: 260, flex: 1 }}
          />
          <TextField
            size="small"
            type="number"
            label="RUN, дней на спринт"
            value={massDays}
            onChange={(e) => setMassDays(Number(e.target.value))}
            InputProps={{ inputProps: { step: 0.25, min: 0 } }}
            sx={{ width: 200 }}
          />
          <Autocomplete
            size="small"
            options={["× ставка", "без учёта ставки"]}
            value={massMultiplyByRate ? "× ставка" : "без учёта ставки"}
            onChange={(_, v) => setMassMultiplyByRate(v === "× ставка")}
            renderInput={(p) => <TextField {...p} label="Множитель" />}
            sx={{ width: 200 }}
          />
          <Button
            variant="contained"
            disabled={!quarterId || bulkBusy}
            onClick={applyBulk}
          >
            Применить RUN массово
          </Button>
        </Stack>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Значение автоматически нормируется × 0.75 и округляется на сервере. «×
          ставка» — умножать заданные дни на ставку.
        </Typography>
      </Paper>

      {/* таблица */}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ minWidth: 260 }}>Участник</TableCell>
            {sprints.map((s: Sprint) => (
              <TableCell key={s.id} align="center">
                <Box sx={{ fontWeight: 700 }}>
                  {s.startDate} → {s.endDate}
                </Box>
                <Box sx={{ color: "text.secondary", fontSize: 12 }}>
                  {s.name}
                </Box>
              </TableCell>
            ))}
            <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
              Итого за квартал
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell />
            {sprints.map((s) => (
              <TableCell
                key={s.id}
                align="center"
                sx={{ color: "text.secondary" }}
              >
                Доступно / База / RUN / Отпуск
              </TableCell>
            ))}
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r: CapacityRow) => (
            <TableRow key={r.participant.id}>
              <TableCell>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography>{r.participant.fullName}</Typography>
                  <Chip label={r.participant.role || "—"} size="small" />
                  <Chip
                    label={`ставка ${r.participant.rate}`}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              </TableCell>
              {r.cells.map((cell) => (
                <TableCell key={cell.sprintId} align="center">
                  <CellEditor
                    cell={cell}
                    onCommit={(run, vac) =>
                      commitCell(cell.participantId, cell.sprintId, run, vac)
                    }
                  />
                </TableCell>
              ))}
              <TableCell align="right">
                <b>{r.totalQuarterAvailable}</b>
              </TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell
                colSpan={2 + sprints.length}
                align="center"
                sx={{ py: 3, color: "text.secondary" }}
              >
                Нет данных. Добавьте квартал/спринты и участников.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary">
        Все значения в таблице — нормированные (× 0.75). «Доступно / База» —
        округлены до целых.
      </Typography>
    </Paper>
  );
}
