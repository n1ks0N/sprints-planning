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
  IconButton,
  Badge,
} from "@mui/material";
import { AddTask, Visibility, VisibilityOff } from "@mui/icons-material";

import TimeSetupPage from "./TimeSetupPage";
import TeamPage from "./TeamPage";
import CapacityPage from "./CapacityPage";
import BacklogPage from "./BacklogPage";
import ParticipantWorkloadPage from "./ParticipantWorkloadPage";
import ReleasesPage from "./ReleasesPage";
import HistoryPage from "./HistoryPage";
import { useDispatch, useSelector, useStore } from "react-redux";
import { undoLast } from "../app/undoSlice";
import { exportExcelFile } from "../app/api";
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
import { PAGE_TITLES, buildTabTitle } from "../constants/pageTitles";
import PageHelpDialog, {
  PageHelpContent,
} from "../components/PageHelpDialog";
import { setBacklogFilters } from "../app/uiSlice";
import {
  JiraExportProvider,
  useJiraExport,
} from "../contexts/JiraExportContext";

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
  const store = useStore();
  const teams = useSelector(selectAvailableTeams);
  const hideAllParticipants = useSelector(
    (state: any) => state.ui?.backlog?.hideAllParticipants ?? false
  );
  const normalizedParam = (rawTeamKey || DEFAULT_TEAM_KEY).toLowerCase();
  const teamKey = teams.some((team) => team.key === normalizedParam)
    ? normalizedParam
    : teams[0]?.key ?? DEFAULT_TEAM_KEY;
  const currentPathSuffix = React.useMemo(
    () => location.pathname.replace(/^\/[A-Za-z0-9_-]+/, "") || "/",
    [location.pathname]
  );
  const normalizedPathSuffix = React.useMemo(() => {
    const trimmed = currentPathSuffix.replace(/\/$/, "");
    return trimmed === "" ? "/" : trimmed;
  }, [currentPathSuffix]);
  const isBacklogPage = normalizedPathSuffix === "/";

  const teamScopedPageTitle = React.useMemo(() => {
    const titleMap: Record<string, string> = {
      "/": PAGE_TITLES.backlog,
      "/capacity": PAGE_TITLES.capacity,
      "/participant-work": PAGE_TITLES.participantWork,
      "/time": PAGE_TITLES.timeSetup,
      "/team": PAGE_TITLES.team,
      "/releases": PAGE_TITLES.releases,
      "/history": PAGE_TITLES.history,
    };

    return titleMap[normalizedPathSuffix] ?? PAGE_TITLES.backlog;
  }, [normalizedPathSuffix]);

  const helpContent = React.useMemo<PageHelpContent>(() => {
    const contentMap: Record<string, PageHelpContent> = {
      "/": {
        title: "Справка: Бэклог",
        description:
          "Здесь ведется список задач и распределение нагрузки по участникам и спринтам.",
        bullets: [
          "Фильтры сверху ограничивают список по кварталам, приоритетам, статусам, релизам, стримам, заказчикам и поиску. Также можно задать количество задач на странице.",
          "Перед добавлением задачи выбирается квартал в поле «Квартал задачи», затем используется кнопка «Добавить задачу».",
          "Иконка перетаскивания и стрелки вверх/вниз меняют порядок задач.",
          "В шапке страницы, слева от FAQ, иконка «глаз» переключает скрытие/показ участников сразу во всех задачах.",
          "В карточке задачи иконка «глаз» управляет видимостью участников только для этой задачи (как локальное исключение).",
          "Стрелки влево/вправо сдвигают нагрузку по всем спринтам для задачи или участника.",
          "Кнопка «История изменений» открывает модальное окно с журналом: пользователь, изменение, дата.",
          "Кнопки «Дублировать» и «Удалить» дублируют или удаляют задачу.",
          "Клик по ячейке нагрузки позволяет редактировать дни.",
          "В строке участника доступны: назначение лидера (звезда), замена участника, заметка, копирование в следующий квартал и удаление.",
          "Строка «Добавить участника» привязывает нового исполнителя к задаче.",
          "Поле «Релиз (ПРОМ)» поддерживает пустое значение («—»), если задача без релиза.",
          "Поля «Заказчик» и «Стрим» поддерживают множественный выбор: можно выбрать из списка или ввести новое значение. Сохранение происходит автоматически при клике вне поля или нажатии Enter.",
          "Кнопка «+» в карточке задачи добавляет ее в корзину Jira.",
          "Кнопка «Добавить все» в блоке фильтров складывает в корзину все задачи по текущим фильтрам, а иконка AddTask в шапке открывает мастер экспорта в Jira.",
        ],
      },
      "/capacity": {
        title: "Справка: Нагрузка",
        description:
          "Страница показывает доступную емкость и загрузку участников по спринтам.",
        bullets: [
          "Фильтры позволяют выбрать кварталы, участников, роли и стримы.",
          "Таблица отражает рассчитанную емкость и суммарную нагрузку по спринтам.",
        ],
      },
      "/participant-work": {
        title: "Справка: По сотрудникам",
        description:
          "Раздел показывает распределение задач по каждому участнику в выбранных спринтах.",
        bullets: [
          "Фильтры позволяют выбрать кварталы, участников, роли, стримы участников, стрим задач и приоритеты.",
          "Клик по ячейке нагрузки открывает редактирование дней для задачи и спринта.",
          "Итоги справа показывают суммарную загрузку по участнику.",
        ],
      },
      "/time": {
        title: "Справка: Кварталы/Спринты",
        description:
          "Здесь настраиваются кварталы и спринты, их даты и количество рабочих дней.",
        bullets: [
          "Фильтр по кварталам помогает быстро находить нужный период.",
          "Кнопки «Добавить квартал» и «Добавить спринт» создают новые записи.",
          "Иконки редактирования и удаления изменяют или удаляют кварталы/спринты.",
          "Кнопки «Сохранить» и «Отмена» применяют или отменяют изменения в карточках.",
        ],
      },
      "/team": {
        title: "Справка: Участники",
        description:
          "Раздел для управления составом команды, ролями, стримами и ставками.",
        bullets: [
          "Форма «Добавить» создает нового участника команды.",
          "Фильтры позволяют отбирать участников по ролям, стримам и ставкам.",
          "Иконка перетаскивания меняет порядок участников в списке.",
          "Кнопки «Редактировать», «Сохранить» и «Отмена» изменяют данные участника.",
          "Кнопка «Удалить» удаляет участника из команды.",
        ],
      },
      "/releases": {
        title: "Справка: Релизы",
        description:
          "Страница для планирования дат релизов и этапов подготовки.",
        bullets: [
          "Чекбокс «Скрыть прошедшие» убирает завершенные релизы из списка.",
          "Поле даты ПРОМ и кнопка «Добавить релиз» создают новый релиз.",
          "Клик по ячейке даты включает редактирование даты этапа.",
          "Иконка «стереть» очищает все даты релиза, кроме ПРОМ.",
          "Иконка «удалить» удаляет релиз.",
        ],
      },
      "/history": {
        title: "Справка: История",
        description:
          "Раздел показывает историю действий пользователей по сессиям.",
        bullets: [
          "Клик по заголовку раскрывает/сворачивает действия внутри сессии.",
          "Кнопка «Загрузить еще» подгружает следующую страницу истории.",
        ],
      },
    };

    return contentMap[normalizedPathSuffix] ?? contentMap["/"];
  }, [normalizedPathSuffix]);

  React.useEffect(() => {
    dispatch(setCurrentTeam(teamKey));
  }, [dispatch, teamKey]);

  React.useEffect(() => {
    document.title = buildTabTitle(teamScopedPageTitle);
  }, [teamScopedPageTitle]);

  const [isExporting, setIsExporting] = React.useState(false);

  const handleToggleAllParticipants = React.useCallback(() => {
    dispatch(setBacklogFilters({ hideAllParticipants: !hideAllParticipants }));
  }, [dispatch, hideAllParticipants]);

  const handleExportExcel = React.useCallback(async () => {
    setIsExporting(true);
    try {
      const blob = await exportExcelFile(store.getState());
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
    } finally {
      setIsExporting(false);
    }
  }, [store]);

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
    <JiraExportProvider scopeKey={teamKey}>
      <TeamScopedAppContent
        buildPath={buildPath}
        currentPathSuffix={currentPathSuffix}
        handleExportExcel={handleExportExcel}
        handleToggleAllParticipants={handleToggleAllParticipants}
        hideAllParticipants={hideAllParticipants}
        isBacklogPage={isBacklogPage}
        isExporting={isExporting}
        teamKey={teamKey}
        teamScopedPageTitle={teamScopedPageTitle}
        helpContent={helpContent}
      />
    </JiraExportProvider>
  );
}

type TeamScopedAppContentProps = {
  buildPath: (suffix: string) => string;
  currentPathSuffix: string;
  handleExportExcel: () => Promise<void>;
  handleToggleAllParticipants: () => void;
  hideAllParticipants: boolean;
  isBacklogPage: boolean;
  isExporting: boolean;
  teamKey: string;
  teamScopedPageTitle: string;
  helpContent: PageHelpContent;
};

function TeamScopedAppContent({
  buildPath,
  handleExportExcel,
  handleToggleAllParticipants,
  hideAllParticipants,
  isBacklogPage,
  isExporting,
  helpContent,
}: TeamScopedAppContentProps) {
  const { selectedCount, openDialog } = useJiraExport();

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
            {isBacklogPage && (
              <Tooltip title="Экспортировать бэклог в Excel">
                <span>
                  <Button
                    variant="outlined"
                    onClick={handleExportExcel}
                    disabled={isExporting}
                  >
                    Экспорт в Excel
                  </Button>
                </span>
              </Tooltip>
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 2 }}>
            {isBacklogPage && (
              <Tooltip
                title={
                  selectedCount > 0
                    ? `Jira: ${selectedCount}`
                    : "Jira: список задач пуст"
                }
              >
                <span>
                  <IconButton
                    size="small"
                    onClick={openDialog}
                    disabled={selectedCount === 0}
                    sx={{ color: selectedCount > 0 ? "primary.main" : undefined }}
                  >
                    <Badge
                      badgeContent={selectedCount}
                      color="primary"
                      max={99}
                    >
                      <AddTask fontSize="small" />
                    </Badge>
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {isBacklogPage && (
              <Tooltip
                title={
                  hideAllParticipants
                    ? "Показать всех участников"
                    : "Скрыть всех участников"
                }
              >
                <IconButton
                  size="small"
                  onClick={handleToggleAllParticipants}
                  sx={{ color: "success.main" }}
                >
                  {hideAllParticipants ? (
                    <Visibility fontSize="small" />
                  ) : (
                    <VisibilityOff fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
            )}
            <PageHelpDialog content={helpContent} />
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
  const location = useLocation();

  React.useEffect(() => {
    if (teams) {
      dispatch(
        setAvailableTeams(
          teams.map((team) => ({ key: team.key, label: team.name }))
        )
      );
    }
  }, [dispatch, teams]);

  React.useEffect(() => {
    if (location.pathname === "/teams") {
      document.title = buildTabTitle(PAGE_TITLES.teams);
    }
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/:teamKey/*" element={<TeamScopedApp />} />
      <Route path="/teams" element={<TeamsPage />} />
      <Route path="*" element={<Navigate to={`/${currentTeam}/`} replace />} />
    </Routes>
  );
}
