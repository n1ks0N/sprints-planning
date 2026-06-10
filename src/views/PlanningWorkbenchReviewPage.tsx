import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { ArrowBack, DoneAll, Refresh } from "@mui/icons-material";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useNavigate, useParams } from "react-router-dom";
import {
  useApplyPlanningWorkbenchMutation,
  useGetFiltersQuery,
  useGetParticipantsQuery,
  useGetQuartersQuery,
  useGetReleasesQuery,
  useGetSprintsQuery,
  usePreviewPlanningWorkbenchMutation,
} from "../app/api";
import BacklogTaskCard from "../components/BacklogTaskCard";
import CapacityTable from "../components/CapacityTable";
import type { BacklogItem, CapacityRow, PlanningWorkbenchPreview, Sprint, TaskPriority } from "../types";
import {
  clearPlanningWorkbenchPreview,
  consumePlanningWorkbenchPreview,
  loadPlanningWorkbenchReviewState,
  savePlanningWorkbenchReviewState,
  setPlanningWorkbenchPreview,
} from "./planningWorkbenchPreviewStore";

const toWhole = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
};

const sumLoads = (allocations: Record<string, Record<string, number>> = {}) => {
  const next: Record<string, number> = {};
  Object.values(allocations).forEach((row) => {
    Object.entries(row || {}).forEach(([sprintId, days]) => {
      const wholeDays = toWhole(days);
      if (wholeDays <= 0) return;
      next[sprintId] = (next[sprintId] || 0) + wholeDays;
    });
  });
  return next;
};

const buildDraftAllocations = (
  items: {
    id: string;
    allocations?: Record<string, Record<string, number>>;
  }[]
) => {
  const next: Record<string, Record<string, Record<string, number>>> = {};
  items.forEach((item) => {
    const participantRows: Record<string, Record<string, number>> = {};
    Object.entries(item.allocations || {}).forEach(([participantId, sprintRow]) => {
      participantRows[participantId] = {};
      Object.entries(sprintRow || {}).forEach(([sprintId, days]) => {
        participantRows[participantId][sprintId] = toWhole(days);
      });
    });
    next[item.id] = participantRows;
  });
  return next;
};

const buildDraftTasks = (preview: PlanningWorkbenchPreview): BacklogItem[] =>
  preview.items.map((item) => {
    const explicitParticipantIds = (item.planningDemands || [])
      .filter((demand) => demand.kind === "PARTICIPANT" && demand.participantId)
      .map((demand) => demand.participantId as string);
    const allocationParticipantIds = Object.keys(item.allocations || {});
    const participantIds = Array.from(new Set([...explicitParticipantIds, ...allocationParticipantIds]));
    const loads = sumLoads(item.allocations || {});
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      dod: item.dod,
      priority: item.priority,
      status: Object.keys(loads).length > 0 ? "inprogress" : "backlog",
      customers: item.customers || [],
      streams: item.streams || [],
      participantIds,
      planningQuarterIds: item.planningQuarterIds || [],
      planningSprintIds: item.planningSprintIds || [],
      loads,
      allocations: item.allocations || {},
      notes: {},
      jiraIssues: {},
      quarterIds: item.planningQuarterIds || [],
      releaseDateId: item.releaseDateId ?? null,
      initialQuarterId: item.initialQuarterId ?? null,
      leaderId: null,
      order: item.order,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

const getAllocatedDays = (allocations: Record<string, Record<string, number>> = {}) =>
  Object.values(allocations).reduce(
    (total, row) => total + Object.values(row || {}).reduce((rowTotal, days) => rowTotal + toWhole(days), 0),
    0
  );

const formatSignedDays = (value: number) => `${value > 0 ? "+" : ""}${value} дн.`;

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
};

const bySprintChronology = (a: Sprint, b: Sprint) =>
  a.startDate.localeCompare(b.startDate) ||
  a.endDate.localeCompare(b.endDate) ||
  a.order - b.order ||
  a.name.localeCompare(b.name);

const deriveTaskQuarters = (
  task: BacklogItem,
  allocationsByParticipant: Record<string, Record<string, number>>,
  sprintById: Map<string, Sprint>
): string[] => {
  const explicit = (task.planningQuarterIds || []).filter(Boolean);
  if (explicit.length) {
    return Array.from(new Set(explicit));
  }

  const fromAllocations = new Set<string>();
  Object.values(allocationsByParticipant || {}).forEach((row) => {
    Object.entries(row || {}).forEach(([sprintId, days]) => {
      if (toWhole(days) <= 0) return;
      const sprint = sprintById.get(sprintId);
      if (sprint) {
        fromAllocations.add(sprint.quarterId);
      }
    });
  });

  if (fromAllocations.size > 0) {
    return Array.from(fromAllocations);
  }
  return task.initialQuarterId ? [task.initialQuarterId] : [];
};

const toApplyItemPatch = (task: BacklogItem) => ({
  title: task.title,
  description: task.description,
  dod: task.dod,
  priority: task.priority,
  status: task.status,
  customers: task.customers || [],
  streams: task.streams || [],
  participantIds: task.participantIds || [],
  releaseDateId: task.releaseDateId ?? null,
  initialQuarterId: task.initialQuarterId ?? null,
  planningQuarterIds: task.planningQuarterIds || [],
  planningSprintIds: task.planningSprintIds || [],
  notes: task.notes || {},
  leaderId: task.leaderId ?? null,
  order: task.order,
});

export default function PlanningWorkbenchReviewPage() {
  const { teamKey = "default" } = useParams<{ teamKey: string }>();
  const navigate = useNavigate();
  const { data: participants = [] } = useGetParticipantsQuery();
  const { data: quarters = [] } = useGetQuartersQuery();
  const { data: sprints = [] } = useGetSprintsQuery();
  const { data: releases = [] } = useGetReleasesQuery();
  const { data: filters } = useGetFiltersQuery();
  const [previewPlanning, { isLoading: isResolving }] = usePreviewPlanningWorkbenchMutation();
  const [applyPlanning, { isLoading: isApplying }] = useApplyPlanningWorkbenchMutation();

  const [preview, setPreview] = React.useState<PlanningWorkbenchPreview | null>(null);
  const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>([]);
  const [draftTasks, setDraftTasks] = React.useState<BacklogItem[]>([]);
  const [draftAllocations, setDraftAllocations] = React.useState<
    Record<string, Record<string, Record<string, number>>>
  >({});
  const [hiddenParticipantsTaskIds, setHiddenParticipantsTaskIds] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState("");
  const isHydratedRef = React.useRef(false);

  React.useEffect(() => {
    const savedState = loadPlanningWorkbenchReviewState();
    if (savedState) {
      setPreview(savedState.preview);
      setSelectedItemIds(savedState.selectedItemIds);
      setDraftTasks(savedState.draftTasks);
      setDraftAllocations(savedState.draftAllocations);
      isHydratedRef.current = true;
      return;
    }
    const nextPreview = consumePlanningWorkbenchPreview();
    if (!nextPreview) {
      isHydratedRef.current = true;
      return;
    }
    setPreview(nextPreview);
    setSelectedItemIds(nextPreview.selectedItemIds);
    setDraftTasks(buildDraftTasks(nextPreview));
    setDraftAllocations(buildDraftAllocations(nextPreview.items));
    isHydratedRef.current = true;
  }, []);

  React.useEffect(() => {
    if (!isHydratedRef.current || !preview) return;
    savePlanningWorkbenchReviewState({
      preview,
      selectedItemIds,
      draftTasks,
      draftAllocations,
    });
  }, [draftAllocations, draftTasks, preview, selectedItemIds]);

  const participantSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const participantMap = React.useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants]
  );
  const participantNameById = React.useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant.fullName])),
    [participants]
  );
  const sprintById = React.useMemo(
    () => new Map(sprints.map((sprint) => [sprint.id, sprint])),
    [sprints]
  );
  const sprintsGlobalOrdered = React.useMemo(() => sprints.slice().sort(bySprintChronology), [sprints]);
  const sprintsByQuarter = React.useMemo(() => {
    const map = new Map<string, Sprint[]>();
    sprintsGlobalOrdered.forEach((sprint) => {
      if (!map.has(sprint.quarterId)) {
        map.set(sprint.quarterId, []);
      }
      map.get(sprint.quarterId)!.push(sprint);
    });
    return map;
  }, [sprintsGlobalOrdered]);
  const quartersSorted = React.useMemo(
    () => quarters.slice().sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [quarters]
  );
  const quarterFilterOptions = React.useMemo(
    () => quarters.map((quarter) => ({ value: quarter.id, label: quarter.name })),
    [quarters]
  );
  const releaseOptions = React.useMemo(
    () =>
      releases.map((release) => ({
        value: release.id,
        label: formatDate(release.promDate),
      })),
    [releases]
  );

  const localParticipantSummary = React.useMemo(() => {
    if (!preview) return [];
    return preview.participantSummary.map((row) => {
      let totalDraft = 0;
      let totalLoad = 0;
      let totalOverload = 0;
      let totalFree = 0;
      const cells = row.cells.map((cell) => {
        let draft = 0;
        Object.values(draftAllocations).forEach((taskRows) => {
          draft += toWhole(taskRows?.[cell.participantId]?.[cell.sprintId] ?? 0);
        });
        const total = Number(cell.committed) + draft;
        const overload = Math.max(0, total - Number(cell.capacity));
        const free = Math.max(0, Number(cell.capacity) - total);
        totalDraft += draft;
        totalLoad += total;
        totalOverload += overload;
        totalFree += free;
        return { ...cell, draft, total, overload, free };
      });
      return { ...row, cells, totalDraft, totalLoad, totalOverload, totalFree };
    });
  }, [draftAllocations, preview]);

  const planningParticipantIds = React.useMemo(() => {
    const ids = new Set<string>();
    draftTasks.forEach((task) => {
      (task.participantIds || []).forEach((participantId) => {
        if (participantId) ids.add(participantId);
      });
      Object.entries(draftAllocations[task.id] || {}).forEach(([participantId, sprintRow]) => {
        if (participantId && Object.values(sprintRow || {}).some((days) => toWhole(days) > 0)) {
          ids.add(participantId);
        }
      });
    });
    return ids;
  }, [draftAllocations, draftTasks]);

  const filteredParticipantSummary = React.useMemo(
    () => localParticipantSummary.filter((row) => planningParticipantIds.has(row.participant.id)),
    [localParticipantSummary, planningParticipantIds]
  );

  const previewDisplaySprints = React.useMemo(
    () =>
      (preview?.sprintIds
        .map((sprintId) => sprintById.get(sprintId))
        .filter((sprint): sprint is Sprint => Boolean(sprint)) || [])
        .sort(bySprintChronology),
    [preview, sprintById]
  );

  const previewCapacityRows = React.useMemo<CapacityRow[]>(
    () =>
      filteredParticipantSummary.map((row) => ({
        participant: row.participant,
        cells: row.cells.map((cell) => ({
          participantId: cell.participantId,
          sprintId: cell.sprintId,
          workingDays: 0,
          rate: 1,
          normFactor: 1,
          capacityFactor: 0.85,
          baseCapacity: cell.capacity,
          availableDays: cell.capacity,
          workloadDays: cell.total,
        })),
        totalQuarterAvailable: row.totalCapacity,
        totalQuarterWorkload: row.totalLoad,
      })),
    [filteredParticipantSummary]
  );

  const plannedDaysByTaskId = React.useMemo(() => {
    const next: Record<string, number> = {};
    (preview?.items || []).forEach((item) => {
      const demandDays = (item.planningDemands || []).reduce((sum, demand) => sum + toWhole(demand.days), 0);
      next[item.id] = demandDays > 0 ? demandDays : toWhole(item.estimateDays);
    });
    return next;
  }, [preview]);

  const taskLoadDiffs = React.useMemo(() => {
    const diffs: Record<
      string,
      {
        allocatedDays: number;
        plannedDays: number;
        diff: number;
      }
    > = {};
    draftTasks.forEach((task) => {
      const plannedDays = plannedDaysByTaskId[task.id] || 0;
      const allocatedDays = getAllocatedDays(draftAllocations[task.id] || {});
      const diff = allocatedDays - plannedDays;
      if (diff !== 0) {
        diffs[task.id] = { allocatedDays, plannedDays, diff };
      }
    });
    return diffs;
  }, [draftAllocations, draftTasks, plannedDaysByTaskId]);

  const updateDraftTask = React.useCallback((taskId: string, patch: Partial<BacklogItem>) => {
    setDraftTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;
        return {
          ...task,
          ...patch,
        };
      })
    );
  }, []);

  const handleRemovePreviewTask = React.useCallback((task: BacklogItem) => {
    setDraftTasks((prev) => prev.filter((candidate) => candidate.id !== task.id));
    setDraftAllocations((prev) => {
      const next = structuredClone(prev);
      delete next[task.id];
      return next;
    });
    setSelectedItemIds((prev) => prev.filter((itemId) => itemId !== task.id));
    setHiddenParticipantsTaskIds((prev) => {
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });
  }, []);

  const handleCellChange = React.useCallback((taskId: string, participantId: string, sprintId: string, value: number | string) => {
    const days = toWhole(value);
    setDraftAllocations((prev) => {
      const next = structuredClone(prev);
      next[taskId] ??= {};
      next[taskId][participantId] ??= {};
      next[taskId][participantId][sprintId] = days;
      return next;
    });
  }, []);

  const handleAddParticipant = React.useCallback(
    (task: BacklogItem, participantId: string) => {
      if (!participantId || task.participantIds.includes(participantId)) return;
      updateDraftTask(task.id, { participantIds: [...task.participantIds, participantId] });
      setDraftAllocations((prev) => {
        const next = structuredClone(prev);
        next[task.id] ??= {};
        next[task.id][participantId] ??= {};
        sprintsGlobalOrdered.forEach((sprint) => {
          next[task.id][participantId][sprint.id] ??= 0;
        });
        return next;
      });
    },
    [sprintsGlobalOrdered, updateDraftTask]
  );

  const handleRemoveParticipant = React.useCallback(
    (task: BacklogItem, participantId: string) => {
      setDraftAllocations((prev) => {
        const next = structuredClone(prev);
        if (next[task.id]) {
          delete next[task.id][participantId];
        }
        return next;
      });
      const nextNotes = { ...(task.notes || {}) };
      delete nextNotes[participantId];
      updateDraftTask(task.id, {
        participantIds: task.participantIds.filter((id) => id !== participantId),
        leaderId: task.leaderId === participantId ? null : task.leaderId,
        notes: nextNotes,
      });
    },
    [updateDraftTask]
  );

  const handleChangeParticipant = React.useCallback(
    (task: BacklogItem, fromParticipantId: string, toParticipantId: string) => {
      if (!toParticipantId || fromParticipantId === toParticipantId) return;
      if (!task.participantIds.includes(fromParticipantId)) return;
      if (task.participantIds.includes(toParticipantId)) return;

      setDraftAllocations((prev) => {
        const next = structuredClone(prev);
        const taskRows = next[task.id] || {};
        const rowToMove = taskRows[fromParticipantId] || {};
        delete taskRows[fromParticipantId];
        taskRows[toParticipantId] = { ...rowToMove };
        next[task.id] = taskRows;
        return next;
      });

      const participantIds = task.participantIds.map((id) => (id === fromParticipantId ? toParticipantId : id));
      const nextNotes = { ...(task.notes || {}) };
      if (nextNotes[fromParticipantId]) {
        nextNotes[toParticipantId] = nextNotes[fromParticipantId];
        delete nextNotes[fromParticipantId];
      }

      updateDraftTask(task.id, {
        participantIds,
        leaderId: task.leaderId === fromParticipantId ? toParticipantId : task.leaderId,
        notes: nextNotes,
      });
    },
    [updateDraftTask]
  );

  const handleParticipantOrderChange = React.useCallback(
    (taskId: string, nextOrder: string[]) => {
      updateDraftTask(taskId, { participantIds: nextOrder });
    },
    [updateDraftTask]
  );

  const handleShiftRow = React.useCallback(
    (taskId: string, participantId: string, dir: "left" | "right") => {
      const row = draftAllocations[taskId]?.[participantId] || {};
      const ids = sprintsGlobalOrdered.map((sprint) => sprint.id);
      if (!ids.length) return;

      const shifted = ids.reduce<Record<string, number>>((acc, sprintId) => {
        acc[sprintId] = 0;
        return acc;
      }, {});

      for (let index = 0; index < ids.length; index += 1) {
        const fromSprintId = ids[index];
        const targetIndex = dir === "left" ? index - 1 : index + 1;
        const targetSprintId =
          targetIndex >= 0 && targetIndex < ids.length ? ids[targetIndex] : fromSprintId;
        shifted[targetSprintId] = (shifted[targetSprintId] || 0) + toWhole(row[fromSprintId] || 0);
      }

      setDraftAllocations((prev) => {
        const next = structuredClone(prev);
        next[taskId] ??= {};
        next[taskId][participantId] = shifted;
        return next;
      });
    },
    [draftAllocations, sprintsGlobalOrdered]
  );

  const handleShiftTaskAllocations = React.useCallback(
    (task: BacklogItem, dir: "left" | "right") => {
      const ids = sprintsGlobalOrdered.map((sprint) => sprint.id);
      if (!ids.length) return;
      const taskAllocations = draftAllocations[task.id] || {};
      const nextTaskAllocations: Record<string, Record<string, number>> = {};

      (task.participantIds || []).forEach((participantId) => {
        const row = taskAllocations[participantId] || {};
        const nextRow = ids.reduce<Record<string, number>>((acc, sprintId) => {
          acc[sprintId] = 0;
          return acc;
        }, {});

        for (let index = 0; index < ids.length; index += 1) {
          const fromSprintId = ids[index];
          const targetIndex = dir === "left" ? index - 1 : index + 1;
          const targetSprintId =
            targetIndex >= 0 && targetIndex < ids.length ? ids[targetIndex] : fromSprintId;
          nextRow[targetSprintId] = (nextRow[targetSprintId] || 0) + toWhole(row[fromSprintId] || 0);
        }

        nextTaskAllocations[participantId] = nextRow;
      });

      setDraftAllocations((prev) => ({
        ...prev,
        [task.id]: nextTaskAllocations,
      }));
    },
    [draftAllocations, sprintsGlobalOrdered]
  );

  const handleCopyRowToNextQuarter = React.useCallback(
    (taskId: string, participantId: string) => {
      const row = draftAllocations[taskId]?.[participantId] || {};
      if (!Object.keys(row).length) return;

      const quartersWithLoad = new Set<string>();
      Object.entries(row).forEach(([sprintId, days]) => {
        if (toWhole(days) <= 0) return;
        const sprint = sprintById.get(sprintId);
        if (sprint) {
          quartersWithLoad.add(sprint.quarterId);
        }
      });
      if (!quartersWithLoad.size) return;

      let sourceQuarterIndex = -1;
      for (let index = 0; index < quartersSorted.length; index += 1) {
        if (quartersWithLoad.has(quartersSorted[index].id)) {
          sourceQuarterIndex = index;
        }
      }
      if (sourceQuarterIndex < 0 || sourceQuarterIndex >= quartersSorted.length - 1) {
        return;
      }

      const sourceQuarter = quartersSorted[sourceQuarterIndex];
      const targetQuarter = quartersSorted[sourceQuarterIndex + 1];
      const sourceSprints = sprintsByQuarter.get(sourceQuarter.id) || [];
      const targetSprints = sprintsByQuarter.get(targetQuarter.id) || [];
      if (!sourceSprints.length || !targetSprints.length) return;

      const nextRow = { ...row };
      const maxLength = Math.min(sourceSprints.length, targetSprints.length);
      for (let index = 0; index < maxLength; index += 1) {
        const sourceSprintId = sourceSprints[index].id;
        const targetSprintId = targetSprints[index].id;
        const value = toWhole(row[sourceSprintId] || 0);
        if (value > 0) {
          nextRow[targetSprintId] = (nextRow[targetSprintId] || 0) + value;
        }
      }

      setDraftAllocations((prev) => {
        const next = structuredClone(prev);
        next[taskId] ??= {};
        next[taskId][participantId] = nextRow;
        return next;
      });
    },
    [draftAllocations, sprintById, quartersSorted, sprintsByQuarter]
  );

  const toggleParticipantsVisibility = React.useCallback((taskId: string, hidden: boolean) => {
    setHiddenParticipantsTaskIds((prev) => {
      const next = new Set(prev);
      if (hidden) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  }, []);

  const handleRecalculate = async () => {
    if (!selectedItemIds.length) return;
    try {
      setError("");
      const next = await previewPlanning({
        plannerType: "ALGORITHM",
        itemIds: selectedItemIds,
      }).unwrap();
      setPlanningWorkbenchPreview(next);
      setPreview(next);
      setSelectedItemIds(next.selectedItemIds);
      setDraftTasks(buildDraftTasks(next));
      setDraftAllocations(buildDraftAllocations(next.items));
      setHiddenParticipantsTaskIds(new Set());
    } catch (err: any) {
      setError(String(err?.data?.message || err?.data || "Не удалось пересчитать автораспределение"));
    }
  };

  const handleApply = async () => {
    if (!selectedItemIds.length) return;
    try {
      setError("");
      await applyPlanning({
        itemIds: selectedItemIds,
        allocations: draftAllocations,
        itemPatches: Object.fromEntries(draftTasks.map((task) => [task.id, toApplyItemPatch(task)])),
      }).unwrap();
      clearPlanningWorkbenchPreview();
      navigate(`/${teamKey}/`);
    } catch (err: any) {
      setError(String(err?.data?.message || err?.data || "Не удалось применить распределение"));
    }
  };

  if (!preview) {
    return (
      <Alert severity="warning">
        Черновик автораспределения не найден. Вернитесь на страницу планирования и запустите расчет заново.
      </Alert>
    );
  }

  return (
    <Stack
      spacing={2.5}
      sx={{
        "& .MuiButton-root": {
          textTransform: "none",
        },
      }}
      data-testid="planning-preview-page"
    >
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Результат автораспределения
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 900 }}>
              Черновик результата сохраняется в текущей вкладке, пока вы его не пересчитаете заново или не примените.
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              variant="outlined"
              startIcon={<ArrowBack />}
              onClick={() => {
                navigate(`/${teamKey}/planning`, { state: { selectedItemIds } });
              }}
              data-testid="planning-preview-back"
            >
              Назад к планированию
            </Button>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={handleRecalculate}
              disabled={!selectedItemIds.length || isResolving || isApplying}
              data-testid="planning-preview-recalculate"
            >
              {isResolving ? "Считаем..." : "Пересчитать"}
            </Button>
            <Button
              variant="contained"
              color="success"
              startIcon={<DoneAll />}
              onClick={handleApply}
              disabled={!selectedItemIds.length || isApplying || isResolving}
              data-testid="planning-preview-apply"
            >
              {isApplying ? "Применяем..." : "Подтвердить и применить"}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}
      {preview.warnings.length > 0 && (
        <Alert severity="warning">
          <Stack spacing={0.5}>
            {preview.warnings.map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
          </Stack>
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2.25 }} data-testid="planning-preview-capacity">
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Итоговая нагрузка по участникам
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Используется та же таблица, что и на странице Capacity. Показаны только участники, которые участвуют
              в текущем планировании.
            </Typography>
          </Box>
          <CapacityTable
            rows={previewCapacityRows}
            sprints={previewDisplaySprints}
            emptyText="Нет участников, задействованных в текущем планировании"
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.25 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Задачи, которые будут созданы в backlog
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Здесь используется та же компонентная карточка, что и на странице backlog. Изменения сохраняются
              локально до подтверждения.
            </Typography>
          </Box>
          <Stack spacing={1.25}>
            {draftTasks.map((task) => {
              const loadDiff = taskLoadDiffs[task.id];
              return (
                <Stack key={`future-${task.id}`} spacing={0.75}>
                  {loadDiff && (
                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Chip
                        size="small"
                        color={loadDiff.diff < 0 ? "warning" : "info"}
                        variant="outlined"
                        label={`Нагрузка ${loadDiff.allocatedDays}/${loadDiff.plannedDays} дн. (${formatSignedDays(loadDiff.diff)})`}
                      />
                    </Box>
                  )}
                  <BacklogTaskCard
                    mode="preview"
                    task={task}
                    allocationsByParticipant={draftAllocations[task.id] || {}}
                    participants={participants}
                    participantMap={participantMap}
                    participantOrder={task.participantIds || []}
                    sprintsGlobalOrdered={sprintsGlobalOrdered}
                    sprintsByQuarter={sprintsByQuarter}
                    quartersSorted={quartersSorted}
                    selectedQuarterIds={[]}
                    withoutQuarterFilter={false}
                    quarterFilterOptions={quarterFilterOptions}
                    customerOptions={filters?.customers || []}
                    streamOptions={filters?.streams || []}
                    releaseOptions={releaseOptions}
                    participantSensors={participantSensors}
                    onStatusChange={(item, status) => updateDraftTask(item.id, { status })}
                    onPriorityChange={(item, priority) => updateDraftTask(item.id, { priority })}
                    onUpdateTaskPatch={(item, patch) => updateDraftTask(item.id, patch)}
                    onDuplicateTask={() => undefined}
                    onOpenTaskHistory={() => undefined}
                    onMoveTask={() => undefined}
                    onRemoveTask={handleRemovePreviewTask}
                    isJiraSelected={false}
                    onToggleJiraSelection={() => undefined}
                    onChangeTaskQuarters={(taskId, quarterIds) =>
                      updateDraftTask(taskId, { planningQuarterIds: quarterIds, quarterIds })
                    }
                    getTaskQuarters={(item) => deriveTaskQuarters(item, draftAllocations[item.id] || {}, sprintById)}
                    hasTaskQuarterOverride={() => true}
                    onAllocChange={handleCellChange}
                    onAllocCommit={handleCellChange}
                    onShiftRow={handleShiftRow}
                    onShiftTaskAllocations={handleShiftTaskAllocations}
                    onCopyRowToNextQuarter={handleCopyRowToNextQuarter}
                    onAddParticipant={handleAddParticipant}
                    onRemoveParticipant={handleRemoveParticipant}
                    onChangeParticipant={handleChangeParticipant}
                    onParticipantOrderChange={handleParticipantOrderChange}
                    hiddenParticipants={hiddenParticipantsTaskIds.has(task.id)}
                    onToggleParticipantsVisibility={toggleParticipantsVisibility}
                  />
                </Stack>
              );
            })}
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}
