// src/views/TimeSetupPage.tsx
import * as React from "react";
import {
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  Stack,
  Box,
  Alert,
  IconButton,
  Tooltip,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import {
  LocalizationProvider,
  DatePicker,
  type DatePickerSlotProps,
} from "@mui/x-date-pickers";
import { ruRU } from "@mui/x-date-pickers/locales";
import { AdapterMoment } from "@mui/x-date-pickers/AdapterMoment";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import moment from "moment";
import "moment/locale/ru";
import {
  useGetQuartersQuery,
  useAddQuarterMutation,
  useUpdateQuarterMutation,
  useDeleteQuarterMutation,
  useGetSprintsQuery,
  useAddSprintMutation,
  useUpdateSprintMutation,
  useDeleteSprintMutation,
} from "../app/api";
import type { Quarter, Sprint } from "../types";
import FilterAutocomplete from "../components/filters/FilterAutocomplete";
import { useAppDispatch, useAppSelector } from "./hooks";
import { setTimeSelectedQuarterIds } from "../app/uiSlice";

moment.locale("ru");

const fmt = "YYYY-MM-DD";
const iso = (d: moment.Moment) => d.format(fmt);
const parseISO = (s: string) => moment(s, fmt, true);
const nextDay = (d: moment.Moment) => d.clone().add(1, "day");
const addDays = (d: moment.Moment, n: number) => d.clone().add(n, "day");
const addMonths = (d: moment.Moment, n: number) => d.clone().add(n, "month");
const quarterOfMonth0 = (m0: number) =>
  (Math.floor(m0 / 3) + 1) as 1 | 2 | 3 | 4;
const fmtRU = (isoDate: string) => moment(isoDate, fmt).format("DD.MM.YYYY");
const toPickerValue = (isoDate?: string | null) =>
  isoDate ? parseISO(isoDate) : null;
const desktopPickerMedia = "(min-width: 0px)";
const workingDaysInclusive = (startISO: string, endISO: string) => {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (!start.isValid() || !end.isValid() || start.isAfter(end, "day")) return 0;
  let days = 0;
  const cur = start.clone();
  while (!cur.isAfter(end, "day")) {
    const dow = cur.day();
    if (dow !== 0 && dow !== 6) {
      days += 1;
    }
    cur.add(1, "day");
  }
  return days;
};

const pickerSlotProps = (opts?: { error?: boolean }) =>
  ({
    textField: {
      fullWidth: true,
      size: "small",
      error: !!opts?.error,
      InputLabelProps: { shrink: true },
      sx: {
        "& .MuiInputBase-input": {
          fontSize: "0.9rem",
          py: 1,
        },
      },
    },
    openPickerButton: {
      size: "small",
      sx: { fontSize: "1.1rem", pr: 0.5 },
    },
    actionBar: { actions: ["clear"] as const },
  } satisfies DatePickerSlotProps<false>);

function shallowStringArrayEqual(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const LS_HIDE_PAST = "timeSetup.hidePast";

const rangesOverlap = (
  aS: moment.Moment,
  aE: moment.Moment,
  bS: moment.Moment,
  bE: moment.Moment
) => !(aE.isBefore(bS, "day") || aS.isAfter(bE, "day"));

function calcNextQuarterDefaults(quarters: Quarter[]) {
  const sorted = [...quarters].sort((a, b) =>
    a.endDate.localeCompare(b.endDate)
  );
  const lastEnd = sorted.length
    ? parseISO(sorted[sorted.length - 1].endDate)
    : null;
  const start = lastEnd ? nextDay(lastEnd) : moment().startOf("year");
  const end = addDays(addMonths(start, 3), -1);
  const year = start.year();
  const number = quarterOfMonth0(start.month());
  const name = `Q${number} ${year}`;
  return { startISO: iso(start), endISO: iso(end), year, number, name };
}

function calcNextSprintDefaults(quarter: Quarter, allSprints: Sprint[]) {
  const qSprints = allSprints
    .filter((s) => s.quarterId === quarter.id)
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  const lastEnd = qSprints.length
    ? parseISO(qSprints[qSprints.length - 1].endDate)
    : null;

  const qStart = parseISO(quarter.startDate);
  const qEnd = parseISO(quarter.endDate);

  const start = lastEnd ? nextDay(lastEnd) : qStart.clone();
  const end = addDays(start, 20);
  const finalEnd = end.isAfter(qEnd, "day") ? qEnd.clone() : end;

  const name = `Sprint ${qSprints.length + 1}`;
  return { startISO: iso(start), endISO: iso(finalEnd), name };
}

export default function TimeSetupPage() {
  const { data: quarters = [] } = useGetQuartersQuery();
  const { data: allSprints = [] } = useGetSprintsQuery(undefined);

  const [addQuarter, { isLoading: addingQuarter }] = useAddQuarterMutation();
  const [updateQuarter] = useUpdateQuarterMutation();
  const [deleteQuarter] = useDeleteQuarterMutation();

  const [addSprint, { isLoading: addingSprint }] = useAddSprintMutation();
  const [updateSprint] = useUpdateSprintMutation();
  const [deleteSprint] = useDeleteSprintMutation();

  const dispatch = useAppDispatch();
  const selectedQuarterIds = useAppSelector(
    (state) => state.ui.time.selectedQuarterIds
  );
  const [hidePast, setHidePast] = React.useState<boolean>(() => {
    try {
      const hpRaw = localStorage.getItem(LS_HIDE_PAST);
      if (hpRaw === null) return true;
      return hpRaw === "true";
    } catch {
      return true;
    }
  });

  React.useEffect(() => {
    if (!quarters.length) return;
    const actualIds = new Set(quarters.map((q) => q.id));
    const filtered = selectedQuarterIds.filter((id) => actualIds.has(id));
    const unique = Array.from(new Set(filtered));
    if (!shallowStringArrayEqual(unique, selectedQuarterIds)) {
      dispatch(setTimeSelectedQuarterIds(unique));
    }
  }, [quarters, selectedQuarterIds, dispatch]);

  const onToggleHidePast = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked;
    setHidePast(next);
    try {
      localStorage.setItem(LS_HIDE_PAST, String(next));
    } catch {}
  };

  const handleQuarterFilterChange = React.useCallback(
    (ids: string[]) => {
      const existing = new Set(quarters.map((q) => q.id));
      const filtered = ids.filter((id) => existing.has(id));
      const unique = Array.from(new Set(filtered));
      if (!shallowStringArrayEqual(unique, selectedQuarterIds)) {
        dispatch(setTimeSelectedQuarterIds(unique));
      }
    },
    [quarters, selectedQuarterIds, dispatch]
  );

  const [openSprintForQuarterId, setOpenSprintForQuarterId] = React.useState<
    string | null
  >(null);
  const [sName, setSName] = React.useState<string>("");
  const [sStart, setSStart] = React.useState<string>("");
  const [sEnd, setSEnd] = React.useState<string>("");
  const [sWorkingDays, setSWorkingDays] = React.useState<number>(0);
  const [sWorkingDaysDirty, setSWorkingDaysDirty] = React.useState<boolean>(false);
  const [sError, setSError] = React.useState<string>("");

  const [openQuarterRow, setOpenQuarterRow] = React.useState<boolean>(false);
  const [qStart, setQStart] = React.useState<string>("");
  const [qEnd, setQEnd] = React.useState<string>("");
  const [qName, setQName] = React.useState<string>("");
  const [qError, setQError] = React.useState<string>("");

  const [editingQuarterId, setEditingQuarterId] = React.useState<string | null>(
    null
  );
  const [qEditStart, setQEditStart] = React.useState<string>("");
  const [qEditEnd, setQEditEnd] = React.useState<string>("");
  const [qEditError, setQEditError] = React.useState<string>("");

  const [editingSprintId, setEditingSprintId] = React.useState<string | null>(
    null
  );
  const skipFirstEditWorkingDays = React.useRef<boolean>(false);
  const [sEditName, setSEditName] = React.useState<string>("");
  const [sEditStart, setSEditStart] = React.useState<string>("");
  const [sEditEnd, setSEditEnd] = React.useState<string>("");
  const [sEditWorkingDays, setSEditWorkingDays] = React.useState<number>(0);
  const [sEditWorkingDaysDirty, setSEditWorkingDaysDirty] =
    React.useState<boolean>(false);
  const [sEditError, setSEditError] = React.useState<string>("");

  const quartersById = React.useMemo(() => {
    const m = new Map<string, Quarter>();
    quarters.forEach((q) => m.set(q.id, q));
    return m;
  }, [quarters]);

  const sortedQuarters = React.useMemo(
    () => quarters.slice().sort((a, b) => a.endDate.localeCompare(b.endDate)),
    [quarters]
  );

  const quarterFilterOptions = React.useMemo(
    () =>
      sortedQuarters.map((q) => ({
        value: q.id,
        label: `${q.name} — ${fmtRU(q.startDate)} → ${fmtRU(q.endDate)}`,
      })),
    [sortedQuarters]
  );

  const sprintsByQuarter = React.useMemo(() => {
    const map = new Map<string, Sprint[]>();
    for (const s of allSprints) {
      if (!map.has(s.quarterId)) map.set(s.quarterId, []);
      map.get(s.quarterId)!.push(s);
    }
    for (const [qid, arr] of map) {
      map.set(
        qid,
        arr.slice().sort((a, b) => a.endDate.localeCompare(b.endDate))
      );
    }
    return map;
  }, [allSprints]);

  const visibleQuarters = React.useMemo(() => {
    const base =
      selectedQuarterIds.length === 0
        ? sortedQuarters
        : sortedQuarters.filter((q) => selectedQuarterIds.includes(q.id));
    if (!hidePast) return base;
    const today = moment().startOf("day");
    return base.filter((q) => !today.isAfter(parseISO(q.endDate), "day"));
  }, [sortedQuarters, selectedQuarterIds, hidePast]);

  const openAddSprint = (quarterId: string) => {
    const q = quartersById.get(quarterId);
    if (!q) return;
    const d = calcNextSprintDefaults(q, allSprints);
    setOpenSprintForQuarterId(quarterId);
    setSName(d.name);
    setSStart(d.startISO);
    setSEnd(d.endISO);
    setSWorkingDays(workingDaysInclusive(d.startISO, d.endISO));
    setSWorkingDaysDirty(false);
    setSError("");
  };

  const openAddQuarter = () => {
    const d = calcNextQuarterDefaults(quarters);
    setOpenQuarterRow(true);
    setQStart(d.startISO);
    setQEnd(d.endISO);
    setQName(d.name);
    setQError("");
  };

  React.useEffect(() => {
    if (!openSprintForQuarterId || !sStart || !sEnd) {
      setSError("");
      return;
    }
    const start = parseISO(sStart);
    const end = parseISO(sEnd);
    if (!start.isValid() || !end.isValid()) {
      setSError("Неверная дата.");
      return;
    }
    if (end.isBefore(start, "day")) {
      setSError("Дата окончания раньше даты начала.");
      return;
    }
    const q = quartersById.get(openSprintForQuarterId);
    if (!q) {
      setSError("Не выбран квартал.");
      return;
    }
    const qS = parseISO(q.startDate);
    const qE = parseISO(q.endDate);
    if (start.isBefore(qS, "day") || end.isAfter(qE, "day")) {
      setSError(
        `Спринт выходит за границы квартала (${fmtRU(q.startDate)} → ${fmtRU(
          q.endDate
        )}).`
      );
      return;
    }
    const current = sprintsByQuarter.get(openSprintForQuarterId) ?? [];
    const overlaps = current.filter((s) =>
      rangesOverlap(start, end, parseISO(s.startDate), parseISO(s.endDate))
    );
    if (overlaps.length) {
      setSError(
        `Пересечение со спринтами: ${overlaps
          .map((s) => `${s.name} (${fmtRU(s.startDate)} → ${fmtRU(s.endDate)})`)
          .join(", ")}`
      );
      return;
    }
    setSError("");
  }, [openSprintForQuarterId, sStart, sEnd, quartersById, sprintsByQuarter]);

  React.useEffect(() => {
    if (!sWorkingDaysDirty && sStart && sEnd && !sError) {
      setSWorkingDays(workingDaysInclusive(sStart, sEnd));
    }
  }, [sStart, sEnd, sError, sWorkingDaysDirty]);

  React.useEffect(() => {
    if (!openQuarterRow || !qStart || !qEnd) {
      setQError("");
      return;
    }
    const start = parseISO(qStart);
    const end = parseISO(qEnd);
    if (!start.isValid() || !end.isValid()) {
      setQError("Неверная дата.");
      return;
    }
    if (end.isBefore(start, "day")) {
      setQError("Дата окончания раньше даты начала.");
      return;
    }
    const overlaps = quarters.filter((q) =>
      rangesOverlap(start, end, parseISO(q.startDate), parseISO(q.endDate))
    );
    if (overlaps.length) {
      setQError(
        `Пересечение со кварталом: ${overlaps
          .map((q) => `${q.name} (${fmtRU(q.startDate)} → ${fmtRU(q.endDate)})`)
          .join(", ")}`
      );
      return;
    }
    setQError("");
  }, [openQuarterRow, qStart, qEnd, quarters]);

  React.useEffect(() => {
    if (!editingSprintId || !sEditStart || !sEditEnd) {
      setSEditError("");
      return;
    }
    const s = allSprints.find((x) => x.id === editingSprintId);
    if (!s) {
      setSEditError("");
      return;
    }
    const q = quartersById.get(s.quarterId);
    if (!q) {
      setSEditError("Не найден квартал.");
      return;
    }
    const start = parseISO(sEditStart);
    const end = parseISO(sEditEnd);
    if (!start.isValid() || !end.isValid()) {
      setSEditError("Неверная дата.");
      return;
    }
    if (end.isBefore(start, "day")) {
      setSEditError("Дата окончания раньше даты начала.");
      return;
    }
    const qS = parseISO(q.startDate);
    const qE = parseISO(q.endDate);
    if (start.isBefore(qS, "day") || end.isAfter(qE, "day")) {
      setSEditError(
        `Спринт выходит за границы квартала (${fmtRU(q.startDate)} → ${fmtRU(
          q.endDate
        )}).`
      );
      return;
    }
    const others = (sprintsByQuarter.get(q.id) ?? []).filter(
      (x) => x.id !== s.id
    );
    const overlaps = others.filter((o) =>
      rangesOverlap(start, end, parseISO(o.startDate), parseISO(o.endDate))
    );
    if (overlaps.length) {
      setSEditError(
        `Пересечение со спринтами: ${overlaps
          .map((o) => `${o.name} (${fmtRU(o.startDate)} → ${fmtRU(o.endDate)})`)
          .join(", ")}`
      );
      return;
    }
    setSEditError("");
  }, [
    editingSprintId,
    sEditStart,
    sEditEnd,
    allSprints,
    quartersById,
    sprintsByQuarter,
  ]);

  React.useEffect(() => {
    if (skipFirstEditWorkingDays.current) {
      skipFirstEditWorkingDays.current = false;
      return;
    }
    if (!sEditWorkingDaysDirty && sEditStart && sEditEnd && !sEditError) {
      setSEditWorkingDays(workingDaysInclusive(sEditStart, sEditEnd));
    }
  }, [sEditStart, sEditEnd, sEditError, sEditWorkingDaysDirty]);

  React.useEffect(() => {
    if (!editingQuarterId || !qEditStart || !qEditEnd) {
      setQEditError("");
      return;
    }
    const start = parseISO(qEditStart);
    const end = parseISO(qEditEnd);
    if (!start.isValid() || !end.isValid()) {
      setQEditError("Неверная дата.");
      return;
    }
    if (end.isBefore(start, "day")) {
      setQEditError("Дата окончания раньше даты начала.");
      return;
    }
    const overlaps = quarters
      .filter((q) => q.id !== editingQuarterId)
      .filter((q) =>
        rangesOverlap(start, end, parseISO(q.startDate), parseISO(q.endDate))
      );
    if (overlaps.length) {
      setQEditError(
        `Пересечение со кварталом: ${overlaps
          .map((q) => `${q.name} (${fmtRU(q.startDate)} → ${fmtRU(q.endDate)})`)
          .join(", ")}`
      );
      return;
    }
    setQEditError("");
  }, [editingQuarterId, qEditStart, qEditEnd, quarters]);

  const submitSprint = async () => {
    if (!openSprintForQuarterId || !sStart || !sEnd || sError) return;
    const qid = openSprintForQuarterId;
    const count = (sprintsByQuarter.get(qid)?.length ?? 0) + 1;
    const name = sName.trim() || `Sprint ${count}`;
    const workingDays = sWorkingDays || workingDaysInclusive(sStart, sEnd);

    await addSprint({
      quarterId: qid,
      name,
      startDate: sStart,
      endDate: sEnd,
      workingDays,
    }).unwrap();

    const q = quartersById.get(qid)!;
    const next = calcNextSprintDefaults(
      q,
      allSprints.concat([
        {
          id: "tmp",
          quarterId: qid,
          name,
          startDate: sStart,
          endDate: sEnd,
          workingDays: 0,
          order: count,
        } as Sprint,
      ])
    );
    setSName(next.name);
    setSStart(next.startISO);
    setSEnd(next.endISO);
    setSError("");
  };

  const submitQuarter = async () => {
    if (!openQuarterRow || !qStart || !qEnd || qError) return;

    const start = parseISO(qStart);
    const year = start.year();
    const number = quarterOfMonth0(start.month());
    const autoName = `Q${number} ${year}`;
    const name = qName.trim() || autoName;

    const created = (await addQuarter({
      year,
      number,
      name,
      startDate: qStart,
      endDate: qEnd,
    }).unwrap()) as Quarter;

    if (selectedQuarterIds.length > 0) {
      const set = new Set(selectedQuarterIds);
      if (!set.has(created.id)) {
        dispatch(
          setTimeSelectedQuarterIds([...selectedQuarterIds, created.id])
        );
      }
    }

    const next = calcNextQuarterDefaults(
      quarters.concat([
        {
          id: "tmp",
          year,
          number,
          name,
          startDate: qStart,
          endDate: qEnd,
        } as Quarter,
      ])
    );
    setQStart(next.startISO);
    setQEnd(next.endISO);
    setQName(next.name);
    setQError("");
  };

  const startEditQuarter = (q: Quarter) => {
    setEditingQuarterId(q.id);
    setQEditStart(q.startDate);
    setQEditEnd(q.endDate);
    setQEditError("");
  };
  const cancelEditQuarter = () => {
    setEditingQuarterId(null);
    setQEditStart("");
    setQEditEnd("");
    setQEditError("");
  };
  const saveEditQuarter = async () => {
    if (!editingQuarterId || !qEditStart || !qEditEnd || qEditError) return;

    const start = parseISO(qEditStart);
    const year = start.year();
    const number = quarterOfMonth0(start.month());
    const newName = `Q${number} ${year}`;

    await updateQuarter({
      id: editingQuarterId,
      startDate: qEditStart,
      endDate: qEditEnd,
      year,
      number,
      name: newName,
    }).unwrap();

    cancelEditQuarter();
  };
  const removeQuarter = async (id: string) => {
    if (!window.confirm("Удалить квартал и все его спринты?")) return;
    await deleteQuarter({ id }).unwrap();
    if (selectedQuarterIds.includes(id)) {
      dispatch(
        setTimeSelectedQuarterIds(
          selectedQuarterIds.filter((qid) => qid !== id)
        )
      );
    }
  };

  const startEditSprint = (s: Sprint) => {
    setEditingSprintId(s.id);
    setSEditName(s.name);
    setSEditStart(s.startDate);
    setSEditEnd(s.endDate);
    setSEditWorkingDays(s.workingDays);
    skipFirstEditWorkingDays.current = true;
    setSEditWorkingDaysDirty(false);
    setSEditError("");
  };
  const cancelEditSprint = () => {
    setEditingSprintId(null);
    setSEditName("");
    setSEditStart("");
    setSEditEnd("");
    setSEditWorkingDays(0);
    setSEditWorkingDaysDirty(false);
    setSEditError("");
  };
  const saveEditSprint = async () => {
    if (!editingSprintId || !sEditStart || !sEditEnd || sEditError) return;
    const name = sEditName?.trim() || undefined;
    const workingDays =
      sEditWorkingDays || workingDaysInclusive(sEditStart, sEditEnd);
    await updateSprint({
      id: editingSprintId,
      name,
      startDate: sEditStart,
      endDate: sEditEnd,
      workingDays,
    }).unwrap();
    cancelEditSprint();
  };
  const removeSprint = async (id: string) => {
    if (!window.confirm("Удалить спринт?")) return;
    await deleteSprint({ id }).unwrap();
  };

  const CARD_W = 320;

  const renderSprintCard = (s: Sprint, indexInQuarter: number) => {
    const isEditing = editingSprintId === s.id;
    return (
      <Paper
        key={s.id}
        variant="outlined"
        sx={{ p: 2, width: CARD_W, flex: "0 0 auto", position: "relative" }}
      >
        {!isEditing ? (
          <>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 0.5 }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {fmtRU(s.startDate)} → {fmtRU(s.endDate)}
              </Typography>
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="Редактировать">
                  <IconButton size="small" onClick={() => startEditSprint(s)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Удалить">
                  <IconButton size="small" onClick={() => removeSprint(s.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {s.name || `Sprint ${indexInQuarter + 1}`}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Рабочих дней: <b>{s.workingDays}</b>
            </Typography>
          </>
        ) : (
          <Box sx={{ width: "100%" }}>
            <TextField
              fullWidth
              size="small"
              label="Название (опционально)"
              value={sEditName}
              onChange={(e) => setSEditName(e.target.value)}
              placeholder="Авто: Sprint N"
              sx={{ mb: 1 }}
            />
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <DatePicker
                  label="Дата начала"
                  value={toPickerValue(sEditStart)}
                  onChange={(newValue) =>
                    setSEditStart(newValue && newValue.isValid() ? iso(newValue) : "")
                  }
                  format="DD.MM.YYYY"
                  desktopModeMediaQuery={desktopPickerMedia}
                  enableAccessibleFieldDOMStructure={false}
                  slotProps={pickerSlotProps({ error: !!sEditError })}
                />
              </Grid>
              <Grid item xs={6}>
                <DatePicker
                  label="Дата окончания"
                  value={toPickerValue(sEditEnd)}
                  onChange={(newValue) =>
                    setSEditEnd(newValue && newValue.isValid() ? iso(newValue) : "")
                  }
                  format="DD.MM.YYYY"
                  desktopModeMediaQuery={desktopPickerMedia}
                  enableAccessibleFieldDOMStructure={false}
                  slotProps={pickerSlotProps({ error: !!sEditError })}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Рабочих дней"
                  value={sEditWorkingDays}
                  onChange={(e) => {
                    setSEditWorkingDays(Number(e.target.value) || 0);
                    setSEditWorkingDaysDirty(true);
                  }}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: 0 }}
                />
              </Grid>
              <Grid
                item
                xs={12}
                sx={{
                  display: "flex",
                  gap: 1,
                  justifyContent: "flex-end",
                  mt: 0.5,
                }}
              >
                <Button
                  variant="outlined"
                  startIcon={<CloseIcon />}
                  onClick={cancelEditSprint}
                >
                  Отмена
                </Button>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={saveEditSprint}
                  disabled={!!sEditError || !sEditStart || !sEditEnd}
                >
                  Сохранить
                </Button>
              </Grid>
            </Grid>
            {sEditError && (
              <Box sx={{ mt: 1 }}>
                <Alert severity="error">{sEditError}</Alert>
              </Box>
            )}
          </Box>
        )}
      </Paper>
    );
  };

  const renderAddSprintCell = (q: Quarter) => {
    const isOpen = openSprintForQuarterId === q.id;

    return (
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          width: CARD_W,
          flex: "0 0 auto",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          borderStyle: isOpen ? "solid" : "dashed",
        }}
      >
        {!isOpen ? (
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Button
              startIcon={<AddIcon />}
              onClick={() => openAddSprint(q.id)}
              sx={{ fontWeight: 700 }}
            >
              Добавить спринт
            </Button>
          </Box>
        ) : (
          <Box sx={{ width: "100%" }}>
            <TextField
              fullWidth
              size="small"
              label="Название (опционально)"
              value={sName}
              onChange={(e) => setSName(e.target.value)}
              placeholder="Авто: Sprint N"
              sx={{ mb: 1 }}
            />
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <DatePicker
                  label="Дата начала"
                  value={toPickerValue(sStart)}
                  onChange={(newValue) =>
                    setSStart(newValue && newValue.isValid() ? iso(newValue) : "")
                  }
                  format="DD.MM.YYYY"
                  desktopModeMediaQuery={desktopPickerMedia}
                  enableAccessibleFieldDOMStructure={false}
                  slotProps={pickerSlotProps({ error: !!sError })}
                />
              </Grid>
              <Grid item xs={6}>
                <DatePicker
                  label="Дата окончания"
                  value={toPickerValue(sEnd)}
                  onChange={(newValue) =>
                    setSEnd(newValue && newValue.isValid() ? iso(newValue) : "")
                  }
                  format="DD.MM.YYYY"
                  desktopModeMediaQuery={desktopPickerMedia}
                  enableAccessibleFieldDOMStructure={false}
                  slotProps={pickerSlotProps({ error: !!sError })}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Рабочих дней"
                  value={sWorkingDays}
                  onChange={(e) => {
                    setSWorkingDays(Number(e.target.value) || 0);
                    setSWorkingDaysDirty(true);
                  }}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: 0 }}
                />
              </Grid>
              <Grid
                item
                xs={12}
                sx={{
                  display: "flex",
                  gap: 1,
                  justifyContent: "flex-end",
                  mt: 0.5,
                }}
              >
                <Button
                  variant="outlined"
                  onClick={() => setOpenSprintForQuarterId(null)}
                >
                  Отмена
                </Button>
                <Button
                  variant="contained"
                  onClick={submitSprint}
                  disabled={addingSprint || !!sError || !sStart || !sEnd}
                >
                  Сохранить
                </Button>
              </Grid>
            </Grid>
            {sError && (
              <Box sx={{ mt: 1 }}>
                <Alert severity="error">{sError}</Alert>
              </Box>
            )}
          </Box>
        )}
      </Paper>
    );
  };

  const renderQuarterRow = (q: Quarter) => {
    const sprints = (sprintsByQuarter.get(q.id) ?? []).slice(); // уже отсортированы по endDate
    const isEditing = editingQuarterId === q.id;

    return (
      <Paper key={q.id} variant="outlined" sx={{ p: 2 }}>
        {!isEditing ? (
          <>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {q.name} — {fmtRU(q.startDate)} → {fmtRU(q.endDate)}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Tooltip title="Редактировать квартал">
                  <IconButton size="small" onClick={() => startEditQuarter(q)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Удалить квартал">
                  <IconButton size="small" onClick={() => removeQuarter(q.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          </>
        ) : (
          <Box sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Редактирование квартала
            </Typography>
            <Grid container spacing={1} alignItems="center">
              <Grid item xs={6} md={3}>
                <DatePicker
                  label="Дата начала"
                  value={toPickerValue(qEditStart)}
                  onChange={(newValue) =>
                    setQEditStart(newValue && newValue.isValid() ? iso(newValue) : "")
                  }
                  format="DD.MM.YYYY"
                  desktopModeMediaQuery={desktopPickerMedia}
                  enableAccessibleFieldDOMStructure={false}
                  slotProps={pickerSlotProps({ error: !!qEditError })}
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <DatePicker
                  label="Дата окончания"
                  value={toPickerValue(qEditEnd)}
                  onChange={(newValue) =>
                    setQEditEnd(newValue && newValue.isValid() ? iso(newValue) : "")
                  }
                  format="DD.MM.YYYY"
                  desktopModeMediaQuery={desktopPickerMedia}
                  enableAccessibleFieldDOMStructure={false}
                  slotProps={pickerSlotProps({ error: !!qEditError })}
                />
              </Grid>
              <Grid
                item
                xs={12}
                md={6}
                sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}
              >
                <Button
                  variant="outlined"
                  startIcon={<CloseIcon />}
                  onClick={cancelEditQuarter}
                >
                  Отмена
                </Button>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={saveEditQuarter}
                  disabled={!!qEditError || !qEditStart || !qEditEnd}
                >
                  Сохранить
                </Button>
              </Grid>
            </Grid>
            {qEditError && (
              <Box sx={{ mt: 1 }}>
                <Alert severity="error">{qEditError}</Alert>
              </Box>
            )}
          </Box>
        )}

        <Box
          sx={{
            display: "flex",
            flexWrap: "nowrap",
            gap: 2,
            overflowX: "auto",
            pb: 1,
          }}
        >
          {sprints.map((s, i) => renderSprintCard(s, i))}
          {renderAddSprintCell(q)}
        </Box>
      </Paper>
    );
  };

  return (
    <LocalizationProvider
      dateAdapter={AdapterMoment}
      adapterLocale="ru"
      localeText={ruRU.components.MuiLocalizationProvider.defaultProps.localeText}
    >
      <Paper elevation={0} sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Кварталы и спринты
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
            options={quarterFilterOptions}
            value={selectedQuarterIds}
            onChange={handleQuarterFilterChange}
            sx={{ minWidth: 280, flex: 1 }}
          />

          <FormControlLabel
            control={<Checkbox checked={hidePast} onChange={onToggleHidePast} />}
            label="Скрыть прошедшие"
            sx={{ whiteSpace: "nowrap" }}
          />
        </Stack>

        <Stack spacing={2}>
          {visibleQuarters.map((q) => renderQuarterRow(q))}

          <Paper variant="outlined" sx={{ p: 2 }}>
            {!openQuarterRow ? (
              <Box
                sx={{
                  p: 2,
                  border: "2px dashed #cbd5e1",
                  borderRadius: 2,
                  textAlign: "center",
                }}
              >
                <Button
                  startIcon={<AddIcon />}
                  onClick={openAddQuarter}
                  sx={{ fontWeight: 700 }}
                >
                  Добавить квартал
                </Button>
              </Box>
            ) : (
              <Box>
                <Grid container spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Название квартала"
                      value={qName}
                      onChange={(e) => setQName(e.target.value)}
                      placeholder="Например: Q4 2025"
                    />
                  </Grid>
                </Grid>

                <Grid container spacing={1} alignItems="center">
                  <Grid item xs={6} md={3}>
                    <DatePicker
                      label="Дата начала"
                      value={toPickerValue(qStart)}
                      onChange={(newValue) =>
                        setQStart(newValue && newValue.isValid() ? iso(newValue) : "")
                      }
                      format="DD.MM.YYYY"
                      desktopModeMediaQuery={desktopPickerMedia}
                      enableAccessibleFieldDOMStructure={false}
                      slotProps={pickerSlotProps({ error: !!qError })}
                    />
                </Grid>
                <Grid item xs={6} md={3}>
                    <DatePicker
                      label="Дата окончания"
                      value={toPickerValue(qEnd)}
                      onChange={(newValue) =>
                        setQEnd(newValue && newValue.isValid() ? iso(newValue) : "")
                      }
                      format="DD.MM.YYYY"
                      desktopModeMediaQuery={desktopPickerMedia}
                      enableAccessibleFieldDOMStructure={false}
                      slotProps={pickerSlotProps({ error: !!qError })}
                    />
                </Grid>
                  <Grid
                    item
                    xs={12}
                    md={6}
                    sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}
                  >
                    <Button
                      variant="outlined"
                      onClick={() => setOpenQuarterRow(false)}
                    >
                      Отмена
                    </Button>
                    <Button
                      variant="contained"
                      onClick={submitQuarter}
                      disabled={addingQuarter || !!qError || !qStart || !qEnd}
                    >
                      Сохранить
                    </Button>
                  </Grid>
                </Grid>

                {qError && (
                  <Box sx={{ mt: 1 }}>
                    <Alert severity="error">{qError}</Alert>
                  </Box>
                )}
              </Box>
            )}
          </Paper>
        </Stack>
      </Paper>
    </LocalizationProvider>
  );
}
