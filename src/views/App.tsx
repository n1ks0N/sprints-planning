import * as React from "react";
import { PlanningSelectionProvider } from "../contexts/PlanningSelectionContext";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
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
  CircularProgress,
} from "@mui/material";
import { AddTask, Visibility, VisibilityOff } from "@mui/icons-material";

const TimeSetupPage = React.lazy(() => import(/* webpackChunkName: "TimeSetupPage" */ "./TimeSetupPage"));
const TeamPage = React.lazy(() => import(/* webpackChunkName: "TeamPage" */ "./TeamPage"));
const CapacityPage = React.lazy(() => import(/* webpackChunkName: "CapacityPage" */ "./CapacityPage"));
const BacklogPage = React.lazy(() => import(/* webpackChunkName: "BacklogPage" */ "./BacklogPage"));
const ParticipantWorkloadPage = React.lazy(() => import(/* webpackChunkName: "ParticipantWorkloadPage" */ "./ParticipantWorkloadPage"));
const ReleasesPage = React.lazy(() => import(/* webpackChunkName: "ReleasesPage" */ "./ReleasesPage"));
const HistoryPage = React.lazy(() => import(/* webpackChunkName: "HistoryPage" */ "./HistoryPage"));
const PlanningWorkbenchPage = React.lazy(() => import(/* webpackChunkName: "PlanningWorkbenchPage" */ "./PlanningWorkbenchPage"));
const PlanningWorkbenchReviewPage = React.lazy(() => import(/* webpackChunkName: "PlanningWorkbenchReviewPage" */ "./PlanningWorkbenchReviewPage"));
import { useDispatch, useSelector, useStore } from "react-redux";
import { undoLast } from "../app/undoSlice";
import { exportExcelFile } from "../app/api";
import moment from "moment";
import {
  selectCurrentTeamKey,
  setAvailableTeams,
  setCurrentTeam,
} from "../app/teamSlice";
import { useGetTeamsQuery } from "../app/api";
import { DEFAULT_TEAM_KEY } from "../teams";
const TeamsPage = React.lazy(() => import(/* webpackChunkName: "TeamsPage" */ "./TeamsPage"));
import { PAGE_TITLES, buildTabTitle } from "../constants/pageTitles";
import PageHelpDialog, {
  PageHelpContent,
} from "../components/PageHelpDialog";
import { setTaskListFilters } from "../app/uiSlice";
import {
  JiraExportProvider,
  useJiraExport,
} from "../contexts/JiraExportContext";

function PageLoading() {
  return <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress aria-label="Загрузка страницы" /></Stack>;
}

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
  const location = useLocation();
  const dispatch = useDispatch();
  const store = useStore();
  const currentTeamKey = useSelector(selectCurrentTeamKey);
  const isTodoPath = /\/backlog\/?$/.test(location.pathname);
  const hideAllParticipants = useSelector((state: any) =>
    state.ui?.taskLists?.[`${rawTeamKey}:${isTodoPath ? "BACKLOG" : "ROADMAP"}`]?.hideAllParticipants
      ?? (isTodoPath ? state.ui?.todo?.hideAllParticipants : state.ui?.backlog?.hideAllParticipants) ?? false);
  const normalizedParam = (rawTeamKey || DEFAULT_TEAM_KEY).toLowerCase();
  // The URL is the team scope, including while the team directory is loading.
  const teamKey = normalizedParam;
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
    if (normalizedPathSuffix.startsWith("/planning")) {
      return PAGE_TITLES.planning;
    }

    const titleMap: Record<string, string> = {
      "/": PAGE_TITLES.roadmap,
      "/backlog": PAGE_TITLES.backlog,
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
    if (normalizedPathSuffix.startsWith("/planning")) {
      return {
        title: "Справка: Планирование",
        description:
          "Отдельная рабочая страница для ведения planning backlog и массового автораспределения нагрузки перед публикацией реальных задач по спринтам.",
        bullets: [
          "Слева показывается отдельный planning backlog из специальной таблицы, а не live-задачи со страницы бэклога.",
          "Справа собирается текущий набор для расчета: задачи переносятся кнопками, а не drag-and-drop.",
          "Кнопки «Все в план» и «Все убрать» массово собирают или очищают текущий набор.",
          "Фильтры и сортировка разделены: фильтры ограничивают список, отдельный компактный блок задает порядок задач.",
          "В planning-диалоге задаются приоритет, стартовый квартал, релиз, заказчики, стримы и demand-строки по ролям или участникам.",
          "Автораспределение учитывает приоритет: 1/2 планируются даже при перелимите, 3 не планируется без доступной емкости.",
          "При планировании следующий участник задачи не ставится в спринт раньше предыдущего участника.",
          "Review-страница показывает матрицу нагрузки, предупреждения, отличия от плана и итоговую загрузку участников.",
          "На preview/review можно вручную поправить распределение перед применением; live-задачи создаются только после подтверждения.",
        ],
      };
    }

    const contentMap: Record<string, PageHelpContent> = {
      "/": {
        title: "Справка: Дорожная карта",
        description:
          "Здесь ведется список задач и распределение нагрузки по участникам и спринтам.",
        bullets: [
          "Фильтры сверху ограничивают список по кварталам, приоритетам, статусам, релизам, стримам, заказчикам и поиску.",
          "Сортировка вынесена в отдельный компактный блок и меняет порядок задач независимо от фильтров.",
          "Перед добавлением задачи выбирается квартал в поле «Квартал задачи», затем используется кнопка «Добавить задачу».",
          "Иконка перетаскивания и стрелки вверх/вниз меняют порядок задач.",
          "В шапке страницы, слева от FAQ, иконка «глаз» переключает скрытие/показ участников сразу во всех задачах.",
          "В карточке задачи иконка «глаз» управляет видимостью участников только для этой задачи (как локальное исключение).",
          "Стрелки влево/вправо сдвигают нагрузку по всем спринтам для задачи или участника.",
          "Кнопка «История изменений» открывает модальное окно с журналом: пользователь, изменение, дата.",
          "Кнопки «Дублировать» и «Удалить» дублируют или удаляют задачу.",
          "Клик по ячейке нагрузки позволяет редактировать нагрузку участника в спринте.",
          "В строке участника доступны: назначение лидера (звезда), замена участника, заметка, копирование в следующий квартал и удаление.",
          "Строка «Добавить участника» привязывает нового исполнителя к задаче.",
          "Поле «Релиз (ПРОМ)» поддерживает пустое значение («—»), если задача без релиза.",
          "Поля «Заказчик» и «Стрим» поддерживают множественный выбор: можно выбрать из списка или ввести новое значение. Сохранение происходит автоматически при клике вне поля или нажатии Enter.",
          "Кнопка «+» в карточке задачи добавляет ее в корзину Jira.",
          "Кнопка «Добавить все» складывает в корзину Jira задачи по текущим фильтрам, а иконка AddTask в шапке открывает мастер экспорта.",
          "В мастере Jira выбираются planning sprint, Jira sprint, ProjectKey, labels, Story для задач и конкретные участники для заведения.",
          "Story создается один раз на задачу. Название задачи участника в Jira имеет вид «Роль: название задачи», название Story сохраняется.",
        ],
      },
      "/backlog": { title: "Справка: Бэклог", description: "Будущие задачи: участники, оценки и спринты сохраняются, но не занимают рабочую ёмкость.", bullets: ["Создание и копирование дают статус «В бэклоге».", "В работе / Выполнено переводят задачу на дорожную карту; отмена сохраняет страницу.", "Нажмите иконку «Перенос в планирование» в карточке задачи для подготовки автораспределения.", "Создание задач Jira доступно на дорожной карте.", "Дату релиза можно выбрать или ввести вручную."] },
      "/capacity": {
        title: "Справка: Нагрузка",
        description:
          "Страница показывает доступную емкость и загрузку участников по спринтам.",
        bullets: [
          "Фильтры позволяют выбрать кварталы, участников, роли и стримы.",
          "Если участники не выбраны, запрос не ограничивается participantId и показывает всех участников по фильтрам.",
          "Таблица отражает рассчитанную емкость, суммарную нагрузку и остаток по спринтам.",
          "Итоги помогают быстро увидеть перегрузку или свободную емкость по участнику.",
        ],
      },
      "/participant-work": {
        title: "Справка: По сотрудникам",
        description:
          "Раздел показывает распределение задач по каждому участнику в выбранных спринтах.",
        bullets: [
          "Фильтры позволяют выбрать кварталы, участников, роли, стримы участников, стрим задач и приоритеты.",
          "Участники подгружаются по мере прокрутки. Внизу списка можно нажать «Загрузить ещё» и увидеть, сколько участников загружено.",
          "Клик по ячейке нагрузки открывает редактирование нагрузки для задачи и спринта.",
          "Итоги справа показывают суммарную загрузку по участнику.",
          "Пустой выбор участников означает показ всех участников, а не скрытый фильтр по всем id.",
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
          "Даты спринтов используются при планировании, сортировке и контроле размещения задач относительно релизов.",
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
          "Кнопка «Деактивировать участника» скрывает его из активной команды и расчётов нагрузки. Участник и его данные остаются в существующих задачах.",
          "Порядок участников важен для планирования: следующие участники задачи не должны планироваться раньше предыдущих.",
          "Jira login участника используется при заведении задач в Jira.",
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
          "Даты релиза используются в планировании, чтобы контролировать размещение задач относительно ПРОМ.",
        ],
      },
      "/history": {
        title: "Справка: История",
        description:
          "Раздел показывает историю действий пользователей по сессиям.",
        bullets: [
          "Клик по заголовку раскрывает/сворачивает действия внутри сессии.",
          "Кнопка «Загрузить еще» подгружает следующую страницу истории.",
          "В истории фиксируются изменения задач, участников, нагрузки, релизов и запусков экспорта Jira.",
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
    dispatch(setTaskListFilters({ key: `${teamKey}:${isTodoPath ? "BACKLOG" : "ROADMAP"}`, changes: { hideAllParticipants: !hideAllParticipants } }));
  }, [dispatch, hideAllParticipants, teamKey, isTodoPath]);

  const handleExportExcel = React.useCallback(async () => {
    setIsExporting(true);
    try {
      const blob = await exportExcelFile(store.getState(), isTodoPath ? "BACKLOG" : "ROADMAP");
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
  }, [store, isTodoPath]);

  const buildPath = React.useCallback(
    (suffix: string) => `/${teamKey}${suffix}`,
    [teamKey]
  );

  if (currentTeamKey !== teamKey) return null;

  return (
    <JiraExportProvider scopeKey={teamKey}>
      <PlanningSelectionProvider key={teamKey}>
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
      </PlanningSelectionProvider>
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
  currentPathSuffix,
  teamKey,
  buildPath,
  handleExportExcel,
  handleToggleAllParticipants,
  hideAllParticipants,
  isBacklogPage,
  isExporting,
  helpContent,
}: TeamScopedAppContentProps) {
  const { selectedCount, openDialog } = useJiraExport();
  const isTaskListPage = isBacklogPage || currentPathSuffix.replace(/\/$/, "") === "/backlog";

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
            {[
              ["/", "Дорожная карта"],
              ["/backlog", "Бэклог"],
              ["/capacity", "Нагрузка"],
              ["/participant-work", "По сотрудникам"],
              ["/time", "Кварталы/Спринты"],
              ["/team", "Участники"],
              ["/releases", "Релизы"],
              ["/planning", "Планирование"],
              ["/history", "История"],
            ].map(([path, label]) => {
              const currentPath = currentPathSuffix.replace(/\/+$/, "") || "/";
              const active = currentPath === path || (path !== "/" && currentPath.startsWith(`${path}/`));
              return (
                <Button
                  key={path}
                  component={Link}
                  to={buildPath(path)}
                  aria-current={active ? "page" : undefined}
                  sx={active ? {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    fontWeight: 700,
                    "&:hover": { bgcolor: "primary.dark" },
                  } : undefined}
                >
                  {label}
                </Button>
              );
            })}
            {isTaskListPage && (
              <Tooltip title="Экспортировать задачи в Excel">
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
            {isTaskListPage && (
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
        <React.Suspense fallback={<PageLoading />}><Routes>
          <Route path="time" element={<TimeSetupPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="capacity" element={<CapacityPage />} />
          <Route path="/" element={<BacklogPage key={`${teamKey}:ROADMAP`} workspace="ROADMAP" />} />
          <Route path="backlog" element={<BacklogPage key={`${teamKey}:BACKLOG`} workspace="BACKLOG" />} />
          <Route path="planning" element={<PlanningWorkbenchPage />} />
          <Route path="planning/review" element={<PlanningWorkbenchReviewPage />} />
          <Route
            path="participant-work"
            element={<ParticipantWorkloadPage />}
          />
          <Route path="releases" element={<ReleasesPage />} />
          <Route path="history" element={<HistoryPage />} />
        </Routes></React.Suspense>
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
    <React.Suspense fallback={<PageLoading />}><Routes>
      <Route path="/:teamKey/*" element={<TeamScopedApp />} />
      <Route path="/teams" element={<TeamsPage />} />
      <Route path="*" element={<Navigate to={`/${currentTeam}/`} replace />} />
    </Routes></React.Suspense>
  );
}
