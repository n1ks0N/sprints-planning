import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
} from "@reduxjs/toolkit/query/react";
import type {
  FetchBaseQueryError,
  FetchBaseQueryMeta,
  QueryReturnValue,
} from "@reduxjs/toolkit/query";
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
    }),
    updateQuarter: b.mutation<Quarter, Partial<Quarter> & { id: string }>({
      query: (body) => ({ url: "/quarters/update", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        entityTag("Quarter", arg.id),
        listTag("Quarter"),
        listTag("Sprint"),
        listTag("Task"),
      ],
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
    }),
    reorderParticipants: b.mutation<
      { ok: true },
      { orders: { id: string; order: number }[] }
    >({
      query: (body) => ({ url: "/participants/reorder", method: "POST", body }),
      invalidatesTags: [listTag("Participant")],
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
    }),
    updateTask: b.mutation<BacklogItem, Partial<BacklogItem> & { id: string }>(
      {
        query: (body) => ({ url: "/tasks/update", method: "POST", body }),
        invalidatesTags: (result, error, arg) => [
          { type: "Task" as const, id: arg.id },
          { type: "Task" as const, id: "LIST" as const },
        ],
      }
    ),
    deleteTask: b.mutation<BacklogItem, { id: string }>({
      query: (body) => ({ url: "/tasks/delete", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        { type: "Task" as const, id: arg.id },
        { type: "Task" as const, id: "LIST" as const },
      ],
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
    }),
    deleteRelease: b.mutation<Release, { id: string }>({
      query: (body) => ({ url: "/releases/delete", method: "POST", body }),
      invalidatesTags: (result, error, arg) => [
        { type: "Release" as const, id: arg.id },
        { type: "Release" as const, id: "LIST" as const },
      ],
    }),

    // ---- Export ----
    exportExcel: b.query<Blob, void>({
      async queryFn(_arg, _api, _extra, baseQuery) {
        const result = (await baseQuery({
          url: "/export/excel",
          method: "GET",
          responseHandler: async (response: Response) => {
            const blob = await response.blob();
            if (!response.ok) {
              const message = await blob.text();
              throw { status: response.status, data: message };
            }
            return blob;
          },
        })) as QueryReturnValue<Blob, FetchBaseQueryError, FetchBaseQueryMeta>;

        if ("error" in result) {
          const data =
            typeof result.error?.data === "string" ? result.error.data : undefined;
          return { error: { ...result.error, data } as FetchBaseQueryError };
        }

        return { data: result.data as Blob };
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
