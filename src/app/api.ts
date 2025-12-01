import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
} from "@reduxjs/toolkit/query/react";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type {
  Quarter,
  Sprint,
  Participant,
  RunVacation,
  CapacityRow,
  BacklogItem,
  Release,
} from "../types";
import { mockBaseQuery } from "../mock/mockApi";

type AnyState = unknown;

const errorMessage = (error: any, fallback: string) => {
  const data = error?.error?.data ?? error?.data ?? error;
  if (typeof data === "string") return data;
  if (typeof data?.message === "string") return data.message;
  return fallback;
};

const notifyError = (message: string, error: any) => {
  const text = `${message}: ${errorMessage(error, "Попробуйте еще раз")}`;
  console.error(text, error);
  if (typeof window !== "undefined") alert(text);
};

const tempId = () => `temp-${Math.random().toString(36).slice(2)}`;

const USE_MOCK = process.env.USE_MOCK === "true";

const baseQuery = USE_MOCK
  ? (mockBaseQuery as BaseQueryFn)
  : fetchBaseQuery({ baseUrl: process.env.API_URL || "/api" });

type TagDescriptor<T extends string> = {
  type: T;
  id: string | number | "LIST";
};

const listTag = <T extends string>(type: T): TagDescriptor<T> => ({
  type,
  id: "LIST",
});

const entityTag = <T extends string>(
  type: T,
  id: string | number
): TagDescriptor<T> => ({
  type,
  id,
});

const collectCachedArgs = <Args>(
  getState: () => AnyState,
  endpointName: string,
  tags: TagDescriptor<string>[]
): Args[] =>
  api.util
    .selectInvalidatedBy(getState() as any, tags as any)
    .filter((q) => q.endpointName === endpointName)
    .map((q) => q.originalArgs as Args);

const applyPatches = <Args>(
  dispatch: any,
  endpointName: string,
  argsList: Args[],
  updater: (draft: any) => void
) =>
  argsList.map((args) =>
    dispatch(
      api.util.updateQueryData(endpointName as any, args as any, updater)
    )
  );

const collectSprintsFromCache = (state: AnyState): Sprint[] => {
  const queries = api.util
    .selectInvalidatedBy(state as any, [listTag("Sprint")])
    .filter((q) => q.endpointName === "getSprints");
  const list: Sprint[] = [];

  for (const q of queries) {
    const data =
      api.endpoints.getSprints.select(q.originalArgs as any)(state as any)
        ?.data || [];
    list.push(...data);
  }

  return list;
};

const findQuarterBySprint = (sprintId: string | undefined, getState: () => AnyState) => {
  if (!sprintId) return undefined;
  const sprints = collectSprintsFromCache(getState());
  return sprints.find((s) => s.id === sprintId)?.quarterId;
};

const getParticipantsFromCache = (state: AnyState): Participant[] =>
  api.endpoints.getParticipants.select()(state as any)?.data || [];

const recomputeSprintLoad = (task: BacklogItem, sprintId: string) => {
  const allocations = task.allocations || {};
  task.loads[sprintId] = Object.values(allocations).reduce(
    (acc, alloc) => acc + (alloc[sprintId] || 0),
    0
  );
};

const applyAllocation = (
  task: BacklogItem,
  participantId: string,
  sprintId: string,
  days: number
) => {
  if (!task.allocations) task.allocations = {};
  if (!task.allocations[participantId]) task.allocations[participantId] = {};
  task.allocations[participantId][sprintId] = Math.max(
    0,
    Math.round(Number(days) || 0)
  );
  recomputeSprintLoad(task, sprintId);
  task.updatedAt = new Date().toISOString().slice(0, 10);
};

const applyBulkAllocation = (
  task: BacklogItem,
  participantId: string,
  allocations: Record<string, number>
) => {
  for (const [sprintId, days] of Object.entries(allocations || {})) {
    applyAllocation(task, participantId, sprintId, days);
  }
};

const applySprintLoad = (task: BacklogItem, sprintId: string, days: number) => {
  task.loads[sprintId] = Math.max(0, Math.round(Number(days) || 0));
  task.updatedAt = new Date().toISOString().slice(0, 10);
};

export const api = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes: [
    "Quarter",
    "Sprint",
    "Participant",
    "RunVacation",
    "Capacity",
    "Task",
    "Release",
  ],
  endpoints: (b) => ({
    // ---- Quarters ----
    getQuarters: b.query<Quarter[], void>({
      query: () => ({ url: "/quarters", method: "GET" }),
      providesTags: (result) =>
        result
          ? [
              listTag("Quarter"),
              ...result.map((q) => entityTag("Quarter", q.id)),
            ]
          : [listTag("Quarter")],
    }),
    addQuarter: b.mutation<Quarter, Partial<Quarter>>({
      query: (body) => ({ url: "/quarters", method: "POST", body }),
      invalidatesTags: (result) =>
        result
          ? [entityTag("Quarter", result.id), listTag("Quarter")]
          : [listTag("Quarter")],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const optimistic: Quarter = {
          id: arg.id ?? tempId(),
          year: arg.year ?? new Date().getFullYear(),
          number: (arg.number as Quarter["number"]) ?? 1,
          name: arg.name ?? "Новый квартал",
          startDate:
            arg.startDate ?? arg.endDate ?? new Date().toISOString().slice(0, 10),
          endDate:
            arg.endDate ?? arg.startDate ?? new Date().toISOString().slice(0, 10),
        };

        const patch = dispatch(
          api.util.updateQueryData("getQuarters", undefined, (draft) => {
            draft.push(optimistic);
          })
        );

        try {
          const { data } = await queryFulfilled;
          dispatch(
            api.util.updateQueryData("getQuarters", undefined, (draft) => {
              const idx = draft.findIndex((q) => q.id === optimistic.id);
              if (idx >= 0) draft[idx] = data;
              else draft.push(data);
            })
          );
        } catch (error) {
          patch.undo();
          notifyError("Не удалось создать квартал", error);
        }
      },
    }),
    updateQuarter: b.mutation<Quarter, Partial<Quarter> & { id: string }>({
      query: (body) => ({ url: "/quarters/update", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        entityTag("Quarter", arg.id),
        listTag("Quarter"),
        listTag("Sprint"),
        listTag("Task"),
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("getQuarters", undefined, (draft) => {
            const idx = draft.findIndex((q) => q.id === arg.id);
            if (idx >= 0) draft[idx] = { ...draft[idx], ...arg } as Quarter;
          })
        );

        try {
          const { data } = await queryFulfilled;
          dispatch(
            api.util.updateQueryData("getQuarters", undefined, (draft) => {
              const idx = draft.findIndex((q) => q.id === data.id);
              if (idx >= 0) draft[idx] = data;
            })
          );
        } catch (error) {
          patch.undo();
          notifyError("Не удалось обновить квартал", error);
        }
      },
    }),
    deleteQuarter: b.mutation<Quarter, { id: string }>({
      query: (body) => ({ url: "/quarters/delete", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        entityTag("Quarter", arg.id),
        listTag("Quarter"),
        listTag("Sprint"),
        listTag("Task"),
        listTag("Capacity"),
        listTag("RunVacation"),
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("getQuarters", undefined, (draft) => {
            const idx = draft.findIndex((q) => q.id === arg.id);
            if (idx >= 0) draft.splice(idx, 1);
          })
        );

        try {
          await queryFulfilled;
        } catch (error) {
          patch.undo();
          notifyError("Не удалось удалить квартал", error);
        }
      },
    }),

    // ---- Sprints ----
    getSprints: b.query<Sprint[], { quarterId?: string } | void>({
      query: (arg) =>
        ({
          url: "/sprints",
          method: "GET",
          params: arg?.quarterId ? { quarterId: arg.quarterId } : undefined,
        }),
      providesTags: (result) =>
        result
          ? [
              listTag("Sprint"),
              ...result.map((s) => entityTag("Sprint", s.id)),
            ]
          : [listTag("Sprint")],
    }),
    addSprint: b.mutation<Sprint, Partial<Sprint>>({
      query: (body) => ({ url: "/sprints", method: "POST", body }),
      invalidatesTags: (result) => [
        listTag("Sprint"),
        listTag("Quarter"),
        listTag("Task"),
        listTag("Capacity"),
        listTag("RunVacation"),
        ...(result ? [entityTag("Sprint", result.id)] : []),
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const optimistic: Sprint = {
          id: arg.id ?? tempId(),
          quarterId: arg.quarterId ?? "",
          name: arg.name ?? "Новый спринт",
          startDate: arg.startDate ?? "",
          endDate: arg.endDate ?? "",
          workingDays: arg.workingDays ?? 0,
          order: arg.order ?? 0,
        } as Sprint;

        const cachedArgs = collectCachedArgs<
          { quarterId?: string } | void
        >(getState, "getSprints", [listTag("Sprint")]);

        const patches = applyPatches(
          dispatch,
          "getSprints",
          cachedArgs,
          (draft: Sprint[]) => {
            const order =
              arg.order ??
              draft.filter((s: Sprint) => s.quarterId === optimistic.quarterId)
                .length + 1;
            draft.push({ ...optimistic, order });
          }
        );

        try {
          const { data } = await queryFulfilled;
          applyPatches(dispatch, "getSprints", cachedArgs, (draft: Sprint[]) => {
            const idx = draft.findIndex(
              (s: Sprint) => s.id === optimistic.id || s.id === data.id
            );
            if (idx >= 0) draft[idx] = data;
          });
        } catch (error) {
          patches.forEach((p) => p.undo());
          notifyError("Не удалось создать спринт", error);
        }
      },
    }),
    updateSprint: b.mutation<Sprint, Partial<Sprint> & { id: string }>({
      query: (body) => ({ url: "/sprints/update", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        entityTag("Sprint", arg.id),
        listTag("Sprint"),
        listTag("Capacity"),
        listTag("RunVacation"),
        listTag("Task"),
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const cachedArgs = collectCachedArgs<
          { quarterId?: string } | void
        >(getState, "getSprints", [listTag("Sprint"), entityTag("Sprint", arg.id)]);

        const patches = applyPatches(
          dispatch,
          "getSprints",
          cachedArgs,
          (draft: Sprint[]) => {
            const idx = draft.findIndex((s: Sprint) => s.id === arg.id);
            if (idx >= 0) draft[idx] = { ...draft[idx], ...arg } as Sprint;
          }
        );

        try {
          const { data } = await queryFulfilled;
          applyPatches(dispatch, "getSprints", cachedArgs, (draft: Sprint[]) => {
            const idx = draft.findIndex((s: Sprint) => s.id === data.id);
            if (idx >= 0) draft[idx] = data;
          });
        } catch (error) {
          patches.forEach((p) => p.undo());
          notifyError("Не удалось обновить спринт", error);
        }
      },
    }),
    deleteSprint: b.mutation<Sprint, { id: string }>({
      query: (body) => ({ url: "/sprints/delete", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        entityTag("Sprint", arg.id),
        listTag("Sprint"),
        listTag("Capacity"),
        listTag("RunVacation"),
        listTag("Task"),
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const cachedArgs = collectCachedArgs<
          { quarterId?: string } | void
        >(getState, "getSprints", [listTag("Sprint"), entityTag("Sprint", arg.id)]);

        const patches = applyPatches(
          dispatch,
          "getSprints",
          cachedArgs,
          (draft: Sprint[]) => {
            const idx = draft.findIndex((s: Sprint) => s.id === arg.id);
            if (idx >= 0) draft.splice(idx, 1);
          }
        );

        try {
          await queryFulfilled;
        } catch (error) {
          patches.forEach((p) => p.undo());
          notifyError("Не удалось удалить спринт", error);
        }
      },
    }),

    // ---- Participants ----
    getParticipants: b.query<Participant[], void>({
      query: () => ({ url: "/participants", method: "GET" }),
      providesTags: (result) =>
        result
          ? [
              listTag("Participant"),
              ...result.map((p) => entityTag("Participant", p.id)),
            ]
          : [listTag("Participant")],
    }),
    addParticipant: b.mutation<Participant, Partial<Participant>>({
      query: (body) => ({ url: "/participants", method: "POST", body }),
      invalidatesTags: (result) => [
        listTag("Participant"),
        listTag("Capacity"),
        listTag("RunVacation"),
        ...(result ? [entityTag("Participant", result.id)] : []),
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const optimistic: Participant = {
          id: arg.id ?? tempId(),
          fullName: arg.fullName ?? "Новый участник",
          role: arg.role ?? "",
          rate: arg.rate ?? 1,
        } as Participant;

        const patch = dispatch(
          api.util.updateQueryData("getParticipants", undefined, (draft) => {
            draft.push(optimistic);
          })
        );

        try {
          const { data } = await queryFulfilled;
          dispatch(
            api.util.updateQueryData("getParticipants", undefined, (draft) => {
              const idx = draft.findIndex((p) => p.id === optimistic.id);
              if (idx >= 0) draft[idx] = data;
              else draft.push(data);
            })
          );
        } catch (error) {
          patch.undo();
          notifyError("Не удалось создать участника", error);
        }
      },
    }),
    updateParticipant: b.mutation<
      Participant,
      Partial<Participant> & { id: string }
    >({
      query: (body) => ({ url: "/participants/update", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        entityTag("Participant", arg.id),
        listTag("Participant"),
        listTag("Capacity"),
        listTag("RunVacation"),
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("getParticipants", undefined, (draft) => {
            const idx = draft.findIndex((p) => p.id === arg.id);
            if (idx >= 0) draft[idx] = { ...draft[idx], ...arg } as Participant;
          })
        );

        try {
          const { data } = await queryFulfilled;
          dispatch(
            api.util.updateQueryData("getParticipants", undefined, (draft) => {
              const idx = draft.findIndex((p) => p.id === data.id);
              if (idx >= 0) draft[idx] = data;
            })
          );
        } catch (error) {
          patch.undo();
          notifyError("Не удалось обновить участника", error);
        }
      },
    }),
    deleteParticipant: b.mutation<Participant, { id: string }>({
      query: (body) => ({ url: "/participants/delete", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        entityTag("Participant", arg.id),
        listTag("Participant"),
        listTag("Capacity"),
        listTag("RunVacation"),
        listTag("Task"),
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("getParticipants", undefined, (draft) => {
            const idx = draft.findIndex((p) => p.id === arg.id);
            if (idx >= 0) draft.splice(idx, 1);
          })
        );

        try {
          await queryFulfilled;
        } catch (error) {
          patch.undo();
          notifyError("Не удалось удалить участника", error);
        }
      },
    }),
    reorderParticipants: b.mutation<
      { ok: true },
      { orders: { id: string; order: number }[] }
    >({
      query: (body) => ({ url: "/participants/reorder", method: "POST", body }),
      invalidatesTags: [listTag("Participant")],
      async onQueryStarted({ orders }, { dispatch, queryFulfilled }) {
        const orderMap = new Map<string, number>();
        for (const o of orders) orderMap.set(o.id, o.order);

        const patch = dispatch(
          api.util.updateQueryData("getParticipants", undefined, (draft) => {
            draft.sort(
              (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
            );
          })
        );

        try {
          await queryFulfilled;
        } catch (error) {
          patch.undo();
          notifyError("Не удалось изменить порядок участников", error);
        }
      },
    }),

    // ---- Run/Vacation & Capacity ----
    getRunVacation: b.query<RunVacation[], { quarterId: string }>({
      query: ({ quarterId }) =>
        ({ url: "/runvac", method: "GET", params: { quarterId } }),
      providesTags: (result, error, arg) => [
        { type: "RunVacation" as const, id: "LIST" as const },
        { type: "RunVacation" as const, id: arg.quarterId },
      ],
    }),
    upsertRunVacation: b.mutation<RunVacation, Partial<RunVacation>>({
      query: (body) => ({ url: "/runvac", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        { type: "RunVacation" as const, id: "LIST" as const },
        arg?.sprintId
          ? { type: "RunVacation" as const, id: arg.sprintId }
          : { type: "RunVacation" as const, id: "LIST" as const },
        { type: "Capacity" as const, id: "LIST" as const },
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const quarterId = findQuarterBySprint(arg.sprintId, getState);
        const cachedArgs = collectCachedArgs<{ quarterId: string }>(
          getState,
          "getRunVacation",
          [
            { type: "RunVacation", id: "LIST" },
            ...(quarterId ? [{ type: "RunVacation", id: quarterId }] : []),
          ]
        );

        const optimistic: RunVacation = {
          participantId: arg.participantId || "",
          sprintId: arg.sprintId || "",
          runDays: Math.max(0, Math.round(Number(arg.runDays ?? 0))),
          vacationNormDays: Math.max(
            0,
            Math.round(Number(arg.vacationNormDays ?? 0))
          ),
        } as RunVacation;

        const patches = applyPatches(
          dispatch,
          "getRunVacation",
          cachedArgs,
          (draft: RunVacation[]) => {
            const idx = draft.findIndex(
              (r: RunVacation) =>
                r.participantId === optimistic.participantId &&
                r.sprintId === optimistic.sprintId
            );
            if (idx >= 0) draft[idx] = { ...draft[idx], ...optimistic };
            else draft.push(optimistic);
          }
        );

        try {
          const { data } = await queryFulfilled;
          applyPatches(dispatch, "getRunVacation", cachedArgs, (draft) => {
            const idx = draft.findIndex(
              (r: RunVacation) =>
                r.participantId === data.participantId && r.sprintId === data.sprintId
            );
            if (idx >= 0) draft[idx] = data;
            else draft.push(data);
          });
        } catch (error) {
          patches.forEach((p) => p.undo());
          notifyError("Не удалось сохранить нагрузку/отпуск", error);
        }
      },
    }),
    bulkRunVacation: b.mutation<
      { ok: true },
      {
        quarterId: string;
        roles?: string[];
        daysPerSprint: number;
        multiplyByRate: boolean;
      }
    >({
      query: (body) => ({ url: "/runvac/bulk", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        { type: "RunVacation" as const, id: "LIST" as const },
        arg.quarterId
          ? { type: "RunVacation" as const, id: arg.quarterId }
          : { type: "RunVacation" as const, id: "LIST" as const },
        { type: "Capacity" as const, id: "LIST" as const },
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const participantMap = new Map(
          getParticipantsFromCache(getState()).map((p) => [p.id, p])
        );
        const sprintIds = collectSprintsFromCache(getState())
          .filter((s) => s.quarterId === arg.quarterId)
          .map((s) => s.id);
        const roleSet = arg.roles?.length ? new Set(arg.roles) : null;

        const cachedArgs = collectCachedArgs<{ quarterId: string }>(
          getState,
          "getRunVacation",
          [
            { type: "RunVacation", id: "LIST" },
            { type: "RunVacation", id: arg.quarterId },
          ]
        );

        const patches = applyPatches(
          dispatch,
          "getRunVacation",
          cachedArgs,
          (draft: RunVacation[]) => {
            for (const rv of draft) {
              if (!sprintIds.includes(rv.sprintId)) continue;
              const participant = participantMap.get(rv.participantId);
              if (roleSet && (!participant || !roleSet.has(participant.role))) continue;
              const base = Number(arg.daysPerSprint) || 0;
              const next = arg.multiplyByRate
                ? Math.max(0, Math.round(base * (participant?.rate ?? 1)))
                : Math.max(0, Math.round(base));
              rv.runDays = next;
            }
          }
        );

        try {
          await queryFulfilled;
        } catch (error) {
          patches.forEach((p) => p.undo());
          notifyError("Не удалось применить массовое обновление нагрузки", error);
        }
      },
    }),
    getCapacity: b.query<CapacityRow[], { quarterId: string }>({
      query: ({ quarterId }) =>
        ({ url: "/capacity", method: "GET", params: { quarterId } }),
      providesTags: (result, error, arg) => [
        { type: "Capacity" as const, id: "LIST" as const },
        { type: "Capacity" as const, id: arg.quarterId },
      ],
    }),

    // ---- Backlog ----
    getTasks: b.query<BacklogItem[], { quarterId?: string } | void>({
      query: (arg) =>
        ({
          url: "/tasks",
          method: "GET",
          params: arg?.quarterId ? { quarterId: arg.quarterId } : undefined,
        }),
      providesTags: (result) =>
        result
          ? [
              { type: "Task" as const, id: "LIST" as const },
              ...result.map((t) => ({ type: "Task" as const, id: t.id })),
            ]
          : [{ type: "Task" as const, id: "LIST" as const }],
    }),
    addTask: b.mutation<BacklogItem, Partial<BacklogItem>>({
      query: (body) => ({ url: "/tasks", method: "POST", body }),
      invalidatesTags: (result) => [
        listTag("Task"),
        ...(result ? [entityTag("Task", result.id)] : []),
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const now = new Date().toISOString().slice(0, 10);
        const optimistic: BacklogItem = {
          id: arg.id ?? tempId(),
          title: arg.title ?? "Новая задача",
          description: arg.description ?? "",
          dod: arg.dod ?? "",
          priority: (arg.priority as BacklogItem["priority"]) ?? 2,
          customer: arg.customer ?? "",
          stream: arg.stream ?? "",
          participantIds: Array.isArray(arg.participantIds)
            ? [...arg.participantIds]
            : [],
          loads: { ...(arg.loads || {}) },
          allocations: arg.allocations ? { ...arg.allocations } : undefined,
          notes: arg.notes ? { ...arg.notes } : undefined,
          quarterIds: arg.quarterIds ? [...arg.quarterIds] : undefined,
          releaseDate: arg.releaseDate,
          releaseSprintId: arg.releaseSprintId,
          leaderId: arg.leaderId ?? null,
          createdAt: now,
          updatedAt: now,
        } as BacklogItem;

        const cachedArgs = collectCachedArgs<{ quarterId?: string } | void>(
          getState,
          "getTasks",
          [{ type: "Task", id: "LIST" }]
        );

        const patches = applyPatches(
          dispatch,
          "getTasks",
          cachedArgs,
          (draft: BacklogItem[]) => {
            draft.push(optimistic);
          }
        );

        try {
          const { data } = await queryFulfilled;
          applyPatches(dispatch, "getTasks", cachedArgs, (draft: BacklogItem[]) => {
            const idx = draft.findIndex((t: BacklogItem) => t.id === optimistic.id);
            if (idx >= 0) draft[idx] = data;
            else draft.push(data);
          });
        } catch (error) {
          patches.forEach((p) => p.undo());
          notifyError("Не удалось создать задачу", error);
        }
      },
    }),
    updateTask: b.mutation<BacklogItem, Partial<BacklogItem> & { id: string }>(
      {
        query: (body) => ({ url: "/tasks/update", method: "POST", body }),
        invalidatesTags: (result, error, arg) => [
          { type: "Task" as const, id: arg.id },
          { type: "Task" as const, id: "LIST" as const },
        ],
        async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
          const cachedArgs = collectCachedArgs<{ quarterId?: string } | void>(
            getState,
            "getTasks",
            [
              { type: "Task", id: "LIST" },
              { type: "Task", id: arg.id },
            ]
          );

          const patches = applyPatches(
            dispatch,
            "getTasks",
            cachedArgs,
            (draft: BacklogItem[]) => {
              const idx = draft.findIndex((t: BacklogItem) => t.id === arg.id);
              if (idx >= 0) draft[idx] = { ...draft[idx], ...arg } as BacklogItem;
            }
          );

          try {
            const { data } = await queryFulfilled;
            applyPatches(dispatch, "getTasks", cachedArgs, (draft: BacklogItem[]) => {
              const idx = draft.findIndex((t: BacklogItem) => t.id === data.id);
              if (idx >= 0) draft[idx] = data;
            });
          } catch (error) {
            patches.forEach((p) => p.undo());
            notifyError("Не удалось обновить задачу", error);
          }
        },
      }
    ),
    deleteTask: b.mutation<BacklogItem, { id: string }>({
      query: (body) => ({ url: "/tasks/delete", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        { type: "Task" as const, id: arg.id },
        { type: "Task" as const, id: "LIST" as const },
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const cachedArgs = collectCachedArgs<{ quarterId?: string } | void>(
          getState,
          "getTasks",
          [
            { type: "Task", id: "LIST" },
            { type: "Task", id: arg.id },
          ]
        );

        const patches = applyPatches(
          dispatch,
          "getTasks",
          cachedArgs,
          (draft: BacklogItem[]) => {
            const idx = draft.findIndex((t: BacklogItem) => t.id === arg.id);
            if (idx >= 0) draft.splice(idx, 1);
          }
        );

        try {
          await queryFulfilled;
        } catch (error) {
          patches.forEach((p) => p.undo());
          notifyError("Не удалось удалить задачу", error);
        }
      },
    }),

    // Новый (детализация по участникам)
    upsertTaskAllocation: b.mutation<
      BacklogItem,
      { taskId: string; participantId: string; sprintId: string; days: number }
    >({
      query: (body) => ({ url: "/taskalloc", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        { type: "Task" as const, id: arg.taskId },
        { type: "Task" as const, id: "LIST" as const },
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const cachedArgs = collectCachedArgs<{ quarterId?: string } | void>(
          getState,
          "getTasks",
          [
            { type: "Task", id: "LIST" },
            { type: "Task", id: arg.taskId },
          ]
        );

        const patches = applyPatches(
          dispatch,
          "getTasks",
          cachedArgs,
          (draft: BacklogItem[]) => {
            const task = draft.find((t: BacklogItem) => t.id === arg.taskId);
            if (task)
              applyAllocation(
                task,
                arg.participantId,
                arg.sprintId,
                arg.days
              );
          }
        );

        try {
          const { data } = await queryFulfilled;
          applyPatches(dispatch, "getTasks", cachedArgs, (draft: BacklogItem[]) => {
            const idx = draft.findIndex((t: BacklogItem) => t.id === data.id);
            if (idx >= 0) draft[idx] = data;
          });
        } catch (error) {
          patches.forEach((p) => p.undo());
          notifyError("Не удалось сохранить распределение задачи", error);
        }
      },
    }),

    upsertTaskAllocationBulk: b.mutation<
      BacklogItem,
      { taskId: string; participantId: string; allocations: Record<string, number> }
    >({
      query: (body) => ({ url: "/taskalloc/bulk", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        { type: "Task" as const, id: arg.taskId },
        { type: "Task" as const, id: "LIST" as const },
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const cachedArgs = collectCachedArgs<{ quarterId?: string } | void>(
          getState,
          "getTasks",
          [
            { type: "Task", id: "LIST" },
            { type: "Task", id: arg.taskId },
          ]
        );

        const patches = applyPatches(
          dispatch,
          "getTasks",
          cachedArgs,
          (draft: BacklogItem[]) => {
            const task = draft.find((t: BacklogItem) => t.id === arg.taskId);
            if (task) applyBulkAllocation(task, arg.participantId, arg.allocations);
          }
        );

        try {
          const { data } = await queryFulfilled;
          applyPatches(dispatch, "getTasks", cachedArgs, (draft: BacklogItem[]) => {
            const idx = draft.findIndex((t: BacklogItem) => t.id === data.id);
            if (idx >= 0) draft[idx] = data;
          });
        } catch (error) {
          patches.forEach((p) => p.undo());
          notifyError("Не удалось сохранить распределение по спринтам", error);
        }
      },
    }),

    // Легаси-алиас для совместимости с undoSlice и старым кодом
    upsertTaskLoad: b.mutation<
      BacklogItem,
      { taskId: string; sprintId: string; days: number }
    >({
      query: (body) => ({ url: "/taskload", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        { type: "Task" as const, id: arg.taskId },
        { type: "Task" as const, id: "LIST" as const },
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const cachedArgs = collectCachedArgs<{ quarterId?: string } | void>(
          getState,
          "getTasks",
          [
            { type: "Task", id: "LIST" },
            { type: "Task", id: arg.taskId },
          ]
        );

        const patches = applyPatches(
          dispatch,
          "getTasks",
          cachedArgs,
          (draft: BacklogItem[]) => {
            const task = draft.find((t: BacklogItem) => t.id === arg.taskId);
            if (task) applySprintLoad(task, arg.sprintId, arg.days);
          }
        );

        try {
          const { data } = await queryFulfilled;
          applyPatches(dispatch, "getTasks", cachedArgs, (draft: BacklogItem[]) => {
            const idx = draft.findIndex((t: BacklogItem) => t.id === data.id);
            if (idx >= 0) draft[idx] = data;
          });
        } catch (error) {
          patches.forEach((p) => p.undo());
          notifyError("Не удалось сохранить загрузку задачи", error);
        }
      },
    }),

    // ---- Releases ----
    getReleases: b.query<Release[], void>({
      query: () => ({ url: "/releases", method: "GET" }),
      providesTags: (result) =>
        result
          ? [
              { type: "Release" as const, id: "LIST" as const },
              ...result.map((r) => ({ type: "Release" as const, id: r.id })),
            ]
          : [{ type: "Release" as const, id: "LIST" as const }],
    }),
    addRelease: b.mutation<Release, Partial<Release> & { promDate: string }>({
      query: (body) => ({ url: "/releases", method: "POST", body }),
      invalidatesTags: (result) => [
        listTag("Release"),
        ...(result ? [entityTag("Release", result.id)] : []),
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const now = new Date().toISOString().slice(0, 10);
        const optimistic: Release = {
          id: arg.id ?? tempId(),
          name: arg.name,
          promDate: arg.promDate,
          psiDate: arg.psiDate,
          opsStart: arg.opsStart,
          opsEnd: arg.opsEnd,
          regressStart: arg.regressStart,
          regressEnd: arg.regressEnd,
          ffDate: arg.ffDate,
          ffInnerDate: arg.ffInnerDate,
          iftStart: arg.iftStart,
          iftEnd: arg.iftEnd,
          buildDate: arg.buildDate,
          crDate: arg.crDate,
          devStart: arg.devStart,
          devEnd: arg.devEnd,
          stDate: arg.stDate,
          createdAt: now,
          updatedAt: now,
        } as Release;

        const patch = dispatch(
          api.util.updateQueryData("getReleases", undefined, (draft) => {
            draft.push(optimistic);
          })
        );

        try {
          const { data } = await queryFulfilled;
          dispatch(
            api.util.updateQueryData("getReleases", undefined, (draft) => {
              const idx = draft.findIndex((r) => r.id === optimistic.id);
              if (idx >= 0) draft[idx] = data;
              else draft.push(data);
            })
          );
        } catch (error) {
          patch.undo();
          notifyError("Не удалось создать релиз", error);
        }
      },
    }),
    updateRelease: b.mutation<
      Release,
      (Partial<Release> & { id: string }) & { action?: "recalc" | "clear" }
    >({
      query: (body) => ({ url: "/releases/update", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        { type: "Release" as const, id: arg.id },
        { type: "Release" as const, id: "LIST" as const },
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("getReleases", undefined, (draft) => {
            const idx = draft.findIndex((r) => r.id === arg.id);
            if (idx >= 0) draft[idx] = { ...draft[idx], ...arg } as Release;
          })
        );

        try {
          const { data } = await queryFulfilled;
          dispatch(
            api.util.updateQueryData("getReleases", undefined, (draft) => {
              const idx = draft.findIndex((r) => r.id === data.id);
              if (idx >= 0) draft[idx] = data;
            })
          );
        } catch (error) {
          patch.undo();
          notifyError("Не удалось обновить релиз", error);
        }
      },
    }),
    deleteRelease: b.mutation<Release, { id: string }>({
      query: (body) => ({ url: "/releases/delete", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        { type: "Release" as const, id: arg.id },
        { type: "Release" as const, id: "LIST" as const },
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("getReleases", undefined, (draft) => {
            const idx = draft.findIndex((r) => r.id === arg.id);
            if (idx >= 0) draft.splice(idx, 1);
          })
        );

        try {
          await queryFulfilled;
        } catch (error) {
          patch.undo();
          notifyError("Не удалось удалить релиз", error);
        }
      },
    }),

    // ---- Export ----
    exportExcel: b.query<Blob, void>({
      async queryFn() {
        const baseUrl = process.env.API_URL || "/api";
        try {
          const response = await fetch(`${baseUrl}/export/excel`);
          const blob = await response.blob();
          if (!response.ok) {
            const text = await blob.text();
            return {
              error: {
                status: response.status,
                data: typeof text === "string" ? text : "Export failed",
              } as FetchBaseQueryError,
            };
          }
          return { data: blob };
        } catch (err: any) {
          return {
            error: {
              status: 500,
              data: err?.message || "Failed to export",
            } as FetchBaseQueryError,
          };
        }
      },
    }),
  }),
});

export const {
  useGetQuartersQuery,
  useAddQuarterMutation,
  useUpdateQuarterMutation,
  useDeleteQuarterMutation,

  useGetSprintsQuery,
  useAddSprintMutation,
  useUpdateSprintMutation,
  useDeleteSprintMutation,

  useGetParticipantsQuery,
  useAddParticipantMutation,
  useUpdateParticipantMutation,
  useDeleteParticipantMutation,
  useReorderParticipantsMutation,

  useGetRunVacationQuery,
  useUpsertRunVacationMutation,
  useBulkRunVacationMutation,
  useGetCapacityQuery,

  useGetTasksQuery,
  useAddTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useUpsertTaskAllocationMutation,
  useUpsertTaskAllocationBulkMutation,
  useUpsertTaskLoadMutation,

  useGetReleasesQuery,
  useAddReleaseMutation,
  useUpdateReleaseMutation,
  useDeleteReleaseMutation,

  useLazyExportExcelQuery,
} = api;
