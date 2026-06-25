import React from "react";
import {
  Box,
  Button,
  Chip,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";
import {
  useAddTeamMutation,
  useDeleteTeamMutation,
  useGetTeamsQuery,
  useUpdateTeamMutation,
} from "../app/api";
import { useDispatch, useSelector } from "react-redux";
import {
  selectAvailableTeams,
  selectCurrentTeamKey,
  setAvailableTeams,
  setCurrentTeam,
} from "../app/teamSlice";
import { DEFAULT_TEAM_KEY } from "../teams";
import PageHelpDialog, {
  PageHelpContent,
} from "../components/PageHelpDialog";

export default function TeamsPage() {
  const dispatch = useDispatch();
  const { data: teams } = useGetTeamsQuery();
  const [addTeam, { isLoading: isAdding }] = useAddTeamMutation();
  const [updateTeam, { isLoading: isUpdating }] = useUpdateTeamMutation();
  const [deleteTeam, { isLoading: isDeleting }] = useDeleteTeamMutation();
  const availableTeams = useSelector(selectAvailableTeams);
  const currentTeam = useSelector(selectCurrentTeamKey);

  const [newKey, setNewKey] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newJiraBoardId, setNewJiraBoardId] = React.useState("");
  const [editKey, setEditKey] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editJiraBoardId, setEditJiraBoardId] = React.useState("");
  const [confirmKey, setConfirmKey] = React.useState<string | null>(null);
  const [deleteData, setDeleteData] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const keyPattern = /^[a-z0-9_-]+$/;
  const helpContent: PageHelpContent = {
    title: "Справка: Управление командами",
    description:
      "Страница предназначена для создания, настройки, переименования и удаления команд.",
    bullets: [
      "Блок «Добавить команду» создает новую команду по ключу и названию.",
      "Ключ команды используется в URL и должен содержать только латинские буквы, цифры, дефис или подчеркивание.",
      "Поле Jira boardId связывает команду с board в Jira для загрузки активных, будущих и найденных по поиску спринтов.",
      "Кнопка «Открыть» переходит в выбранную команду.",
      "Кнопка «Редактировать» включает изменение названия и Jira boardId, «Сохранить» фиксирует изменения.",
      "Кнопка «Удалить» открывает подтверждение удаления команды.",
      "Чекбокс в диалоге удаления позволяет удалить команду вместе со всеми данными.",
    ],
  };

  React.useEffect(() => {
    if (teams) {
      const normalized = teams.map((team) => ({ key: team.key, label: team.name }));
      dispatch(setAvailableTeams(normalized));
    }
  }, [dispatch, teams]);

  const resetForm = () => {
    setNewKey("");
    setNewName("");
    setNewJiraBoardId("");
  };

  const parseBoardId = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return null;
    if (!/^\d+$/.test(normalized)) {
      throw new Error("Jira boardId должен быть положительным числом");
    }
    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error("Jira boardId должен быть положительным числом");
    }
    return parsed;
  };

  const handleAdd = async () => {
    const key = newKey.trim().toLowerCase();
    const name = newName.trim();
    if (!key || !name) {
      setError("Укажите ключ и название команды");
      return;
    }
    if (!keyPattern.test(key)) {
      setError("Ключ может содержать только строчные буквы, цифры, дефис и нижнее подчёркивание");
      return;
    }
    try {
      await addTeam({ key, name, jiraBoardId: parseBoardId(newJiraBoardId) }).unwrap();
      resetForm();
      setError(null);
    } catch (error) {
      setError(error instanceof Error
        ? error.message
        : `Не удалось добавить команду: ${String((error as any)?.data || error)}`);
    }
  };

  const startEdit = (key: string, name: string, jiraBoardId?: number | null) => {
    setEditKey(key);
    setEditName(name);
    setEditJiraBoardId(jiraBoardId ? String(jiraBoardId) : "");
  };

  const handleSaveEdit = async () => {
    if (!editKey) return;
    const name = editName.trim();
    if (!name) {
      setError("Название не может быть пустым");
      return;
    }
    try {
      await updateTeam({ key: editKey, name, jiraBoardId: parseBoardId(editJiraBoardId) }).unwrap();
      setEditKey(null);
      setEditName("");
      setEditJiraBoardId("");
      setError(null);
    } catch (error) {
      setError(error instanceof Error
        ? error.message
        : `Не удалось обновить команду: ${String((error as any)?.data || error)}`);
    }
  };

  const handleConfirmDelete = (key: string) => {
    setConfirmKey(key);
    setDeleteData(false);
  };

  const performDelete = async () => {
    if (!confirmKey) return;
    try {
      await deleteTeam({ key: confirmKey, deleteData }).unwrap();
      if (confirmKey === currentTeam) {
        const fallback = availableTeams.find((t) => t.key !== confirmKey)?.key;
        dispatch(setCurrentTeam(fallback || DEFAULT_TEAM_KEY));
      }
      setConfirmKey(null);
      setDeleteData(false);
      setError(null);
    } catch (error) {
      setError(`Не удалось удалить команду: ${String((error as any)?.data || error)}`);
    }
  };

  const renderRows = () => {
    if (!teams?.length) return null;
    return teams.map((team) => (
      <TableRow key={team.key} hover>
        <TableCell width="20%">{team.key}</TableCell>
        <TableCell>
          {editKey === team.key ? (
            <TextField
              size="small"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              fullWidth
            />
          ) : (
            team.name
          )}
        </TableCell>
        <TableCell width="18%">
          {editKey === team.key ? (
            <TextField
              size="small"
              label="Jira boardId"
              value={editJiraBoardId}
              onChange={(e) => setEditJiraBoardId(e.target.value)}
              inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
              fullWidth
            />
          ) : (
            team.jiraBoardId ? (
              <Chip size="small" label={team.jiraBoardId} variant="outlined" />
            ) : (
              <Typography variant="body2" color="text.secondary">Не задан</Typography>
            )
          )}
        </TableCell>
        <TableCell align="right">
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button component={Link} to={`/${team.key}/`} variant="outlined">
              Открыть
            </Button>
            {editKey === team.key ? (
              <Button
                variant="contained"
                onClick={handleSaveEdit}
                disabled={isUpdating}
              >
                Сохранить
              </Button>
            ) : (
              <Button variant="text" onClick={() => startEdit(team.key, team.name, team.jiraBoardId)}>
                Редактировать
              </Button>
            )}
            <Button
              color="error"
              variant="text"
              onClick={() => handleConfirmDelete(team.key)}
              disabled={isDeleting}
            >
              Удалить
            </Button>
          </Stack>
        </TableCell>
      </TableRow>
    ));
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Typography variant="h4">Управление командами</Typography>
        <PageHelpDialog content={helpContent} />
      </Stack>
      {error && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        </Paper>
      )}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Добавить команду
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="Ключ команды"
            placeholder="customlab"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <TextField
            label="Название"
            placeholder="Custom Lab"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Jira boardId"
            placeholder="236205"
            value={newJiraBoardId}
            onChange={(e) => setNewJiraBoardId(e.target.value)}
            inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
            sx={{ width: { xs: "100%", sm: 180 } }}
          />
          <Button
            variant="contained"
            onClick={handleAdd}
            disabled={isAdding}
          >
            Добавить
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>
            Список команд
          </Typography>
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Ключ</TableCell>
              <TableCell>Название</TableCell>
              <TableCell>Jira boardId</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>{renderRows()}</TableBody>
        </Table>
      </Paper>

      <Dialog open={Boolean(confirmKey)} onClose={() => setConfirmKey(null)}>
        <DialogTitle>Удалить команду {confirmKey}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы можете удалить только команду или вместе со всеми данными, связанными с ней.
            Если не удалять данные, команда будет удалена только при отсутствии зависимостей.
          </DialogContentText>
          <FormControlLabel
            control={
              <Checkbox
                checked={deleteData}
                onChange={(e) => setDeleteData(e.target.checked)}
              />
            }
            label="Удалить вместе со всеми данными этой команды"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmKey(null)}>Отмена</Button>
          <Button color="error" onClick={performDelete} disabled={isDeleting}>
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
