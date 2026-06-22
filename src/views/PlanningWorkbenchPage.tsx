import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, ArrowBack, ArrowForward, DeleteOutline, PlayArrow } from "@mui/icons-material";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  useAddPlanningWorkbenchItemMutation,
  useGetFiltersQuery,
  useGetParticipantsQuery,
  useGetPlanningWorkbenchBacklogQuery,
  useGetQuartersQuery,
  useGetReleasesQuery,
  useGetSprintsQuery,
  usePreviewPlanningWorkbenchMutation,
  useDeletePlanningWorkbenchItemMutation,
  useUpdatePlanningWorkbenchItemMutation,
} from "../app/api";
import type { PlanningDemand, PlanningWorkbenchItem } from "../types";
import PlanningWorkbenchTaskDialog, {
  PlanningWorkbenchTaskSubmitPayload,
} from "../components/PlanningWorkbenchTaskDialog";
import PlanningWorkbenchItemCard from "../components/PlanningWorkbenchItemCard";
import FiltersPanel from "../components/filters/FiltersPanel";
import SortControls from "../components/SortControls";
import { setPlanningWorkbenchPreview } from "./planningWorkbenchPreviewStore";

type PlanningSortBy = "manual" | "load" | "releaseDate" | "priority";
type SortDirection = "asc" | "desc";
const WITHOUT_STREAM_FILTER_VALUE = "__WITHOUT_STREAM__";
const WITHOUT_CUSTOMER_FILTER_VALUE = "__WITHOUT_CUSTOMER__";

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
};

const whole = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
};

const getPlanningDemands = (item: PlanningWorkbenchItem): PlanningDemand[] => item.planningDemands || [];

const collectItemQuarterIds = (
  item: PlanningWorkbenchItem,
  sprintQuarterById: Map<string, string>
) => {
  const quarterIds = new Set<string>();
  (item.planningQuarterIds || []).forEach((quarterId) => {
    if (quarterId) {
      quarterIds.add(quarterId);
    }
  });
  (item.planningSprintIds || []).forEach((sprintId) => {
    const quarterId = sprintQuarterById.get(sprintId);
    if (quarterId) {
      quarterIds.add(quarterId);
    }
  });
  if (quarterIds.size === 0 && item.initialQuarterId) {
    quarterIds.add(item.initialQuarterId);
  }
  return Array.from(quarterIds);
};

const getItemIssues = (item: PlanningWorkbenchItem) => {
  const issues: string[] = [];
  const planningDemands = getPlanningDemands(item);
  if (planningDemands.length === 0) {
    issues.push("нет общей оценки");
  }
  if (
    planningDemands.some(
      (demand) =>
        whole(demand.days) <= 0 ||
        (demand.kind === "ROLE" && !demand.role) ||
        (demand.kind === "PARTICIPANT" && !demand.participantId)
    )
  ) {
    issues.push("не заполнены роли/участники");
  }
  const hasScope =
    Boolean(item.initialQuarterId) ||
    Boolean(item.planningQuarterIds?.length) ||
    Boolean(item.planningSprintIds?.length);
  if (!hasScope) {
    issues.push("не задано окно планирования");
  }
  return issues;
};

export default function PlanningWorkbenchPage() {
  const { teamKey = "default" } = useParams<{ teamKey: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: participants = [] } = useGetParticipantsQuery();
  const { data: quarters = [] } = useGetQuartersQuery();
  const { data: sprints = [] } = useGetSprintsQuery();
  const { data: releases = [] } = useGetReleasesQuery();
  const { data: filters } = useGetFiltersQuery();
  const [addItem, { isLoading: isCreating }] = useAddPlanningWorkbenchItemMutation();
  const [updateItem, { isLoading: isUpdating }] = useUpdatePlanningWorkbenchItemMutation();
  const [deleteItem, { isLoading: isDeleting }] = useDeletePlanningWorkbenchItemMutation();
  const [previewPlanning, { isLoading: isPreviewing }] = usePreviewPlanningWorkbenchMutation();

  const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogItem, setDialogItem] = React.useState<PlanningWorkbenchItem | null>(null);
  const [selectAfterSubmit, setSelectAfterSubmit] = React.useState(false);
  const [quarterFilterIds, setQuarterFilterIds] = React.useState<string[]>([]);
  const [priorityFilterValues, setPriorityFilterValues] = React.useState<string[]>([]);
  const [releaseFilterValue, setReleaseFilterValue] = React.useState("");
  const [streamFilterValues, setStreamFilterValues] = React.useState<string[]>([]);
  const [customerFilterValues, setCustomerFilterValues] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [sortBy, setSortBy] = React.useState<PlanningSortBy>("manual");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");
  const [error, setError] = React.useState("");

  const planningBacklogSortArgs = React.useMemo(
    () => ({ sortBy, sortDirection }),
    [sortBy, sortDirection]
  );
  const { data: backlog = [], isLoading } = useGetPlanningWorkbenchBacklogQuery(planningBacklogSortArgs, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  React.useEffect(() => {
    const returnedIds = (location.state as { selectedItemIds?: string[] } | null)?.selectedItemIds;
    if (Array.isArray(returnedIds) && returnedIds.length > 0) {
      setSelectedItemIds(returnedIds);
    }
  }, [location.state]);

  const backlogById = React.useMemo(
    () => new Map(backlog.map((item) => [item.id, item])),
    [backlog]
  );
  const releaseLabelById = React.useMemo(
    () =>
      new Map(
        releases.map((release) => [
          release.id,
          formatDate(release.promDate),
        ])
      ),
    [releases]
  );
  const participantNameById = React.useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant.fullName])),
    [participants]
  );
  const sprintQuarterById = React.useMemo(
    () => new Map(sprints.map((sprint) => [sprint.id, sprint.quarterId])),
    [sprints]
  );
  const quarterOptions = React.useMemo(
    () => quarters.map((quarter) => ({ value: quarter.id, label: quarter.name })),
    [quarters]
  );
  const priorityOptions = React.useMemo(
    () => [
      { value: "1", label: "P1" },
      { value: "2", label: "P2" },
      { value: "3", label: "P3" },
    ],
    []
  );
  const streamFilterOptions = React.useMemo(
    () => [
      { value: WITHOUT_STREAM_FILTER_VALUE, label: "Без стрима" },
      ...(filters?.streams || [])
        .slice()
        .sort((a, b) => a.localeCompare(b, "ru"))
        .map((stream) => ({ value: stream, label: stream })),
    ],
    [filters?.streams]
  );
  const customerFilterOptions = React.useMemo(
    () => [
      { value: WITHOUT_CUSTOMER_FILTER_VALUE, label: "Без заказчика" },
      ...(filters?.customers || [])
        .slice()
        .sort((a, b) => a.localeCompare(b, "ru"))
        .map((customer) => ({ value: customer, label: customer })),
    ],
    [filters?.customers]
  );
  const releaseFilterOptions = React.useMemo(
    () =>
      releases
        .filter((release) => release.id && release.promDate)
        .slice()
        .sort((a, b) => a.promDate.localeCompare(b.promDate))
        .map((release) => ({ value: release.id, label: formatDate(release.promDate) })),
    [releases]
  );
  const sortByOptions = React.useMemo(
    () => [
      { value: "manual", label: "Порядок" },
      { value: "load", label: "Нагрузка" },
      { value: "releaseDate", label: "Дата реализации" },
      { value: "priority", label: "Приоритет" },
    ],
    []
  );
  const filteredBacklog = React.useMemo(() => {
    const selectedQuarterIds = new Set(quarterFilterIds);
    const selectedPriorities = new Set(
      priorityFilterValues
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    );
    const selectedReleaseId = releaseFilterValue.trim();
    const selectedStreams = new Set(streamFilterValues.filter((value) => value !== WITHOUT_STREAM_FILTER_VALUE));
    const includeWithoutStream = streamFilterValues.includes(WITHOUT_STREAM_FILTER_VALUE);
    const selectedCustomers = new Set(customerFilterValues.filter((value) => value !== WITHOUT_CUSTOMER_FILTER_VALUE));
    const includeWithoutCustomer = customerFilterValues.includes(WITHOUT_CUSTOMER_FILTER_VALUE);
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase("ru");
    return backlog.filter((item) => {
      if (selectedPriorities.size > 0 && !selectedPriorities.has(Number(item.priority))) {
        return false;
      }
      if (selectedReleaseId && item.releaseDateId !== selectedReleaseId) {
        return false;
      }
      if (selectedStreams.size > 0 || includeWithoutStream) {
        const itemStreams = item.streams || [];
        const hasSelectedStream = itemStreams.some((stream) => selectedStreams.has(stream));
        if (!hasSelectedStream && !(includeWithoutStream && itemStreams.length === 0)) {
          return false;
        }
      }
      if (selectedCustomers.size > 0 || includeWithoutCustomer) {
        const itemCustomers = item.customers || [];
        const hasSelectedCustomer = itemCustomers.some((customer) => selectedCustomers.has(customer));
        if (!hasSelectedCustomer && !(includeWithoutCustomer && itemCustomers.length === 0)) {
          return false;
        }
      }
      if (normalizedSearch) {
        const haystack = `${item.title || ""} ${item.description || ""} ${item.dod || ""}`.toLocaleLowerCase("ru");
        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }
      if (selectedQuarterIds.size === 0) {
        return true;
      }
      return collectItemQuarterIds(item, sprintQuarterById).some((quarterId) => selectedQuarterIds.has(quarterId));
    });
  }, [
    backlog,
    customerFilterValues,
    priorityFilterValues,
    quarterFilterIds,
    releaseFilterValue,
    searchQuery,
    sprintQuarterById,
    streamFilterValues,
  ]);

  const selectedItemIdSet = React.useMemo(
    () => new Set(selectedItemIds),
    [selectedItemIds]
  );

  const availableItems = React.useMemo(
    () => filteredBacklog.filter((item) => !selectedItemIdSet.has(item.id)),
    [filteredBacklog, selectedItemIdSet]
  );

  const selectedItems = React.useMemo(
    () => backlog.filter((item) => selectedItemIdSet.has(item.id)),
    [backlog, selectedItemIdSet]
  );

  const sortedAvailableItems = availableItems;
  const sortedSelectedItems = selectedItems;

  React.useEffect(() => {
    setSelectedItemIds((prev) => prev.filter((itemId) => backlogById.has(itemId)));
  }, [backlogById]);

  const handleMoveItem = React.useCallback((itemId: string, to: "backlog" | "selected") => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (to === "selected") {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return Array.from(next);
    });
  }, []);

  const handleMoveAllToPlan = React.useCallback(() => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      filteredBacklog.forEach((item) => next.add(item.id));
      return Array.from(next);
    });
  }, [filteredBacklog]);

  const handleClearPlan = React.useCallback(() => {
    setSelectedItemIds([]);
  }, []);

  const handleResetFilters = React.useCallback(() => {
    setQuarterFilterIds([]);
    setPriorityFilterValues([]);
    setReleaseFilterValue("");
    setStreamFilterValues([]);
    setCustomerFilterValues([]);
    setSearchQuery("");
  }, []);

  const handleDeleteItem = React.useCallback(async (item: PlanningWorkbenchItem) => {
    if (!window.confirm(`Удалить задачу планирования «${item.title}»?`)) {
      return;
    }
    try {
      setError("");
      await deleteItem(item.id).unwrap();
      setSelectedItemIds((prev) => prev.filter((itemId) => itemId !== item.id));
    } catch (err: any) {
      setError(String(err?.data?.message || err?.data || "Не удалось удалить задачу из планирования"));
    }
  }, [deleteItem]);

  const openCreateDialog = (selectAfter: boolean) => {
    setDialogItem(null);
    setSelectAfterSubmit(selectAfter);
    setDialogOpen(true);
    setError("");
  };

  const openEditDialog = (item: PlanningWorkbenchItem) => {
    setDialogItem(item);
    setSelectAfterSubmit(selectedItemIds.includes(item.id));
    setDialogOpen(true);
    setError("");
  };

  const handleSubmitItem = async (payload: PlanningWorkbenchTaskSubmitPayload) => {
    try {
      setError("");
      if (dialogItem) {
        const updated = await updateItem({
          id: dialogItem.id,
          title: payload.title,
          description: payload.description,
          dod: payload.dod,
          priority: payload.priority,
          customers: payload.customers,
          streams: payload.streams,
          planningDemands: payload.planningDemands,
          releaseDateId: payload.releaseDateId,
          initialQuarterId: payload.initialQuarterId,
          planningQuarterIds: payload.planningQuarterIds || [],
          planningSprintIds: payload.planningSprintIds || [],
          order: dialogItem.order,
        }).unwrap();
        if (selectAfterSubmit) {
          handleMoveItem(updated.id, "selected");
        }
      } else {
        const created = await addItem({
          title: payload.title,
          description: payload.description,
          dod: payload.dod,
          priority: payload.priority,
          customers: payload.customers,
          streams: payload.streams,
          planningDemands: payload.planningDemands,
          releaseDateId: payload.releaseDateId,
          initialQuarterId: payload.initialQuarterId,
          planningQuarterIds: payload.planningQuarterIds || [],
          planningSprintIds: payload.planningSprintIds || [],
        }).unwrap();
        if (selectAfterSubmit) {
          handleMoveItem(created.id, "selected");
        }
      }
      setDialogOpen(false);
      setDialogItem(null);
    } catch (err: any) {
      setError(String(err?.data?.message || err?.data || "Не удалось сохранить задачу планирования"));
    }
  };

  const handlePreview = async () => {
    try {
      setError("");
      const preview = await previewPlanning({
        plannerType: "ALGORITHM",
        itemIds: selectedItemIds,
      }).unwrap();
      setPlanningWorkbenchPreview(preview);
      navigate(`/${teamKey}/planning/review`, { state: { selectedItemIds } });
    } catch (err: any) {
      setError(String(err?.data?.message || err?.data || "Не удалось построить автораспределение"));
    }
  };

  return (
    <Stack spacing={2.5}>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ xs: "flex-start", md: "center" }}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Планирование
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={isPreviewing ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
              disabled={selectedItemIds.length === 0 || isPreviewing}
              onClick={handlePreview}
              data-testid="planning-run-preview"
            >
              Автораспределение нагрузки
            </Button>
          </Stack>
          <Stack spacing={1.5}>
            <FiltersPanel
              layout="wrap"
              withPaper={false}
              filters={[
                {
                  type: "autocomplete",
                  key: "quarters",
                  minWidth: 200,
                  props: {
                    multiple: true,
                    allowCustom: false,
                    label: "Фильтр по кварталу",
                    value: quarterFilterIds,
                    onChange: setQuarterFilterIds,
                    options: quarterOptions,
                    placeholder: "Все кварталы",
                  },
                },
                {
                  type: "autocomplete",
                  key: "priority",
                  minWidth: 150,
                  props: {
                    multiple: true,
                    allowCustom: false,
                    label: "Приоритет",
                    value: priorityFilterValues,
                    onChange: setPriorityFilterValues,
                    options: priorityOptions,
                    placeholder: "Все приоритеты",
                    sortOptions: false,
                  },
                },
                {
                  type: "autocomplete",
                  key: "release",
                  minWidth: 180,
                  props: {
                    allowCustom: false,
                    label: "Релиз",
                    value: releaseFilterValue,
                    onChange: setReleaseFilterValue,
                    options: releaseFilterOptions,
                    placeholder: "Все релизы",
                    sortOptions: false,
                  },
                },
                {
                  type: "autocomplete",
                  key: "stream",
                  minWidth: 200,
                  props: {
                    multiple: true,
                    allowCustom: false,
                    label: "Стрим по задаче",
                    value: streamFilterValues,
                    onChange: setStreamFilterValues,
                    options: streamFilterOptions,
                  },
                },
                {
                  type: "autocomplete",
                  key: "customer",
                  minWidth: 200,
                  props: {
                    multiple: true,
                    allowCustom: false,
                    label: "Заказчик",
                    value: customerFilterValues,
                    onChange: setCustomerFilterValues,
                    options: customerFilterOptions,
                  },
                },
                {
                  type: "search",
                  key: "search",
                  minWidth: 220,
                  maxWidth: 420,
                  props: {
                    label: "Поиск по названию/описанию/DOD",
                    value: searchQuery,
                    onChange: setSearchQuery,
                    placeholder: "Введите текст",
                  },
                },
              ]}
              actions={
                <Button
                  size="small"
                  variant="text"
                  color="inherit"
                  onClick={handleResetFilters}
                  sx={{ color: "text.secondary" }}
                >
                  Очистить
                </Button>
              }
            />
            <SortControls
              value={sortBy}
              onChange={(value) => setSortBy((value || "manual") as PlanningSortBy)}
              options={sortByOptions}
              direction={sortDirection}
              onDirectionChange={setSortDirection}
              sx={{ width: { xs: "100%", md: "fit-content" } }}
            />
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
        <Paper variant="outlined" sx={{ p: 2, flex: 1, minHeight: 480 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Общий backlog
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label={`${sortedAvailableItems.length}`} color="primary" size="small" data-testid="planning-backlog-count" />
                <Button
                  variant="outlined"
                  startIcon={<ArrowForward />}
                  onClick={handleMoveAllToPlan}
                  disabled={sortedAvailableItems.length === 0}
                  data-testid="planning-move-all-to-plan"
                >
                  Все в план
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Add />}
                  onClick={() => openCreateDialog(false)}
                  data-testid="planning-create-backlog"
                >
                  Создать
                </Button>
              </Stack>
            </Stack>
            <Divider />
            <Stack spacing={1.25}>
              {isLoading ? (
                <Typography>Загружаем backlog...</Typography>
              ) : sortedAvailableItems.length === 0 ? (
                <Alert severity="info">Свободных задач для планирования сейчас нет.</Alert>
              ) : (
                sortedAvailableItems.map((item) => (
                  <PlanningWorkbenchItemCard
                    key={item.id}
                    item={item}
                    issues={getItemIssues(item)}
                    releaseLabel={item.releaseDateId ? releaseLabelById.get(item.releaseDateId) : null}
                    participantNameById={participantNameById}
                    actionSlot={
                      <>
                        <Button size="small" variant="text" onClick={() => openEditDialog(item)}>
                          Изменить
                        </Button>
                        <Tooltip title="Удалить">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteItem(item)}
                            disabled={isDeleting}
                            aria-label={`Удалить ${item.title}`}
                          >
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<ArrowForward />}
                          onClick={() => handleMoveItem(item.id, "selected")}
                        >
                          В план
                        </Button>
                      </>
                    }
                  />
                ))
              )}
            </Stack>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, flex: 1, minHeight: 480 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Текущий набор для планирования
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label={`${sortedSelectedItems.length}`} color="primary" size="small" data-testid="planning-selected-count" />
                <Button
                  variant="outlined"
                  startIcon={<ArrowBack />}
                  onClick={handleClearPlan}
                  disabled={sortedSelectedItems.length === 0}
                  data-testid="planning-clear-plan"
                >
                  Все убрать
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Add />}
                  onClick={() => openCreateDialog(true)}
                  data-testid="planning-create-selected"
                >
                  Создать
                </Button>
              </Stack>
            </Stack>
            <Divider />
            <Stack spacing={1.25}>
              {sortedSelectedItems.length === 0 ? (
                <Alert severity="info">Добавьте задачи сюда кнопкой «В план» или создайте новую задачу сразу в правой колонке.</Alert>
              ) : (
                sortedSelectedItems.map((item) => (
                  <PlanningWorkbenchItemCard
                    key={item.id}
                    item={item}
                    issues={getItemIssues(item)}
                    releaseLabel={item.releaseDateId ? releaseLabelById.get(item.releaseDateId) : null}
                    participantNameById={participantNameById}
                    actionSlot={
                      <>
                        <Button size="small" variant="text" onClick={() => openEditDialog(item)}>
                          Изменить
                        </Button>
                        <Tooltip title="Удалить">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteItem(item)}
                            disabled={isDeleting}
                            aria-label={`Удалить ${item.title}`}
                          >
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<ArrowBack />}
                          onClick={() => handleMoveItem(item.id, "backlog")}
                        >
                          Убрать
                        </Button>
                      </>
                    }
                  />
                ))
              )}
            </Stack>
          </Stack>
        </Paper>
      </Stack>

      <PlanningWorkbenchTaskDialog
        open={dialogOpen}
        teamKey={teamKey}
        task={dialogItem}
        participants={participants}
        quarters={quarters}
        sprints={sprints}
        releases={releases}
        customerOptions={filters?.customers || []}
        taskStreamOptions={filters?.streams || []}
        participantRoleOptions={Array.from(new Set([
          ...(filters?.participantRoles || []),
          ...participants
            .map((participant) => participant.role?.trim())
            .filter((value): value is string => Boolean(value)),
        ]))}
        participantStreamOptions={Array.from(new Set([...(filters?.participantStreams || []), ...participants.flatMap((p) => p.userStreams || [])]))}
        submitting={isCreating || isUpdating}
        onClose={() => {
          setDialogOpen(false);
          setDialogItem(null);
        }}
        onSubmit={handleSubmitItem}
      />
    </Stack>
  );
}
