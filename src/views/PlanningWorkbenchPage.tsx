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
import { normalizeDayAmount } from "../utils/dayAmount";

type PlanningSortBy = "manual" | "load" | "releaseDate" | "priority";
type SortDirection = "asc" | "desc";
const WITHOUT_STREAM_FILTER_VALUE = "__WITHOUT_STREAM__";
const WITHOUT_CUSTOMER_FILTER_VALUE = "__WITHOUT_CUSTOMER__";
const DEFAULT_PLANNING_PAGE_SIZE = "20";
const PLANNING_FILTERS_STORAGE_KEY_PREFIX = "planning-workbench.filters.v1";

type StoredPlanningFilters = {
  quarterFilterIds: string[];
  priorityFilterValues: string[];
  releaseFilterValue: string;
  streamFilterValues: string[];
  customerFilterValues: string[];
  searchQuery: string;
  planningPageSize: string;
  sortBy: PlanningSortBy;
  sortDirection: SortDirection;
};

type PlanningBacklogQueryArgs = {
  sortBy?: string;
  sortDirection?: string;
  page?: number;
  size?: number;
  quarterIds?: string[];
  priority?: string[];
  releaseDateId?: string;
  streams?: string[];
  customers?: string[];
  search?: string;
  withoutStream?: boolean;
  withoutCustomer?: boolean;
};

type PlanningBacklogFetchPage = {
  content?: PlanningWorkbenchItem[];
  page?: {
    totalPages?: number;
  };
};

const defaultPlanningFilters = (): StoredPlanningFilters => ({
  quarterFilterIds: [],
  priorityFilterValues: [],
  releaseFilterValue: "",
  streamFilterValues: [],
  customerFilterValues: [],
  searchQuery: "",
  planningPageSize: DEFAULT_PLANNING_PAGE_SIZE,
  sortBy: "manual",
  sortDirection: "asc",
});

const planningFiltersStorageKey = (teamKey: string) =>
  `${PLANNING_FILTERS_STORAGE_KEY_PREFIX}:${teamKey || "default"}`;

const buildPlanningBacklogSearchParams = (args: PlanningBacklogQueryArgs) => {
  const params = new URLSearchParams();
  const appendArray = (key: string, values?: string[]) => {
    if (values && values.length > 0) {
      params.set(key, values.join(","));
    }
  };

  if (args.sortBy) params.set("sortBy", args.sortBy);
  if (args.sortDirection) params.set("sortDirection", args.sortDirection);
  if (typeof args.page === "number") params.set("page", String(args.page));
  if (typeof args.size === "number") params.set("size", String(args.size));
  appendArray("quarterIds", args.quarterIds);
  appendArray("priority", args.priority);
  if (args.releaseDateId) params.set("releaseDateId", args.releaseDateId);
  appendArray("streams", args.streams);
  appendArray("customers", args.customers);
  if (args.search) params.set("search", args.search);
  if (args.withoutStream) params.set("withoutStream", "true");
  if (args.withoutCustomer) params.set("withoutCustomer", "true");

  return params;
};

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const readPlanningFilters = (teamKey: string): StoredPlanningFilters | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(planningFiltersStorageKey(teamKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const defaults = defaultPlanningFilters();
    return {
      quarterFilterIds: readStringArray(parsed?.quarterFilterIds),
      priorityFilterValues: readStringArray(parsed?.priorityFilterValues).filter((value) =>
        ["1", "2", "3"].includes(value)
      ),
      releaseFilterValue:
        typeof parsed?.releaseFilterValue === "string" ? parsed.releaseFilterValue : "",
      streamFilterValues: readStringArray(parsed?.streamFilterValues),
      customerFilterValues: readStringArray(parsed?.customerFilterValues),
      searchQuery: typeof parsed?.searchQuery === "string" ? parsed.searchQuery : "",
      planningPageSize:
        typeof parsed?.planningPageSize === "string"
          ? parsed.planningPageSize
          : defaults.planningPageSize,
      sortBy:
        parsed?.sortBy === "load" ||
        parsed?.sortBy === "releaseDate" ||
        parsed?.sortBy === "priority" ||
        parsed?.sortBy === "manual"
          ? parsed.sortBy
          : defaults.sortBy,
      sortDirection:
        parsed?.sortDirection === "desc" || parsed?.sortDirection === "asc"
          ? parsed.sortDirection
          : defaults.sortDirection,
    };
  } catch {
    return null;
  }
};

const writePlanningFilters = (teamKey: string, filters: StoredPlanningFilters) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(planningFiltersStorageKey(teamKey), JSON.stringify(filters));
  } catch {
    // ignore
  }
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const currentQuarterId = (quarters: { id: string; startDate: string; endDate: string }[]) => {
  const today = todayISO();
  return quarters.find((quarter) => quarter.startDate <= today && quarter.endDate >= today)?.id || "";
};

const normalizePageSize = (value: string) => {
  const parsed = Number.parseInt(value.replace(/\D/g, ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, 200);
};

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
};

const getPlanningDemands = (item: PlanningWorkbenchItem): PlanningDemand[] => item.planningDemands || [];

const getItemIssues = (item: PlanningWorkbenchItem) => {
  const issues: string[] = [];
  const planningDemands = getPlanningDemands(item);
  if (planningDemands.length === 0) {
    issues.push("оценка");
  }
  if (
    planningDemands.some(
      (demand) =>
        normalizeDayAmount(demand.days) <= 0 ||
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

const getPlanningItemLoad = (item: PlanningWorkbenchItem) =>
  getPlanningDemands(item).reduce((sum, demand) => sum + normalizeDayAmount(demand.days), 0);

const comparePlanningItems = (
  left: PlanningWorkbenchItem,
  right: PlanningWorkbenchItem,
  sortBy: PlanningSortBy,
  direction: SortDirection,
  releasePromDateById: Map<string, string>
) => {
  const multiplier = direction === "asc" ? 1 : -1;
  let result = 0;

  if (sortBy === "load") {
    result = getPlanningItemLoad(left) - getPlanningItemLoad(right);
  } else if (sortBy === "releaseDate") {
    const leftRelease = left.releaseDateId ? releasePromDateById.get(left.releaseDateId) || "" : "";
    const rightRelease = right.releaseDateId ? releasePromDateById.get(right.releaseDateId) || "" : "";
    result = leftRelease.localeCompare(rightRelease, "ru");
  } else if (sortBy === "priority") {
    result = Number(left.priority || 0) - Number(right.priority || 0);
  } else {
    result = Number(left.order || 0) - Number(right.order || 0);
  }

  if (result !== 0) {
    return result * multiplier;
  }

  const orderResult = Number(left.order || 0) - Number(right.order || 0);
  if (orderResult !== 0) {
    return orderResult;
  }
  const titleResult = (left.title || "").localeCompare(right.title || "", "ru");
  return titleResult !== 0 ? titleResult : left.id.localeCompare(right.id);
};

export default function PlanningWorkbenchPage() {
  const { teamKey = "default" } = useParams<{ teamKey: string }>();
  const initialStoredFilters = React.useMemo(
    () => readPlanningFilters(teamKey) ?? defaultPlanningFilters(),
    [teamKey]
  );
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
  const [isAddingAllToPlan, setIsAddingAllToPlan] = React.useState(false);
  const [quarterFilterIds, setQuarterFilterIds] = React.useState<string[]>(initialStoredFilters.quarterFilterIds);
  const [priorityFilterValues, setPriorityFilterValues] = React.useState<string[]>(initialStoredFilters.priorityFilterValues);
  const [releaseFilterValue, setReleaseFilterValue] = React.useState(initialStoredFilters.releaseFilterValue);
  const [streamFilterValues, setStreamFilterValues] = React.useState<string[]>(initialStoredFilters.streamFilterValues);
  const [customerFilterValues, setCustomerFilterValues] = React.useState<string[]>(initialStoredFilters.customerFilterValues);
  const [searchQuery, setSearchQuery] = React.useState(initialStoredFilters.searchQuery);
  const [planningPageSize, setPlanningPageSize] = React.useState(initialStoredFilters.planningPageSize);
  const [backlogPageNumber, setBacklogPageNumber] = React.useState(0);
  const [itemCacheById, setItemCacheById] = React.useState<Map<string, PlanningWorkbenchItem>>(
    () => new Map()
  );
  const [sortBy, setSortBy] = React.useState<PlanningSortBy>(initialStoredFilters.sortBy);
  const [sortDirection, setSortDirection] = React.useState<SortDirection>(initialStoredFilters.sortDirection);
  const [error, setError] = React.useState("");
  const hasInitializedQuarterFilter = React.useRef(false);

  React.useEffect(() => {
    const stored = readPlanningFilters(teamKey) ?? defaultPlanningFilters();
    hasInitializedQuarterFilter.current = false;
    setQuarterFilterIds(stored.quarterFilterIds);
    setPriorityFilterValues(stored.priorityFilterValues);
    setReleaseFilterValue(stored.releaseFilterValue);
    setStreamFilterValues(stored.streamFilterValues);
    setCustomerFilterValues(stored.customerFilterValues);
    setSearchQuery(stored.searchQuery);
    setPlanningPageSize(stored.planningPageSize);
    setSortBy(stored.sortBy);
    setSortDirection(stored.sortDirection);
    setBacklogPageNumber(0);
  }, [teamKey]);

  const planningPageSizeNumber = React.useMemo(
    () => normalizePageSize(planningPageSize),
    [planningPageSize]
  );

  const planningBacklogFiltersSignature = React.useMemo(
    () =>
      JSON.stringify({
        quarterFilterIds: quarterFilterIds.slice().sort(),
        priorityFilterValues: priorityFilterValues.slice().sort(),
        releaseFilterValue,
        streamFilterValues: streamFilterValues.slice().sort(),
        customerFilterValues: customerFilterValues.slice().sort(),
        searchQuery: searchQuery.trim(),
        planningPageSize: planningPageSizeNumber,
        sortBy,
        sortDirection,
      }),
    [
      customerFilterValues,
      planningPageSizeNumber,
      priorityFilterValues,
      quarterFilterIds,
      releaseFilterValue,
      searchQuery,
      sortBy,
      sortDirection,
      streamFilterValues,
    ]
  );
  const lastPlanningBacklogFiltersSignature = React.useRef(planningBacklogFiltersSignature);
  const effectiveBacklogPageNumber = React.useMemo(() => {
    if (lastPlanningBacklogFiltersSignature.current !== planningBacklogFiltersSignature) {
      return 0;
    }
    return backlogPageNumber;
  }, [backlogPageNumber, planningBacklogFiltersSignature]);
  const selectedStreamFilters = React.useMemo(
    () => streamFilterValues.filter((value) => value !== WITHOUT_STREAM_FILTER_VALUE),
    [streamFilterValues]
  );
  const selectedCustomerFilters = React.useMemo(
    () => customerFilterValues.filter((value) => value !== WITHOUT_CUSTOMER_FILTER_VALUE),
    [customerFilterValues]
  );
  const planningBacklogQueryArgs = React.useMemo(
    () => ({
      sortBy,
      sortDirection,
      page: effectiveBacklogPageNumber,
      size: planningPageSizeNumber,
      quarterIds: quarterFilterIds,
      priority: priorityFilterValues,
      releaseDateId: releaseFilterValue.trim() || undefined,
      streams: selectedStreamFilters.length > 0 ? selectedStreamFilters : undefined,
      customers: selectedCustomerFilters.length > 0 ? selectedCustomerFilters : undefined,
      withoutStream: streamFilterValues.includes(WITHOUT_STREAM_FILTER_VALUE),
      withoutCustomer: customerFilterValues.includes(WITHOUT_CUSTOMER_FILTER_VALUE),
      search: searchQuery.trim(),
    }),
    [
      customerFilterValues,
      effectiveBacklogPageNumber,
      planningPageSizeNumber,
      priorityFilterValues,
      quarterFilterIds,
      releaseFilterValue,
      searchQuery,
      selectedCustomerFilters,
      selectedStreamFilters,
      sortBy,
      sortDirection,
      streamFilterValues,
    ]
  );
  const { data: backlogPage, isLoading, isFetching } = useGetPlanningWorkbenchBacklogQuery(planningBacklogQueryArgs, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const backlog = React.useMemo(() => backlogPage?.content ?? [], [backlogPage]);
  const totalBacklogCount = backlogPage?.page?.totalElements ?? 0;
  const hasMoreBacklog = backlog.length < totalBacklogCount;
  const activeCurrentQuarterId = React.useMemo(() => currentQuarterId(quarters), [quarters]);

  React.useEffect(() => {
    if (hasInitializedQuarterFilter.current) return;
    if (!quarters.length || !activeCurrentQuarterId) return;
    hasInitializedQuarterFilter.current = true;

    const validQuarterIds = new Set(quarters.map((quarter) => quarter.id));
    const validSelected = quarterFilterIds.filter((quarterId) => validQuarterIds.has(quarterId));
    const nextQuarterIds = validSelected.length ? validSelected : [activeCurrentQuarterId];
    if (JSON.stringify(nextQuarterIds) !== JSON.stringify(quarterFilterIds)) {
      setQuarterFilterIds(nextQuarterIds);
    }
  }, [activeCurrentQuarterId, quarterFilterIds, quarters]);

  React.useEffect(() => {
    writePlanningFilters(teamKey, {
      quarterFilterIds,
      priorityFilterValues,
      releaseFilterValue,
      streamFilterValues,
      customerFilterValues,
      searchQuery,
      planningPageSize,
      sortBy,
      sortDirection,
    });
  }, [
    customerFilterValues,
    planningPageSize,
    priorityFilterValues,
    quarterFilterIds,
    releaseFilterValue,
    searchQuery,
    sortBy,
    sortDirection,
    streamFilterValues,
    teamKey,
  ]);

  React.useEffect(() => {
    if (lastPlanningBacklogFiltersSignature.current !== planningBacklogFiltersSignature) {
      lastPlanningBacklogFiltersSignature.current = planningBacklogFiltersSignature;
      setBacklogPageNumber(0);
    }
  }, [planningBacklogFiltersSignature]);

  React.useEffect(() => {
    if (backlog.length === 0) return;
    setItemCacheById((prev) => {
      const next = new Map(prev);
      let changed = false;
      backlog.forEach((item) => {
        if (next.get(item.id) !== item) {
          next.set(item.id, item);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [backlog]);

  React.useEffect(() => {
    const returnedIds = (location.state as { selectedItemIds?: string[] } | null)?.selectedItemIds;
    if (Array.isArray(returnedIds) && returnedIds.length > 0) {
      setSelectedItemIds(returnedIds);
    }
  }, [location.state]);

  const backlogById = React.useMemo(
    () => itemCacheById,
    [itemCacheById]
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
  const releasePromDateById = React.useMemo(
    () => new Map(releases.map((release) => [release.id, release.promDate || ""])),
    [releases]
  );
  const participantNameById = React.useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant.fullName])),
    [participants]
  );
  const quarterOptions = React.useMemo(
    () => quarters.map((quarter) => ({ value: quarter.id, label: quarter.name })),
    [quarters]
  );
  const priorityOptions = React.useMemo(
    () => [
      { value: "1", label: "1" },
      { value: "2", label: "2" },
      { value: "3", label: "3" },
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
      { value: "releaseDate", label: "Дата релиза" },
      { value: "priority", label: "Приоритет" },
    ],
    []
  );
  const tasksPageSizeOptions = React.useMemo(
    () => ["10", "20", "50", "100", "200"].map((value) => ({ value, label: value })),
    []
  );

  const selectedItemIdSet = React.useMemo(
    () => new Set(selectedItemIds),
    [selectedItemIds]
  );

  const availableItems = React.useMemo(
    () => backlog.filter((item) => !selectedItemIdSet.has(item.id)),
    [backlog, selectedItemIdSet]
  );

  const selectedItems = React.useMemo(
    () => selectedItemIds.map((itemId) => backlogById.get(itemId)).filter(Boolean) as PlanningWorkbenchItem[],
    [backlogById, selectedItemIds]
  );

  const sortedAvailableItems = React.useMemo(
    () => availableItems.slice().sort((left, right) => comparePlanningItems(left, right, sortBy, sortDirection, releasePromDateById)),
    [availableItems, releasePromDateById, sortBy, sortDirection]
  );
  const sortedSelectedItems = React.useMemo(
    () => selectedItems.slice().sort((left, right) => comparePlanningItems(left, right, sortBy, sortDirection, releasePromDateById)),
    [releasePromDateById, selectedItems, sortBy, sortDirection]
  );

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

  const fetchAllFilteredPlanningItems = React.useCallback(async () => {
    const baseUrl = process.env.API_URL || "/api/v1/sprints-planning";
    const pageSize = 200;
    const items: PlanningWorkbenchItem[] = [];
    let page = 0;
    let totalPages = 1;

    while (page < totalPages) {
      const params = buildPlanningBacklogSearchParams({
        ...planningBacklogQueryArgs,
        page,
        size: pageSize,
      });
      const response = await fetch(
        `${baseUrl}/${teamKey}/planning-workbench/backlog?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Не удалось загрузить задачи планирования по текущим фильтрам");
      }

      const data = (await response.json()) as PlanningBacklogFetchPage;
      const pageItems = Array.isArray(data.content) ? data.content : [];
      items.push(...pageItems);

      const reportedTotalPages = Number(data.page?.totalPages || 0);
      totalPages = reportedTotalPages > 0 ? reportedTotalPages : page + 1;
      page += 1;
    }

    return items;
  }, [planningBacklogQueryArgs, teamKey]);

  const handleMoveAllToPlan = React.useCallback(async () => {
    setError("");
    setIsAddingAllToPlan(true);
    try {
      const items =
        totalBacklogCount > backlog.length
          ? await fetchAllFilteredPlanningItems()
          : backlog;
      setItemCacheById((prev) => {
        const next = new Map(prev);
        items.forEach((item) => next.set(item.id, item));
        return next;
      });
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        items.forEach((item) => next.add(item.id));
        return Array.from(next);
      });
    } catch (err: any) {
      setError(String(err?.message || "Не удалось загрузить все задачи по текущим фильтрам"));
    } finally {
      setIsAddingAllToPlan(false);
    }
  }, [backlog, fetchAllFilteredPlanningItems, totalBacklogCount]);

  const handleClearPlan = React.useCallback(() => {
    setSelectedItemIds([]);
  }, []);

  const handleResetFilters = React.useCallback(() => {
    setQuarterFilterIds(activeCurrentQuarterId ? [activeCurrentQuarterId] : []);
    setPriorityFilterValues([]);
    setReleaseFilterValue("");
    setStreamFilterValues([]);
    setCustomerFilterValues([]);
    setSearchQuery("");
    setPlanningPageSize(DEFAULT_PLANNING_PAGE_SIZE);
    setSortBy("manual");
    setSortDirection("asc");
  }, [activeCurrentQuarterId]);

  const handlePlanningPageSizeChange = React.useCallback((value: string) => {
    const normalized = value.replace(/\D/g, "") || DEFAULT_PLANNING_PAGE_SIZE;
    setPlanningPageSize(normalized);
  }, []);

  const handleLoadMoreBacklog = React.useCallback(() => {
    if (!hasMoreBacklog || isFetching) return;
    setBacklogPageNumber((prev) => prev + 1);
  }, [hasMoreBacklog, isFetching]);

  const handleDeleteItem = React.useCallback(async (item: PlanningWorkbenchItem) => {
    if (!window.confirm(`Удалить задачу планирования «${item.title}»?`)) {
      return;
    }
    try {
      setError("");
      await deleteItem(item.id).unwrap();
      setSelectedItemIds((prev) => prev.filter((itemId) => itemId !== item.id));
      setItemCacheById((prev) => {
        const next = new Map(prev);
        next.delete(item.id);
        return next;
      });
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
        setItemCacheById((prev) => new Map(prev).set(updated.id, updated));
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
        setItemCacheById((prev) => new Map(prev).set(created.id, created));
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
                  type: "autocomplete",
                  key: "planning-page-size",
                  minWidth: 200,
                  maxWidth: 180,
                  props: {
                    allowCustom: true,
                    label: "Количество задач",
                    value: planningPageSize,
                    onChange: handlePlanningPageSizeChange,
                    options: tasksPageSizeOptions,
                    placeholder: DEFAULT_PLANNING_PAGE_SIZE,
                    commitOnBlur: true,
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
                  startIcon={isAddingAllToPlan ? <CircularProgress size={16} color="inherit" /> : <ArrowForward />}
                  onClick={handleMoveAllToPlan}
                  disabled={totalBacklogCount === 0 || isAddingAllToPlan}
                  data-testid="planning-move-all-to-plan"
                >
                  {isAddingAllToPlan ? "Добавляем..." : `Все в план (${totalBacklogCount || sortedAvailableItems.length})`}
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
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "flex-start", sm: "center" }}
              justifyContent="space-between"
            >
              <Typography variant="body2" color="text.secondary">
                Загружено {backlog.length} задач из {totalBacklogCount}
              </Typography>
              <Button
                variant="outlined"
                onClick={handleLoadMoreBacklog}
                disabled={!hasMoreBacklog || isFetching}
              >
                {isFetching && hasMoreBacklog ? "Загрузка..." : "Загрузить еще"}
              </Button>
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
