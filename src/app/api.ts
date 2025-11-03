import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
} from "@reduxjs/toolkit/query/react";
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
      providesTags: ["Quarter"],
    }),
    addQuarter: b.mutation<Quarter, Partial<Quarter>>({
      query: (body) => ({ url: "/quarters", method: "POST", body }),
      invalidatesTags: ["Quarter"],
    }),
    updateQuarter: b.mutation<Quarter, Partial<Quarter> & { id: string }>({
      query: (body) => ({ url: "/quarters/update", method: "POST", body }),
      invalidatesTags: ["Quarter", "Sprint", "Task"],
    }),
    deleteQuarter: b.mutation<Quarter, { id: string }>({
      query: (body) => ({ url: "/quarters/delete", method: "POST", body }),
      invalidatesTags: ["Quarter", "Sprint", "Task", "Capacity", "RunVacation"],
    }),

    // ---- Sprints ----
    getSprints: b.query<Sprint[], { quarterId?: string } | void>({
      query: (arg) =>
        arg?.quarterId
          ? ({
              url: `/sprints`,
              method: "GET",
              params: { quarterId: arg.quarterId },
            } as any)
          : { url: "/sprints", method: "GET" },
      providesTags: ["Sprint", "Quarter"],
    }),
    addSprint: b.mutation<Sprint, Partial<Sprint>>({
      query: (body) => ({ url: "/sprints", method: "POST", body }),
      invalidatesTags: ["Sprint", "Quarter", "Task", "Capacity", "RunVacation"],
    }),
    updateSprint: b.mutation<Sprint, Partial<Sprint> & { id: string }>({
      query: (body) => ({ url: "/sprints/update", method: "POST", body }),
      invalidatesTags: ["Sprint", "Capacity", "RunVacation", "Task"],
    }),
    deleteSprint: b.mutation<Sprint, { id: string }>({
      query: (body) => ({ url: "/sprints/delete", method: "POST", body }),
      invalidatesTags: ["Sprint", "Capacity", "RunVacation", "Task"],
    }),

    // ---- Participants ----
    getParticipants: b.query<Participant[], void>({
      query: () => ({ url: "/participants", method: "GET" }),
      providesTags: ["Participant"],
    }),
    addParticipant: b.mutation<Participant, Partial<Participant>>({
      query: (body) => ({ url: "/participants", method: "POST", body }),
      invalidatesTags: ["Participant", "Capacity", "RunVacation"],
    }),
    updateParticipant: b.mutation<
      Participant,
      Partial<Participant> & { id: string }
    >({
      query: (body) => ({ url: "/participants/update", method: "POST", body }),
      invalidatesTags: ["Participant", "Capacity", "RunVacation"],
    }),
    deleteParticipant: b.mutation<Participant, { id: string }>({
      query: (body) => ({ url: "/participants/delete", method: "POST", body }),
      invalidatesTags: ["Participant", "Capacity", "RunVacation", "Task"],
    }),
    reorderParticipants: b.mutation<
      { ok: true },
      { orders: { id: string; order: number }[] }
    >({
      query: (body) => ({ url: "/participants/reorder", method: "POST", body }),
      invalidatesTags: ["Participant"],
    }),

    // ---- Run/Vacation & Capacity ----
    getRunVacation: b.query<RunVacation[], { quarterId: string }>({
      query: ({ quarterId }) =>
        ({ url: "/runvac", method: "GET", params: { quarterId } } as any),
      providesTags: ["RunVacation"],
    }),
    upsertRunVacation: b.mutation<RunVacation, Partial<RunVacation>>({
      query: (body) => ({ url: "/runvac", method: "POST", body }),
      invalidatesTags: ["RunVacation", "Capacity"],
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
      invalidatesTags: ["RunVacation", "Capacity"],
    }),
    getCapacity: b.query<CapacityRow[], { quarterId: string }>({
      query: ({ quarterId }) =>
        ({ url: "/capacity", method: "GET", params: { quarterId } } as any),
      providesTags: ["Capacity", "Sprint", "Participant", "RunVacation"],
    }),

    // ---- Backlog ----
    getTasks: b.query<BacklogItem[], { quarterId?: string } | void>({
      query: (arg) =>
        arg?.quarterId
          ? ({
              url: "/tasks",
              method: "GET",
              params: { quarterId: arg.quarterId },
            } as any)
          : { url: "/tasks", method: "GET" },
      providesTags: ["Task", "Sprint"],
    }),
    addTask: b.mutation<BacklogItem, Partial<BacklogItem>>({
      query: (body) => ({ url: "/tasks", method: "POST", body }),
      invalidatesTags: ["Task"],
    }),
    updateTask: b.mutation<BacklogItem, Partial<BacklogItem> & { id: string }>(
      {
        query: (body) => ({ url: "/tasks/update", method: "POST", body }),
        invalidatesTags: ["Task"],
      }
    ),
    deleteTask: b.mutation<BacklogItem, { id: string }>({
      query: (body) => ({ url: "/tasks/delete", method: "POST", body }),
      invalidatesTags: ["Task"],
    }),

    // Новый (детализация по участникам)
    upsertTaskAllocation: b.mutation<
      BacklogItem,
      { taskId: string; participantId: string; sprintId: string; days: number }
    >({
      query: (body) => ({ url: "/taskalloc", method: "POST", body }),
      invalidatesTags: ["Task"],
    }),

    // Легаси-алиас для совместимости с undoSlice и старым кодом
    upsertTaskLoad: b.mutation<
      BacklogItem,
      { taskId: string; sprintId: string; days: number }
    >({
      query: (body) => ({ url: "/taskload", method: "POST", body }),
      invalidatesTags: ["Task"],
    }),

    // ---- Releases ----
    getReleases: b.query<Release[], void>({
      query: () => ({ url: "/releases", method: "GET" }),
      providesTags: ["Release"],
    }),
    addRelease: b.mutation<Release, Partial<Release> & { promDate: string }>({
      query: (body) => ({ url: "/releases", method: "POST", body }),
      invalidatesTags: ["Release"],
    }),
    updateRelease: b.mutation<
      Release,
      (Partial<Release> & { id: string }) & { action?: "recalc" | "clear" }
    >({
      query: (body) => ({ url: "/releases/update", method: "POST", body }),
      invalidatesTags: ["Release"],
    }),
    deleteRelease: b.mutation<Release, { id: string }>({
      query: (body) => ({ url: "/releases/delete", method: "POST", body }),
      invalidatesTags: ["Release"],
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
  useUpsertTaskLoadMutation,

  useGetReleasesQuery,
  useAddReleaseMutation,
  useUpdateReleaseMutation,
  useDeleteReleaseMutation,
} = api;
