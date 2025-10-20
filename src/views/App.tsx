// src/views/App.tsx
import * as React from "react";
import { Routes, Route, Link } from "react-router-dom";
import { Container, AppBar, Toolbar, Button, Stack } from "@mui/material";

import TimeSetupPage from "./TimeSetupPage";
import TeamPage from "./TeamPage";
import CapacityPage from "./CapacityPage";
import BacklogPage from "./BacklogPage";

export default function App() {
  return (
    <>
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
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Routes>
          <Route path="/" element={<TimeSetupPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/capacity" element={<CapacityPage />} />
          <Route path="/backlog" element={<BacklogPage />} /> {/* NEW */}
        </Routes>
      </Container>
    </>
  );
}
