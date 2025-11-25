import React from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useDispatch, useSelector } from "react-redux";
import {
  selectHistoryGroups,
  selectHistoryUser,
  setCurrentUser,
  revertHistoryGroup,
} from "../app/historySlice";
import type { AppDispatch } from "../app/store";
import {
  useGetHistoryQuery,
  useUpdateHistoryDescriptionMutation,
  useUpdateHistoryLockMutation,
} from "../app/api";

const formatDate = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
};

export default function HistoryPage() {
  const dispatch = useDispatch<AppDispatch>();
  useGetHistoryQuery();
  const groups = useSelector(selectHistoryGroups);
  const currentUser = useSelector(selectHistoryUser);
  const [updateDescription] = useUpdateHistoryDescriptionMutation();
  const [updateLock] = useUpdateHistoryLockMutation();
  const [draftDescriptions, setDraftDescriptions] = React.useState<Record<string, string>>({});
  const [userInput, setUserInput] = React.useState(currentUser);

  React.useEffect(() => {
    setUserInput(currentUser);
  }, [currentUser]);

  React.useEffect(() => {
    setDraftDescriptions({});
  }, [groups]);

  const handleDescriptionBlur = async (groupId: string) => {
    const next = draftDescriptions[groupId];
    const current = groups.find((g) => g.id === groupId)?.description ?? "";
    if (next === undefined || next === current) return;
    await updateDescription({ id: groupId, description: next });
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h4">История изменений</Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField
          label="Текущий пользователь"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onBlur={() => dispatch(setCurrentUser(userInput))}
          helperText="Изменения группируются, если подряд их делает один и тот же пользователь"
          sx={{ minWidth: 320 }}
        />
      </Stack>

      {!groups.length && (
        <Typography color="text.secondary">
          История пока пуста. Выполняйте изменения, чтобы они попадали сюда автоматически.
        </Typography>
      )}

      {groups.map((group) => (
        <Accordion key={group.id} defaultExpanded sx={{ borderRadius: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center" width="100%">
              <Typography sx={{ flexGrow: 1 }}>
                {group.user} • {formatDate(group.createdAt)}
              </Typography>
              {group.locked && <Chip label="Заблокировано" color="warning" size="small" />}
              {group.rolledBackAt && (
                <Chip
                  label={`Откат ${formatDate(group.rolledBackAt)}`}
                  color="info"
                  size="small"
                />
              )}
              <Chip label={`${group.changes.length} изменений`} size="small" />
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <TextField
                label="Описание группы"
                value={draftDescriptions[group.id] ?? group.description ?? ""}
                onChange={(e) =>
                  setDraftDescriptions((prev) => ({ ...prev, [group.id]: e.target.value }))
                }
                onBlur={() => handleDescriptionBlur(group.id)}
                placeholder="Пояснение, что было сделано"
                fullWidth
                multiline
                minRows={2}
              />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button
                  variant="contained"
                  onClick={() => dispatch(revertHistoryGroup(group.id))}
                  disabled={!group.changes.some((c) => c.undo)}
                >
                  Откатить группу
                </Button>
                <Button
                  variant="outlined"
                  onClick={() =>
                    updateLock({ id: group.id, locked: !group.locked })
                  }
                >
                  {group.locked ? "Разблокировать" : "Зафиксировать"}
                </Button>
              </Stack>

              <Divider />
              <Stack spacing={1}>
                {group.changes.map((c) => (
                  <Box key={c.id} sx={{ px: 1, py: 0.5, borderRadius: 1, bgcolor: "grey.50" }}>
                    <Typography variant="body2">{c.action}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(c.createdAt)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
    </Stack>
  );
}
