import * as React from "react";
import {
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  MenuItem,
  Stack,
  Box,
  Alert,
  Chip,
  Select,
  SelectChangeEvent,
  InputLabel,
  FormControl,
  OutlinedInput,
  IconButton,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import moment from "moment";
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

/** utils */
const fmt = "YYYY-MM-DD";
const iso = (d: moment.Moment) => d.format(fmt);
const nextDay = (d: moment.Moment) => d.clone().add(1, "day");
const addDays = (d: moment.Moment, n: number) => d.clone().add(n, "day");
const addMonths = (d: moment.Moment, n: number) => d.clone().add(n, "month");
const parseISO = (s: string) => moment(s, fmt, true);
const quarterOfMonth0 = (m0: number) => (Math.floor(m0 / 3) + 1) as 1 | 2 | 3 | 4;

const rangesOverlap = (aS: moment.Moment, aE: moment.Moment, bS: moment.Moment, bE: moment.Moment) =>
  !(aE.isBefore(bS, "day") || aS.isAfter(bE, "day"));

/** smart defaults */
function calcNextQuarterDefaults(quarters: Quarter[]) {
  const sorted = [...quarters].sort((a, b) => a.endDate.localeCompare(b.endDate));
  const lastEnd = sorted.length ? parseISO(sorted[sorted.length - 1].endDate) : null;
  const start = lastEnd ? nextDay(lastEnd) : moment().startOf("year");
  const end = addDays(addMonths(start, 3), -1);
  const year = start.year();
  const number = quarterOfMonth0(start.month());
  const name = `Q${number} ${year}`;
  return { startISO: iso(start), endISO: iso(end), year, number, name };
}
function calcNextSprintDefaults(quarter: Quarter, allSprints: Sprint[]) {
  const qSprints = allSprints.filter((s) => s.quarterId === quarter.id).sort((a, b) => a.endDate.localeCompare(b.endDate));
  const lastEnd = qSprints.length ? parseISO(qSprints[qSprints.length - 1].endDate) : null;
  const qStart = parseISO(quarter.startDate);
  const qEnd = parseISO(quarter.endDate);
  const start = lastEnd ? nextDay(lastEnd) : qStart.clone();
  const end = addDays(start, 20);
  const finalEnd = end.isAfter(qEnd, "day") ? qEnd.clone() : end;
  const name = `Sprint ${qSprints.length + 1}`;
  return { startISO: iso(start), endISO: iso(finalEnd), name };
}

/** открыть нативный date-picker на input[type="date"] */
const openDatePickerOnFocus: React.FocusEventHandler<HTMLInputElement> = (e) => {
  const input = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  input.showPicker?.();
};
const openDatePickerOnClick: React.MouseEventHandler<HTMLInputElement> = (e) => {
  const input = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  input.showPicker?.();
};

export default function TimeSetupPage() {
  /** queries & mutations */
  const { data: quarters = [] } = useGetQuartersQuery();
  const { data: allSprints = [] } = useGetSprintsQuery(undefined);
  const [addQuarter, { isLoading: addingQuarter }] = useAddQuarterMutation();
  const [updateQuarter] = useUpdateQuarterMutation();
  const [deleteQuarter] = useDeleteQuarterMutation();

  const [addSprint, { isLoading: addingSprint }] = useAddSprintMutation();
  const [updateSprint] = useUpdateSprintMutation();
  const [deleteSprint] = useDeleteSprintMutation();

  /** filter: multi-select quarters (по умолчанию — все видны) */
  const [selectedQuarterIds, setSelectedQuarterIds] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (!selectedQuarterIds.length && quarters.length) {
      setSelectedQuarterIds(quarters.map((q) => q.id));
    }
  }, [quarters, selectedQuarterIds.length]);

  const handleFilterChange = (e: SelectChangeEvent<string[]>) => {
    const value = e.target.value as string[];
    setSelectedQuarterIds(value);
  };

  /** add forms state */
  const [openSprintForQuarterId, setOpenSprintForQuarterId] = React.useState<string | null>(null);
  const [sName, setSName] = React.useState<string>("");
  const [sStart, setSStart] = React.useState<string>("");
  const [sEnd, setSEnd] = React.useState<string>("");
  const [sError, setSError] = React.useState<string>("");

  const [openQuarterRow, setOpenQuarterRow] = React.useState<boolean>(false);
  const [qYear, setQYear] = React.useState<number>(moment().year());
  const [qNumber, setQNumber] = React.useState<1 | 2 | 3 | 4>(quarterOfMonth0(moment().month()));
  const [qStart, setQStart] = React.useState<string>("");
  const [qEnd, setQEnd] = React.useState<string>("");
  const [qError, setQError] = React.useState<string>("");

  /** edit states */
  const [editingQuarterId, setEditingQuarterId] = React.useState<string | null>(null);
  const [qEditStart, setQEditStart] = React.useState<string>("");
  const [qEditEnd, setQEditEnd] = React.useState<string>("");
  const [qEditError, setQEditError] = React.useState<string>("");

  const [editingSprintId, setEditingSprintId] = React.useState<string | null>(null);
  const [sEditName, setSEditName] = React.useState<string>("");
  const [sEditStart, setSEditStart] = React.useState<string>("");
  const [sEditEnd, setSEditEnd] = React.useState<string>("");
  const [sEditError, setSEditError] = React.useState<string>("");

  /** helpers */
  const quartersById = React.useMemo(() => {
    const m = new Map<string, Quarter>();
    quarters.forEach((q) => m.set(q.id, q));
    return m;
  }, [quarters]);

  const visibleQuarters = React.useMemo(() => {
    const set = new Set(selectedQuarterIds);
    return quarters.filter((q) => set.has(q.id));
  }, [quarters, selectedQuarterIds]);

  const sprintsByQuarter = React.useMemo(() => {
    const map = new Map<string, Sprint[]>();
    for (const s of allSprints) {
      if (!map.has(s.quarterId)) map.set(s.quarterId, []);
      map.get(s.quarterId)!.push(s);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) =>
        a.startDate && b.startDate ? a.startDate.localeCompare(b.startDate) : a.order - b.order
      );
    }
    return map;
  }, [allSprints]);

  /** open add forms with defaults */
  const openAddSprint = (quarterId: string) => {
    const q = quartersById.get(quarterId);
    if (!q) return;
    const d = calcNextSprintDefaults(q, allSprints);
    setOpenSprintForQuarterId(quarterId);
    setSName(d.name);
    setSStart(d.startISO);
    setSEnd(d.endISO);
    setSError("");
  };
  const openAddQuarter = () => {
    const d = calcNextQuarterDefaults(quarters);
    setOpenQuarterRow(true);
    setQYear(d.year);
    setQNumber(d.number);
    setQStart(d.startISO);
    setQEnd(d.endISO);
    setQError("");
  };

  /** validation: add sprint */
  React.useEffect(() => {
    if (!openSprintForQuarterId || !sStart || !sEnd) { setSError(""); return; }
    const start = parseISO(sStart); const end = parseISO(sEnd);
    if (!start.isValid() || !end.isValid()) { setSError("Неверная дата."); return; }
    if (end.isBefore(start, "day")) { setSError("Дата окончания раньше даты начала."); return; }
    const q = quartersById.get(openSprintForQuarterId); if (!q) { setSError("Не выбран квартал."); return; }
    const qS = parseISO(q.startDate); const qE = parseISO(q.endDate);
    if (start.isBefore(qS, "day") || end.isAfter(qE, "day")) {
      setSError(`Спринт выходит за границы квартала (${q.startDate} → ${q.endDate}).`); return;
    }
    const current = sprintsByQuarter.get(openSprintForQuarterId) ?? [];
    const overlaps = current.filter((s) => rangesOverlap(start, end, parseISO(s.startDate), parseISO(s.endDate)));
    if (overlaps.length) {
      setSError(`Пересечение со спринтами: ${overlaps.map((s) => `${s.name} (${s.startDate} → ${s.endDate})`).join(", ")}`);
      return;
    }
    setSError("");
  }, [openSprintForQuarterId, sStart, sEnd, quartersById, sprintsByQuarter]);

  /** validation: add quarter */
  React.useEffect(() => {
    if (!openQuarterRow || !qStart || !qEnd) { setQError(""); return; }
    const start = parseISO(qStart); const end = parseISO(qEnd);
    if (!start.isValid() || !end.isValid()) { setQError("Неверная дата."); return; }
    if (end.isBefore(start, "day")) { setQError("Дата окончания раньше даты начала."); return; }
    const overlaps = quarters.filter((q) => rangesOverlap(start, end, parseISO(q.startDate), parseISO(q.endDate)));
    if (overlaps.length) {
      setQError(`Пересечение с кварталом: ${overlaps.map((q) => `${q.name} (${q.startDate} → ${q.endDate})`).join(", ")}`);
      return;
    }
    setQError("");
  }, [openQuarterRow, qStart, qEnd, quarters]);

  /** validation: edit sprint */
  React.useEffect(() => {
    if (!editingSprintId || !sEditStart || !sEditEnd) { setSEditError(""); return; }
    const s = allSprints.find(x => x.id === editingSprintId); if (!s) { setSEditError(""); return; }
    const q = quartersById.get(s.quarterId); if (!q) { setSEditError("Не найден квартал."); return; }
    const start = parseISO(sEditStart); const end = parseISO(sEditEnd);
    if (!start.isValid() || !end.isValid()) { setSEditError("Неверная дата."); return; }
    if (end.isBefore(start, "day")) { setSEditError("Дата окончания раньше даты начала."); return; }
    const qS = parseISO(q.startDate); const qE = parseISO(q.endDate);
    if (start.isBefore(qS, "day") || end.isAfter(qE, "day")) {
      setSEditError(`Спринт выходит за границы квартала (${q.startDate} → ${q.endDate}).`); return;
    }
    const others = (sprintsByQuarter.get(q.id) ?? []).filter(x => x.id !== s.id);
    const overlaps = others.filter((o) => rangesOverlap(start, end, parseISO(o.startDate), parseISO(o.endDate)));
    if (overlaps.length) {
      setSEditError(`Пересечение со спринтами: ${overlaps.map((o) => `${o.name} (${o.startDate} → ${o.endDate})`).join(", ")}`);
      return;
    }
    setSEditError("");
  }, [editingSprintId, sEditStart, sEditEnd, allSprints, quartersById, sprintsByQuarter]);

  /** validation: edit quarter */
  React.useEffect(() => {
    if (!editingQuarterId || !qEditStart || !qEditEnd) { setQEditError(""); return; }
    const start = parseISO(qEditStart); const end = parseISO(qEditEnd);
    if (!start.isValid() || !end.isValid()) { setQEditError("Неверная дата."); return; }
    if (end.isBefore(start, "day")) { setQEditError("Дата окончания раньше даты начала."); return; }
    const overlaps = quarters
      .filter(q => q.id !== editingQuarterId)
      .filter((q) => rangesOverlap(start, end, parseISO(q.startDate), parseISO(q.endDate)));
    if (overlaps.length) {
      setQEditError(`Пересечение с кварталом: ${overlaps.map((q) => `${q.name} (${q.startDate} → ${q.endDate})`).join(", ")}`);
      return;
    }
    setQEditError("");
  }, [editingQuarterId, qEditStart, qEditEnd, quarters]);

  /** submit: add */
  const submitSprint = async () => {
    if (!openSprintForQuarterId || !sStart || !sEnd || sError) return;
    const qid = openSprintForQuarterId;
    const count = (sprintsByQuarter.get(qid)?.length ?? 0) + 1;
    const name = sName.trim() || `Sprint ${count}`;
    await addSprint({ quarterId: qid, name, startDate: sStart, endDate: sEnd }).unwrap();

    // ресет на следующий дефолт
    const q = quartersById.get(qid)!;
    const next = calcNextSprintDefaults(q, allSprints.concat([{
      id: "tmp", quarterId: qid, name, startDate: sStart, endDate: sEnd, workingDays: 0, order: count,
    } as Sprint]));
    setSName(next.name); setSStart(next.startISO); setSEnd(next.endISO); setSError("");
  };
  const submitQuarter = async () => {
    if (!openQuarterRow || !qStart || !qEnd || qError) return;
    const start = parseISO(qStart); const year = start.year();
    const number = quarterOfMonth0(start.month()); const name = `Q${number} ${year}`;
    const created = await addQuarter({ year, number, name, startDate: qStart, endDate: qEnd }).unwrap() as Quarter;
    setSelectedQuarterIds((prev) => prev.includes(created.id) ? prev : [...prev, created.id]);
    const next = calcNextQuarterDefaults(quarters.concat([{ id: "tmp", year, number, name, startDate: qStart, endDate: qEnd } as Quarter]));
    setQYear(next.year); setQNumber(next.number); setQStart(next.startISO); setQEnd(next.endISO); setQError("");
  };

  /** edit handlers */
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
    const start = parseISO(qEditStart); const year = start.year();
    const number = quarterOfMonth0(start.month());
    const name = `Q${number} ${year}`;
    await updateQuarter({ id: editingQuarterId, startDate: qEditStart, endDate: qEditEnd, year, number, name }).unwrap();
    cancelEditQuarter();
  };
  const removeQuarter = async (id: string) => {
    if (!window.confirm("Удалить квартал и все его спринты?")) return;
    await deleteQuarter({ id }).unwrap();
    setSelectedQuarterIds(prev => prev.filter(x => x !== id));
  };

  const startEditSprint = (s: Sprint) => {
    setEditingSprintId(s.id);
    setSEditName(s.name);
    setSEditStart(s.startDate);
    setSEditEnd(s.endDate);
    setSEditError("");
  };
  const cancelEditSprint = () => {
    setEditingSprintId(null);
    setSEditName("");
    setSEditStart("");
    setSEditEnd("");
    setSEditError("");
  };
  const saveEditSprint = async () => {
    if (!editingSprintId || !sEditStart || !sEditEnd || sEditError) return;
    const name = sEditName?.trim() || undefined;
    await updateSprint({ id: editingSprintId, name, startDate: sEditStart, endDate: sEditEnd }).unwrap();
    cancelEditSprint();
  };
  const removeSprint = async (id: string) => {
    if (!window.confirm("Удалить спринт?")) return;
    await deleteSprint({ id }).unwrap();
  };

  /** render */
  const CARD_MIN_W = 320;

  const renderSprintCard = (s: Sprint, indexInQuarter: number) => {
    const isEditing = editingSprintId === s.id;
    return (
      <Paper key={s.id} variant="outlined" sx={{ p: 2, minWidth: CARD_MIN_W, flex: "0 0 auto", position: 'relative' }}>
        {!isEditing ? (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {s.startDate} → {s.endDate}
              </Typography>
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="Редактировать">
                  <IconButton size="small" onClick={() => startEditSprint(s)}><EditIcon fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title="Удалить">
                  <IconButton size="small" onClick={() => removeSprint(s.id)}><DeleteIcon fontSize="small" /></IconButton>
                </Tooltip>
              </Stack>
            </Stack>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {s.name || `Sprint ${indexInQuarter + 1}`}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Рабочих дней (пн–пт): <b>{s.workingDays}</b>
            </Typography>
          </>
        ) : (
          <Box sx={{ width: "100%" }}>
            <TextField
              fullWidth size="small" label="Название (опционально)"
              value={sEditName} onChange={(e) => setSEditName(e.target.value)}
              placeholder="Авто: Sprint N" sx={{ mb: 1 }}
            />
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <TextField
                  fullWidth size="small" type="date" label="Дата начала"
                  value={sEditStart} onChange={(e) => setSEditStart(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ onFocus: openDatePickerOnFocus, onClick: openDatePickerOnClick }}
                  error={!!sEditError}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth size="small" type="date" label="Дата окончания"
                  value={sEditEnd} onChange={(e) => setSEditEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ onFocus: openDatePickerOnFocus, onClick: openDatePickerOnClick }}
                  error={!!sEditError}
                />
              </Grid>
              <Grid item xs={12} sx={{ display: "flex", gap: 1, justifyContent: "flex-end", mt: 0.5 }}>
                <Button variant="outlined" startIcon={<CloseIcon />} onClick={cancelEditSprint}>Отмена</Button>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={saveEditSprint} disabled={!!sEditError || !sEditStart || !sEditEnd}>Сохранить</Button>
              </Grid>
            </Grid>
            {sEditError && <Box sx={{ mt: 1 }}><Alert severity="error">{sEditError}</Alert></Box>}
          </Box>
        )}
      </Paper>
    );
  };

  const renderAddSprintCell = (q: Quarter) => {
    const isOpen = openSprintForQuarterId === q.id;
    return (
      <Paper variant="outlined" sx={{ p: 2, minWidth: CARD_MIN_W, flex: "0 0 auto", display: "flex", alignItems: "stretch", justifyContent: "center", borderStyle: isOpen ? "solid" : "dashed" }}>
        {!isOpen ? (
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Button startIcon={<AddIcon />} onClick={() => openAddSprint(q.id)} sx={{ fontWeight: 700 }}>
              Добавить спринт
            </Button>
          </Box>
        ) : (
          <Box sx={{ width: "100%" }}>
            <TextField
              fullWidth size="small" label="Название (опционально)"
              value={sName} onChange={(e) => setSName(e.target.value)}
              placeholder="Авто: Sprint N" sx={{ mb: 1 }}
            />
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <TextField
                  fullWidth size="small" type="date" label="Дата начала"
                  value={sStart} onChange={(e) => setSStart(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ onFocus: openDatePickerOnFocus, onClick: openDatePickerOnClick }}
                  error={!!sError}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth size="small" type="date" label="Дата окончания"
                  value={sEnd} onChange={(e) => setSEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ onFocus: openDatePickerOnFocus, onClick: openDatePickerOnClick }}
                  error={!!sError}
                />
              </Grid>
              <Grid item xs={12} sx={{ display: "flex", gap: 1, justifyContent: "flex-end", mt: 0.5 }}>
                <Button variant="outlined" onClick={() => setOpenSprintForQuarterId(null)}>Отмена</Button>
                <Button variant="contained" onClick={submitSprint} disabled={addingSprint || !!sError || !sStart || !sEnd}>Сохранить</Button>
              </Grid>
            </Grid>
            {sError && <Box sx={{ mt: 1 }}><Alert severity="error">{sError}</Alert></Box>}
          </Box>
        )}
      </Paper>
    );
  };

  const renderQuarterRow = (q: Quarter) => {
    const sprints = (sprintsByQuarter.get(q.id) ?? []).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const isEditing = editingQuarterId === q.id;

    return (
      <Paper key={q.id} variant="outlined" sx={{ p: 2 }}>
        {!isEditing ? (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {q.name} — {q.startDate} → {q.endDate}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Tooltip title="Редактировать квартал">
                  <IconButton size="small" onClick={() => startEditQuarter(q)}><EditIcon fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title="Удалить квартал">
                  <IconButton size="small" onClick={() => removeQuarter(q.id)}><DeleteIcon fontSize="small" /></IconButton>
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
                <TextField
                  fullWidth size="small" type="date" label="Дата начала"
                  value={qEditStart} onChange={(e) => setQEditStart(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ onFocus: openDatePickerOnFocus, onClick: openDatePickerOnClick }}
                  error={!!qEditError}
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <TextField
                  fullWidth size="small" type="date" label="Дата окончания"
                  value={qEditEnd} onChange={(e) => setQEditEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ onFocus: openDatePickerOnFocus, onClick: openDatePickerOnClick }}
                  error={!!qEditError}
                />
              </Grid>
              <Grid item xs={12} md={6} sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                <Button variant="outlined" startIcon={<CloseIcon />} onClick={cancelEditQuarter}>Отмена</Button>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={saveEditQuarter} disabled={!!qEditError || !qEditStart || !qEditEnd}>Сохранить</Button>
              </Grid>
            </Grid>
            {qEditError && <Box sx={{ mt: 1 }}><Alert severity="error">{qEditError}</Alert></Box>}
          </Box>
        )}

        {/* Лента спринтов */}
        <Box sx={{ display: "flex", flexWrap: "nowrap", gap: 2, overflowX: "auto", pb: 1 }}>
          {sprints.map((s, i) => renderSprintCard(s, i))}
          {renderAddSprintCell(q)}
        </Box>
      </Paper>
    );
  };

  return (
    <Paper elevation={0} sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Кварталы и спринты</Typography>

      {/* filter by quarters */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2, flexWrap: "wrap" }}>
        <FormControl sx={{ minWidth: 320 }} size="small">
          <InputLabel id="quarters-filter-label">Фильтр по кварталам</InputLabel>
          <Select
            labelId="quarters-filter-label" multiple value={selectedQuarterIds}
            onChange={handleFilterChange}
            input={<OutlinedInput label="Фильтр по кварталам" />}
            renderValue={(selected) => (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {selected.map((id) => {
                  const q = quartersById.get(id);
                  return <Chip key={id} label={q ? q.name : id} size="small" />;
                })}
              </Box>
            )}
          >
            {quarters.map((q) => (
              <MenuItem key={q.id} value={q.id}>
                {q.name} — {q.startDate} → {q.endDate}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {/* rows = quarters */}
      <Stack spacing={2}>
        {visibleQuarters.map((q) => renderQuarterRow(q))}

        {/* Add Quarter row */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          {!openQuarterRow ? (
            <Box sx={{ p: 2, border: "2px dashed #cbd5e1", borderRadius: 2, textAlign: "center" }}>
              <Button startIcon={<AddIcon />} onClick={openAddQuarter} sx={{ fontWeight: 700 }}>
                Добавить квартал
              </Button>
            </Box>
          ) : (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Новый квартал</Typography>
              <Grid container spacing={1} alignItems="center">
                <Grid item xs={12} md={2}>
                  <TextField
                    fullWidth size="small" type="number" label="Год (авто)"
                    value={qYear} onChange={(e) => setQYear(Number(e.target.value) || moment().year())}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    fullWidth size="small" select label="Номер (авто)"
                    value={qNumber} onChange={(e) => setQNumber(Number(e.target.value) as 1 | 2 | 3 | 4)}
                  >
                    <MenuItem value={1}>Q1</MenuItem>
                    <MenuItem value={2}>Q2</MenuItem>
                    <MenuItem value={3}>Q3</MenuItem>
                    <MenuItem value={4}>Q4</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={6} md={3}>
                  <TextField
                    fullWidth size="small" type="date" label="Дата начала"
                    value={qStart} onChange={(e) => setQStart(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ onFocus: openDatePickerOnFocus, onClick: openDatePickerOnClick }}
                    error={!!qError}
                  />
                </Grid>
                <Grid item xs={6} md={3}>
                  <TextField
                    fullWidth size="small" type="date" label="Дата окончания"
                    value={qEnd} onChange={(e) => setQEnd(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ onFocus: openDatePickerOnFocus, onClick: openDatePickerOnClick }}
                    error={!!qError}
                    helperText={qError || "Окончание ≈ старт + 3 месяца − 1 день"}
                  />
                </Grid>
                <Grid item xs={12} md={2} sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                  <Button variant="outlined" onClick={() => setOpenQuarterRow(false)}>Отмена</Button>
                  <Button variant="contained" onClick={submitQuarter} disabled={addingQuarter || !!qError || !qStart || !qEnd}>Сохранить</Button>
                </Grid>
              </Grid>
              {qError && <Box sx={{ mt: 1 }}><Alert severity="error">{qError}</Alert></Box>}
            </Box>
          )}
        </Paper>
      </Stack>
    </Paper>
  );
}
