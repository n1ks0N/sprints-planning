import * as React from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Container,
  AppBar,
  Toolbar,
  Button,
  Stack,
  Tooltip,
  CircularProgress,
  Box,
} from "@mui/material";

import TimeSetupPage from "./TimeSetupPage";
import TeamPage from "./TeamPage";
import CapacityPage from "./CapacityPage";
import BacklogPage from "./BacklogPage";
import ParticipantWorkloadPage from "./ParticipantWorkloadPage";
import ReleasesPage from "./ReleasesPage";
import HistoryPage from "./HistoryPage";
import { useDispatch, useSelector } from "react-redux";
import { undoLast } from "../app/undoSlice";
import { useLazyExportExcelQuery } from "../app/api";
import moment from "moment";
import TeamSwitcher from "../components/TeamSwitcher";
import {
  selectAvailableTeams,
  selectCurrentTeamKey,
  setAvailableTeams,
  setCurrentTeam,
} from "../app/teamSlice";
import { useGetTeamsQuery } from "../app/api";
import { DEFAULT_TEAM_KEY } from "../teams";
import TeamsPage from "./TeamsPage";

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

function TeamScopedApp() {
  const { teamKey: rawTeamKey } = useParams<{ teamKey: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const teams = useSelector(selectAvailableTeams);
  const normalizedParam = (rawTeamKey || DEFAULT_TEAM_KEY).toLowerCase();
  const teamKey = teams.some((team) => team.key === normalizedParam)
    ? normalizedParam
    : teams[0]?.key ?? DEFAULT_TEAM_KEY;
  const currentPathSuffix = React.useMemo(
    () => location.pathname.replace(/^\/[A-Za-z0-9_-]+/, "") || "/",
    [location.pathname]
  );

  React.useEffect(() => {
    dispatch(setCurrentTeam(teamKey));
  }, [dispatch, teamKey]);

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

  const navigateToTeam = React.useCallback(
    (nextTeam: string) => {
      const suffix = currentPathSuffix.startsWith("/")
        ? currentPathSuffix
        : `/${currentPathSuffix}`;
      navigate(`/${nextTeam}${suffix}`);
    },
    [currentPathSuffix, navigate]
  );

  const buildPath = React.useCallback(
    (suffix: string) => `/${teamKey}${suffix}`,
    [teamKey]
  );

  return (
    <>
      <Hotkeys />
      <AppBar
        position="fixed"
        color="default"
        elevation={0}
        sx={{ top: 0, zIndex: (theme) => theme.zIndex.appBar }}
      >
        <Toolbar>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            sx={{ flexGrow: 1 }}
          >
            <Button component={Link} to={buildPath("/")}>
              Бэклог
            </Button>
            <Button component={Link} to={buildPath("/capacity")}>
              Нагрузка
            </Button>
            <Button component={Link} to={buildPath("/participant-work")}>
              По сотрудникам
            </Button>
            <Button component={Link} to={buildPath("/time")}>
              Кварталы/Спринты
            </Button>
            <Button component={Link} to={buildPath("/team")}>
              Участники
            </Button>
            <Button component={Link} to={buildPath("/releases")}>
              Релизы
            </Button>
            <Button component={Link} to={buildPath("/history")}>
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

      <Toolbar />

      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Routes>
          <Route path="time" element={<TimeSetupPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="capacity" element={<CapacityPage />} />
          <Route path="/" element={<BacklogPage />} />
          <Route
            path="participant-work"
            element={<ParticipantWorkloadPage />}
          />
          <Route path="releases" element={<ReleasesPage />} />
          <Route path="history" element={<HistoryPage />} />
        </Routes>
      </Container>
    </>
  );
}

export default function App() {
  const currentTeam = useSelector(selectCurrentTeamKey);
  const dispatch = useDispatch();
  const { data: teams } = useGetTeamsQuery();

  React.useEffect(() => {
    if (teams) {
      dispatch(
        setAvailableTeams(
          teams.map((team) => ({ key: team.key, label: team.name }))
        )
      );
    }
  }, [dispatch, teams]);

  return (
    <Routes>
      <Route path="/:teamKey/*" element={<TeamScopedApp />} />
      <Route path="/teams" element={<TeamsPage />} />
      <Route path="*" element={<Navigate to={`/${currentTeam}/`} replace />} />
    </Routes>
  );
}
