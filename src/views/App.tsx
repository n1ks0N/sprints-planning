import * as React from "react";
import { Routes, Route, Link } from "react-router-dom";
import {
  Container,
  AppBar,
  Toolbar,
  Button,
  Stack,
  Tooltip,
  CircularProgress,
} from "@mui/material";

import TimeSetupPage from "./TimeSetupPage";
import TeamPage from "./TeamPage";
import CapacityPage from "./CapacityPage";
import BacklogPage from "./BacklogPage";
import ParticipantWorkloadPage from "./ParticipantWorkloadPage";
import ReleasesPage from "./ReleasesPage";
import HistoryPage from "./HistoryPage";
import { useDispatch } from "react-redux";
import { undoLast } from "../app/undoSlice";
import { useLazyExportExcelQuery } from "../app/api";
import moment from "moment";

function Hotkeys() {
  const dispatch = useDispatch();
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isUndo =
        (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      if (isUndo) {
        e.preventDefault();
        (dispatch as any)(undoLast());
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true } as any);
  }, [dispatch]);
  return null;
}

export default function App() {
  const [exportExcel, { isFetching: isExporting }] = useLazyExportExcelQuery();

  const handleExportExcel = React.useCallback(async () => {
    try {
      const blob = await exportExcel().unwrap();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sprints-planning-${moment().format("YYYY-MM-DD")}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Не удалось экспортировать Excel", error);
    }
  }, [exportExcel]);

  return (
    <>
      <Hotkeys />
      <AppBar position="static" color="default" elevation={0}>
        <Toolbar>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Button component={Link} to="/">
              Бэклог
            </Button>
            <Button component={Link} to="/capacity">
              Нагрузка
            </Button>
            <Button component={Link} to="/participant-work">
              По сотрудникам
            </Button>
            <Button component={Link} to="/time">
              Кварталы/Спринты
            </Button>
            <Button component={Link} to="/team">
              Участники
            </Button>
            <Button component={Link} to="/releases">
              Релизы
            </Button>
            <Button component={Link} to="/history">
              История
            </Button>
            <Tooltip title="Экспортировать план в Excel">
              <span>
                <Button
                  variant="outlined"
                  onClick={handleExportExcel}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <CircularProgress size={16} sx={{ color: "inherit" }} />
                  ) : (
                    "Экспорт в Excel"
                  )}
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Routes>
          <Route path="/time" element={<TimeSetupPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/capacity" element={<CapacityPage />} />
          <Route path="/" element={<BacklogPage />} />
          <Route
            path="/participant-work"
            element={<ParticipantWorkloadPage />}
          />
          <Route path="/releases" element={<ReleasesPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </Container>
    </>
  );
}
