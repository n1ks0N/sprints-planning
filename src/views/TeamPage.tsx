// src/views/TeamPage.tsx
import * as React from "react";
import {
  Paper,
  Typography,
  Stack,
  Box,
  TextField,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Autocomplete,
  Divider,
} from "@mui/material";
import { Delete, Edit, Save, Close, DragIndicator } from "@mui/icons-material";

import {
  useGetParticipantsQuery,
  useAddParticipantMutation,
  useUpdateParticipantMutation,
  useDeleteParticipantMutation,
  useReorderParticipantsMutation,
} from "../app/api";
import type { Participant } from "../types";
import { setTeamFilters } from "../app/uiSlice";
import { useAppDispatch, useAppSelector } from "./hooks";
import FilterAutocomplete from "../components/filters/FilterAutocomplete";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const PRESET_ROLES = ["UI", "FE", "BE", "QA", "BA", "CA", "PY"];
const PRESET_RATES = [1, 0.75, 0.5, 0.25];

const uniqueRolesFrom = (participants: Participant[]) =>
  Array.from(new Set(participants.map((p) => p.role).filter(Boolean)));

function shallowArrayEqual<T>(a: readonly T[], b: readonly T[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function SortableRow({
  participant,
  children,
}: {
  participant: Participant;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: participant.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? "rgba(0,0,0,0.03)" : undefined,
  };

  return (
    <TableRow ref={setNodeRef} style={style} hover>
      <TableCell width={44}>
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: "grab", display: "inline-flex" }}
        >
          <IconButton size="small" aria-label="drag">
            <DragIndicator fontSize="small" />
          </IconButton>
        </span>
      </TableCell>
      {children}
    </TableRow>
  );
}

export default function TeamPage() {
  const { data: participants = [] } = useGetParticipantsQuery();
  const [addParticipant] = useAddParticipantMutation();
  const [updateParticipant] = useUpdateParticipantMutation();
  const [deleteParticipant] = useDeleteParticipantMutation();
  const [reorderParticipants] = useReorderParticipantsMutation();
  const dispatch = useAppDispatch();
  const { filterRoles, filterRates } = useAppSelector((s) => s.ui.team);

  // Добавление
  const [newName, setNewName] = React.useState("");
  const [newRole, setNewRole] = React.useState<string>("");
  const [newRoleInput, setNewRoleInput] = React.useState<string>("");
  // Ставка при добавлении — как у роли: Autocomplete freeSolo
  const [newRate, setNewRate] = React.useState<string>("1");
  const [newRateInput, setNewRateInput] = React.useState<string>("");

  // Редактирование
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editRole, setEditRole] = React.useState<string>("");
  const [editRoleInput, setEditRoleInput] = React.useState<string>("");
  // Ставка при редактировании — через Autocomplete freeSolo
  const [editRate, setEditRate] = React.useState<string>("1");
  const [editRateInput, setEditRateInput] = React.useState<string>("");

  const allRoleOptions = React.useMemo(
    () =>
      Array.from(new Set([...PRESET_ROLES, ...uniqueRolesFrom(participants)])),
    [participants]
  );

  // Набор ставок для подсказок (и фильтров): пресеты + уникальные из участников
  const rateOptions = React.useMemo(() => {
    const all = new Set<number>([
      ...PRESET_RATES,
      ...participants.map((p) => p.rate),
    ]);
    return Array.from(all)
      .sort((a, b) => b - a)
      .map((v) => String(Number(v.toFixed(2)))); // "1", "0.75", "0.5", ...
  }, [participants]);

  const handleRoleFilterChange = React.useCallback(
    (values: string[]) => {
      const next = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
      if (shallowArrayEqual(next, filterRoles)) return;
      dispatch(setTeamFilters({ filterRoles: next }));
    },
    [dispatch, filterRoles]
  );

  const handleRateFilterChange = React.useCallback(
    (values: string[]) => {
      const normalized = values
        .map((v) => v.replace(",", ".").trim())
        .filter(Boolean)
        .map((v) => {
          const num = Number(v);
          return Number.isFinite(num) ? String(Number(num.toFixed(2))) : v;
        });
      const next = Array.from(new Set(normalized));
      if (shallowArrayEqual(next, filterRates)) return;
      dispatch(setTeamFilters({ filterRates: next }));
    },
    [dispatch, filterRates]
  );

  const filtered = React.useMemo(() => {
    let list = participants.slice();

    if (filterRoles.length) {
      const roleSet = new Set(filterRoles);
      list = list.filter((p) => roleSet.has(p.role));
    }

    if (filterRates.length) {
      const rateSet = new Set(filterRates.map((r) => String(r)));
      list = list.filter((p) => rateSet.has(String(Number(p.rate.toFixed(2)))));
    }

    return list;
  }, [participants, filterRoles, filterRates]);

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentIds = filtered.map((p) => p.id);
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrderIds = arrayMove(currentIds, oldIndex, newIndex);

    // Полный порядок — как вернул API
    const fullIds = participants.slice().map((p) => p.id);

    // Заменяем только видимый сегмент
    const visiblePositions: number[] = [];
    const visibleSet = new Set(currentIds);
    fullIds.forEach((id, idx) => {
      if (visibleSet.has(id)) visiblePositions.push(idx);
    });
    const merged = fullIds.slice();
    visiblePositions.forEach((pos, i) => {
      merged[pos] = newOrderIds[i];
    });

    const payload = merged.map((id, idx) => ({ id, order: idx }));
    try {
      await reorderParticipants({ orders: payload }).unwrap();
    } catch (e) {
      console.error("Reorder failed", e);
    }
  };

  // CRUD
  const handleAdd = async () => {
    const roleValue = newRoleInput?.trim() || newRole?.trim();
    const rateStr = (newRateInput?.trim() || newRate?.trim() || "").replace(
      ",",
      "."
    );
    const rate = parseFloat(rateStr);
    if (!newName.trim() || !roleValue || isNaN(rate)) return;
    if (rate < 0 || rate > 1) return;

    await addParticipant({
      fullName: newName.trim(),
      role: roleValue,
      rate,
    }).unwrap();
    setNewName("");
    setNewRole("");
    setNewRoleInput("");
    setNewRate("1");
    setNewRateInput("");
  };

  const startEdit = (p: Participant) => {
    setEditingId(p.id);
    setEditName(p.fullName);
    setEditRole(p.role);
    setEditRoleInput(p.role);
    setEditRate(String(Number(p.rate.toFixed(2))));
    setEditRateInput(String(Number(p.rate.toFixed(2))));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditRole("");
    setEditRoleInput("");
    setEditRate("1");
    setEditRateInput("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const roleValue = editRoleInput?.trim() || editRole?.trim();
    const rateStr = (editRateInput?.trim() || editRate?.trim() || "").replace(
      ",",
      "."
    );
    const rate = parseFloat(rateStr);
    if (!editName.trim() || !roleValue || isNaN(rate)) return;
    if (rate < 0 || rate > 1) return;

    await updateParticipant({
      id: editingId,
      fullName: editName.trim(),
      role: roleValue,
      rate,
    }).unwrap();
    cancelEdit();
  };

  const removeParticipant = async (id: string) => {
    if (!window.confirm("Удалить участника?")) return;
    try {
      await deleteParticipant({ id }).unwrap();
    } catch (e) {
      console.error(e);
    }
  };

  const renderRow = (p: Participant) => {
    const isEditing = editingId === p.id;
    return (
      <SortableRow key={p.id} participant={p}>
        {/* ФИО */}
        <TableCell sx={{ minWidth: 260 }}>
          {!isEditing ? (
            <Typography>{p.fullName}</Typography>
          ) : (
            <TextField
              size="small"
              fullWidth
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              label="ФИО"
            />
          )}
        </TableCell>

        {/* Роль */}
        <TableCell sx={{ minWidth: 220 }}>
          {!isEditing ? (
            <Chip label={p.role || "—"} size="small" />
          ) : (
            <Autocomplete
              size="small"
              freeSolo
              options={allRoleOptions}
              value={editRole}
              inputValue={editRoleInput}
              onChange={(_, val) => setEditRole((val as string) ?? "")}
              onInputChange={(_, val) => setEditRoleInput(val)}
              renderInput={(params) => <TextField {...params} label="Роль" />}
            />
          )}
        </TableCell>

        {/* Ставка 0..1 (Autocomplete freeSolo как у роли) */}
        <TableCell sx={{ minWidth: 180 }}>
          {!isEditing ? (
            <Typography>{p.rate.toFixed(2)}</Typography>
          ) : (
            <Autocomplete
              size="small"
              freeSolo
              options={rateOptions}
              value={editRate}
              inputValue={editRateInput}
              onChange={(_, val) => setEditRate((val as string) ?? "")}
              onInputChange={(_, val) => setEditRateInput(val)}
              renderInput={(params) => (
                <TextField {...params} label="Ставка (0..1)" />
              )}
            />
          )}
        </TableCell>

        {/* Действия */}
        <TableCell align="right" width={160}>
          {!isEditing ? (
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <IconButton aria-label="edit" onClick={() => startEdit(p)}>
                <Edit />
              </IconButton>
              <IconButton
                aria-label="delete"
                onClick={() => removeParticipant(p.id)}
              >
                <Delete />
              </IconButton>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <IconButton color="primary" aria-label="save" onClick={saveEdit}>
                <Save />
              </IconButton>
              <IconButton
                color="inherit"
                aria-label="cancel"
                onClick={cancelEdit}
              >
                <Close />
              </IconButton>
            </Stack>
          )}
        </TableCell>
      </SortableRow>
    );
  };

  return (
    <Paper elevation={0} sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Участники команды
      </Typography>

      {/* Добавление */}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="ФИО"
          size="small"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          sx={{ minWidth: 240 }}
        />
        <Autocomplete
          size="small"
          freeSolo
          options={allRoleOptions}
          value={newRole}
          inputValue={newRoleInput}
          onChange={(_, val) => setNewRole((val as string) ?? "")}
          onInputChange={(_, val) => setNewRoleInput(val)}
          renderInput={(params) => <TextField {...params} label="Роль" />}
          sx={{ minWidth: 220 }}
        />
        <Autocomplete
          size="small"
          freeSolo
          options={rateOptions}
          value={newRate}
          inputValue={newRateInput}
          onChange={(_, val) => setNewRate((val as string) ?? "")}
          onInputChange={(_, val) => setNewRateInput(val)}
          renderInput={(params) => (
            <TextField {...params} label="Ставка (0..1)" />
          )}
          sx={{ minWidth: 180 }}
        />
        <Button
          variant="contained"
          onClick={handleAdd}
          sx={{ whiteSpace: "nowrap" }}
        >
          Добавить
        </Button>
      </Stack>

      {/* Фильтры */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems="center"
        >
          <FilterAutocomplete
            multiple
            allowCustom={false}
            label="Фильтр: Роли"
            options={allRoleOptions}
            value={filterRoles}
            onChange={handleRoleFilterChange}
            sx={{ minWidth: 260, flex: 1 }}
          />

          <FilterAutocomplete
            multiple
            label="Фильтр: Ставка (0..1)"
            options={rateOptions}
            value={filterRates}
            onChange={handleRateFilterChange}
            sx={{ minWidth: 260, flex: 1 }}
          />
        </Stack>
      </Paper>

      {/* Таблица с DnD */}
      <TableContainer component={Paper} variant="outlined">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={filtered.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={44} />
                  <TableCell>ФИО</TableCell>
                  <TableCell>Роль</TableCell>
                  <TableCell>Ставка</TableCell>
                  <TableCell align="right" width={160}>
                    Действия
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((p) => renderRow(p))}
                {!filtered.length && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Box
                        sx={{
                          py: 2,
                          textAlign: "center",
                          color: "text.secondary",
                        }}
                      >
                        Нет участников по текущим фильтрам
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      </TableContainer>

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary">
        Роли и ставки — свободный ввод или выбор из списка (пресеты + ранее
        добавленные). Ставка — любое число 0..1. Перетаскивайте строки за
        «ручку» слева, чтобы задать свой порядок.
      </Typography>
    </Paper>
  );
}
