import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useGetHistoryQuery } from "../app/api";

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function HistoryPage() {
  const { data, isLoading, isError } = useGetHistoryQuery(undefined, {
    refetchOnMountOrArgChange: true,
    refetchOnReconnect: true,
    refetchOnFocus: true,
  });

  if (isError) {
    return <Alert severity="error">Не удалось загрузить историю действий</Alert>;
  }

  if (!data || data.length === 0) {
    return <Alert severity="info">История действий пока пуста</Alert>;
  }

  return (
    <Stack spacing={2}>
      {data.map((session) => (
        <Accordion
          key={`${session.sessionId}-${session.lastActionAt}`}
          disableGutters
          TransitionProps={{ unmountOnExit: true }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack spacing={0.5} sx={{ width: "100%" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                <Typography variant="h6">{session.userName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Последняя активность: {formatDateTime(session.lastActionAt)}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Сессия: {session.sessionId}
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Divider sx={{ mb: 1 }} />
            <Stack spacing={1}>
              {session.actions.map((action) => (
                <Stack
                  key={action.id}
                  direction="row"
                  spacing={2}
                  alignItems="flex-start"
                  flexWrap="wrap"
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ minWidth: 160 }}
                  >
                    {formatDateTime(action.createdAt)}
                  </Typography>
                  <Typography variant="body1">{action.action}</Typography>
                </Stack>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
    </Stack>
  );
}
