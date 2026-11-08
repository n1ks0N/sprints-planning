import { skipToken } from "@reduxjs/toolkit/query";
import useResolvedQuarterFilter from "./useResolvedQuarterFilter";
import useToday from "./useToday";
// src/views/CapacityPage.tsx
import * as React from "react";
import {
  Paper,
  Typography,
} from "@mui/material";
import moment from "moment";
import "moment/locale/ru";

import {
  useGetQuartersQuery,
  useGetSprintsQuery,
  useGetCapacityQuery,
  useActiveParticipantsQuery,
} from "../app/api";
import type { Quarter, Sprint, CapacityRow } from "../types";
import FiltersPanel from "../components/filters/FiltersPanel";
import CapacityTable from "../components/CapacityTable";
import { useAppDispatch, useAppSelector } from "./hooks";
import { setCapacityFilters, setCapacitySelectedQuarterIds } from "../app/uiSlice";

moment.locale("ru");

const EMPTY_QUARTERS: Quarter[] = [];
const EMPTY_SPRINTS: Sprint[] = [];
const EMPTY_CAPACITY: CapacityRow[] = [];

function collectSprintIds(
  selectedQuarterIds: string[],
  allSprints: Sprint[]
) {
  if (!selectedQuarterIds.length) {
    return allSprints
      .slice()
      .sort((a, b) => a.endDate.localeCompare(b.endDate));
  }
  const idSet = new Set(selectedQuarterIds);
  return allSprints
    .filter((s) => idSet.has(s.quarterId))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
}

function shallowStringArrayEqual(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function CapacityPage() {
  const { data: quartersData } = useGetQuartersQuery(undefined, { selectFromResult: ({ data }) => ({ data }) });
  const quarters = quartersData ?? EMPTY_QUARTERS;
  const { data: sprints = EMPTY_SPRINTS } = useGetSprintsQuery(undefined, { selectFromResult: ({ data }) => ({ data }) });
  const { data: participantList = [] } = useActiveParticipantsQuery();
  const dispatch = useAppDispatch();
  const capacityFilters = useAppSelector((state) => state.ui.capacity);
  const {
    selectedQuarterIds: storedQuarterIds,
    selectedParticipantIds,
    rolesFilter,
    userStreamsFilter,
  } = capacityFilters;

  const today = useToday();
  const currentQuarterId = React.useMemo(() => quarters.find(q => q.startDate <= today && today <= q.endDate)?.id, [quarters, today]);
  const persistQuarters = React.useCallback((ids: string[]) => { dispatch(setCapacitySelectedQuarterIds(ids)); }, [dispatch]);
  const selectedQuarterIds = useResolvedQuarterFilter(quartersData, storedQuarterIds, persistQuarters, currentQuarterId);
  const { data: capacityRows = EMPTY_CAPACITY } = useGetCapacityQuery(quartersData ? {
    quarterIds: selectedQuarterIds,
    participantIds: selectedParticipantIds,
    roles: rolesFilter,
    userStreams: userStreamsFilter,
  } : skipToken);

  const displaySprints = React.useMemo(() => {
    return collectSprintIds(selectedQuarterIds, sprints);
  }, [selectedQuarterIds, sprints]);


  const participantOptions = React.useMemo(
    () =>
      participantList.map((p) => ({
        value: p.id,
        label: `${p.fullName}${p.role ? ` (${p.role})` : ""}`,
      })),
    [participantList]
  );

  const roleOptions = React.useMemo(() => {
    const roles = participantList
      .map((p) => p.role)
      .filter((role): role is string => Boolean(role && role.trim()));
    return Array.from(new Set(roles)).sort();
  }, [participantList]);

  const userStreamOptions = React.useMemo(() => {
    const streams = participantList
      .flatMap((p) => p.userStreams || [])
      .filter((stream): stream is string => Boolean(stream && stream.trim()));
    return Array.from(new Set(streams)).sort();
  }, [participantList]);

  const handleQuarterFilterChange = React.useCallback(
    (ids: string[]) => {
      const existing = new Set(quarters.map((q) => q.id));
      const filtered = ids.filter((id) => existing.has(id));
      if (!shallowStringArrayEqual(filtered, selectedQuarterIds)) {
        dispatch(setCapacitySelectedQuarterIds(filtered));
      }
    },
    [quarters, dispatch, selectedQuarterIds]
  );

  const handleParticipantFilterChange = React.useCallback(
    (ids: string[]) => {
      const existing = new Set(participantList.map((p) => p.id));
      const filtered = ids.filter((id) => existing.has(id));
      if (shallowStringArrayEqual(filtered, selectedParticipantIds)) return;
      dispatch(setCapacityFilters({ selectedParticipantIds: filtered }));
    },
    [dispatch, participantList, selectedParticipantIds]
  );

  const handleRoleFilterChange = React.useCallback(
    (values: string[]) => {
      if (shallowStringArrayEqual(values, rolesFilter)) return;
      dispatch(setCapacityFilters({ rolesFilter: values }));
    },
    [dispatch, rolesFilter]
  );

  const handleUserStreamsFilterChange = React.useCallback(
    (values: string[]) => {
      if (shallowStringArrayEqual(values, userStreamsFilter)) return;
      dispatch(setCapacityFilters({ userStreamsFilter: values }));
    },
    [dispatch, userStreamsFilter]
  );

  return (
    <Paper
      elevation={0}
      sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}
    >
      <>
        <Typography variant="h6">Нагрузка по спринтам</Typography>

          <FiltersPanel
            withPaper={false}
            containerSx={{ mb: 1 }}
            gridSx={{
              gridTemplateColumns: {
                xs: "repeat(auto-fit, minmax(240px, 1fr))",
                md: "repeat(auto-fit, minmax(260px, 1fr))",
              },
            }}
            filters={[
              {
                type: "quarters",
                key: "quarters",
                minWidth: 280,
                props: {
                  label: "Фильтр по кварталам",
                  value: selectedQuarterIds,
                  onChange: handleQuarterFilterChange,
                },
              },
              {
                type: "autocomplete",
                key: "participants",
                minWidth: 280,
                props: {
                  multiple: true,
                  allowCustom: false,
                  label: "Фильтр по ФИО",
                  options: participantOptions,
                  value: selectedParticipantIds,
                  onChange: handleParticipantFilterChange,
                },
              },
              {
                type: "autocomplete",
                key: "roles",
                minWidth: 220,
                props: {
                  multiple: true,
                  allowCustom: false,
                  label: "Роли",
                  options: roleOptions,
                  value: rolesFilter,
                  onChange: handleRoleFilterChange,
                },
              },
              {
                type: "autocomplete",
                key: "streams",
                minWidth: 220,
                props: {
                  multiple: true,
                  allowCustom: false,
                  label: "Стрим по участнику",
                  options: userStreamOptions,
                  value: userStreamsFilter,
                  onChange: handleUserStreamsFilterChange,
                },
              },
            ]}
          />
          <CapacityTable rows={capacityRows} sprints={displaySprints} />
      </>
    </Paper>
  );
}

export default React.memo(CapacityPage);
