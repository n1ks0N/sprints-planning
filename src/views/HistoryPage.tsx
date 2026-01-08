import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useEffect, useState } from "react";
import { useGetHistoryQuery } from "../app/api";
import type { ApiSessionHistory } from "../types";

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function HistoryPage() {
  const pageSize = 10;
  const [page, setPage] = useState(0);
  const [sessions, setSessions] = useState<ApiSessionHistory[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const { data, isLoading, isError, isFetching } = useGetHistoryQuery(
    { page, size: pageSize },
    {
      refetchOnMountOrArgChange: true,
      refetchOnReconnect: true,
      refetchOnFocus: true,
    }
  );

  useEffect(() => {
    if (!data) return;
    setSessions((prev) => (page === 0 ? data : [...prev, ...data]));
    setHasMore(data.length === pageSize);
  }, [data, page, pageSize]);

  const handleLoadMore = () => {
    if (isFetching || !hasMore) return;
    setPage((prev) => prev + 1);
  };

  const isInitialLoading = isLoading && sessions.length === 0;
  const isInitialError = isError && sessions.length === 0;

  if (isInitialError) {
    return <Alert severity="error">Не удалось загрузить историю действий</Alert>;
  }

  if (isInitialLoading) {
    return <Alert severity="info">Загрузка истории...</Alert>;
  }

  if (sessions.length === 0) {
    return <Alert severity="info">История действий пока пуста</Alert>;
  }

  const isLoadingMore = isFetching && page > 0;

  return (
    <Stack spacing={2}>
      {sessions.map((session) => (
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
      {hasMore && (
        <Button
          variant="outlined"
          onClick={handleLoadMore}
          disabled={isFetching}
          sx={{ alignSelf: "center" }}
        >
          {isLoadingMore ? "Загрузка..." : "Загрузить еще"}
        </Button>
      )}
    </Stack>
  );
}
