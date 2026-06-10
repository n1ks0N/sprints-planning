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
  useGetParticipantsQuery,
} from "../app/api";
import type { Quarter, Sprint } from "../types";
import FiltersPanel from "../components/filters/FiltersPanel";
import CapacityTable from "../components/CapacityTable";
import { useAppDispatch, useAppSelector } from "./hooks";
import { setCapacityFilters, setCapacitySelectedQuarterIds } from "../app/uiSlice";

moment.locale("ru");

const ruDate = (iso: string) =>
  moment(iso, "YYYY-MM-DD", true).format("DD.MM.YYYY");
const round1 = (v: number) => Math.round(v * 10) / 10;

function getCurrentQuarterId(quarters: Quarter[]) {
  const today = moment().format("YYYY-MM-DD");
  const q = quarters.find((x) => x.startDate <= today && today <= x.endDate);
  return q ? q.id : null;
}

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

export default function CapacityPage() {
  const { data: quarters = [], isLoading: isQuartersLoading } =
    useGetQuartersQuery();
  const { data: sprints = [], isLoading: isSprintsLoading } =
    useGetSprintsQuery(undefined);
  const { data: participantList = [] } = useGetParticipantsQuery();
  const dispatch = useAppDispatch();
  const capacityFilters = useAppSelector((state) => state.ui.capacity);
  const {
    selectedQuarterIds,
    selectedParticipantIds,
    rolesFilter,
    userStreamsFilter,
  } = capacityFilters;

  const { data: capacityRows = [], isLoading: isCapacityLoading } =
    useGetCapacityQuery({
      quarterIds: selectedQuarterIds.length ? selectedQuarterIds : undefined,
      participantIds: selectedParticipantIds.length
        ? selectedParticipantIds
        : undefined,
      roles: rolesFilter.length ? rolesFilter : undefined,
      userStreams: userStreamsFilter.length ? userStreamsFilter : undefined,
    });

  React.useEffect(() => {
    if (!quarters.length) return;
    const actualIds = new Set(quarters.map((q) => q.id));
    const filtered = selectedQuarterIds.filter((id) => actualIds.has(id));
    if (!shallowStringArrayEqual(filtered, selectedQuarterIds)) {
      dispatch(setCapacitySelectedQuarterIds(filtered));
    }
  }, [quarters, selectedQuarterIds, dispatch]);

  React.useEffect(() => {
    if (!quarters.length || selectedQuarterIds.length > 0) return;
    const currentId = getCurrentQuarterId(quarters);
    if (currentId) {
      dispatch(setCapacitySelectedQuarterIds([currentId]));
    }
  }, [quarters, selectedQuarterIds.length, dispatch]);

  const displaySprints = React.useMemo(() => {
    return collectSprintIds(selectedQuarterIds, sprints);
  }, [selectedQuarterIds, sprints]);

  const quarterFilterOptions = React.useMemo(() => {
    return quarters
      .slice()
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .map((q) => ({
        value: q.id,
        label: `${q.name} — ${ruDate(q.startDate)} → ${ruDate(q.endDate)}`,
      }));
  }, [quarters]);

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
                type: "autocomplete",
                key: "quarters",
                minWidth: 280,
                props: {
                  multiple: true,
                  allowCustom: false,
                  label: "Фильтр по кварталам",
                  options: quarterFilterOptions,
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
