import * as React from "react";
import { Routes, Route, Link } from "react-router-dom";
import { Container, AppBar, Toolbar, Button, Stack } from "@mui/material";

import TimeSetupPage from "./TimeSetupPage";
import TeamPage from "./TeamPage";
import CapacityPage from "./CapacityPage";
import BacklogPage from "./BacklogPage";
import ParticipantWorkloadPage from "./ParticipantWorkloadPage";
import ReleasesPage from "./ReleasesPage";
import HistoryPage from "./HistoryPage";
import { useDispatch } from "react-redux";
import { undoLast } from "../app/undoSlice";

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
  return (
    <>
      <Hotkeys />
      <AppBar position="static" color="default" elevation={0}>
        <Toolbar>
          <Stack direction="row" spacing={1}>
            <Button component={Link} to="/">
              Кварталы/Спринты
            </Button>
            <Button component={Link} to="/team">
              Участники
            </Button>
            <Button component={Link} to="/capacity">
              Нагрузка
            </Button>
            <Button component={Link} to="/backlog">
              Бэклог
            </Button>
            <Button component={Link} to="/participant-work">
              По сотрудникам
            </Button>
            <Button component={Link} to="/releases">
              Релизы
            </Button>
            <Button component={Link} to="/history">
              История
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Routes>
          <Route path="/" element={<TimeSetupPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/capacity" element={<CapacityPage />} />
          <Route path="/backlog" element={<BacklogPage />} />
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
