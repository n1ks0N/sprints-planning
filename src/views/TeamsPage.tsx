import React from "react";
import {
  Box,
  Button,
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
  const [editKey, setEditKey] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [confirmKey, setConfirmKey] = React.useState<string | null>(null);
  const [deleteData, setDeleteData] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const keyPattern = /^[a-z0-9_-]+$/;

  React.useEffect(() => {
    if (teams) {
      const normalized = teams.map((team) => ({ key: team.key, label: team.name }));
      dispatch(setAvailableTeams(normalized));
    }
  }, [dispatch, teams]);

  const resetForm = () => {
    setNewKey("");
    setNewName("");
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
      await addTeam({ key, name }).unwrap();
      resetForm();
      setError(null);
    } catch (error) {
      setError(`Не удалось добавить команду: ${String((error as any)?.data || error)}`);
    }
  };

  const startEdit = (key: string, name: string) => {
    setEditKey(key);
    setEditName(name);
  };

  const handleSaveEdit = async () => {
    if (!editKey) return;
    const name = editName.trim();
    if (!name) {
      setError("Название не может быть пустым");
      return;
    }
    try {
      await updateTeam({ key: editKey, name }).unwrap();
      setEditKey(null);
      setEditName("");
      setError(null);
    } catch (error) {
      setError(`Не удалось обновить команду: ${String((error as any)?.data || error)}`);
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
              <Button variant="text" onClick={() => startEdit(team.key, team.name)}>
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
      {error && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        </Paper>
      )}
      <Typography variant="h4" gutterBottom>
        Управление командами
      </Typography>
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
