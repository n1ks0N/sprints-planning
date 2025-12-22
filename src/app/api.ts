import { createApi, fetchBaseQuery, BaseQueryFn } from "@reduxjs/toolkit/query/react";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type {
  Quarter,
  Sprint,
  Participant,
  CapacityRow,
  BacklogItem,
  Page,
  Release,
  ApiSessionHistory,
  Team,
} from "../types";
import { DEFAULT_TEAM_KEY } from "../teams";
import { selectCurrentTeamKey } from "./teamSlice";

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

const normalizeUserStreams = (values?: string[]) =>
  Array.from(new Set((values || []).map((v) => v?.trim()).filter(Boolean))) as string[];

const SESSION_COOKIE_KEY = "sprints-planning-session-id";
const USER_NAME_KEY = "sprints-planning-user-name";
const SESSION_TTL_MS = 30 * 60 * 1000;

const createSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const readCookie = (key: string): string | null => {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie?.split(";") || [];
  for (const cookie of cookies) {
    const [rawKey, ...rest] = cookie.trim().split("=");
    if (rawKey === key) {
      const value = rest.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
};

const writeCookie = (key: string, value: string, ttlMs: number) => {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + ttlMs).toUTCString();
  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; expires=${expires}`;
};

const getSessionId = (): string | null => readCookie(SESSION_COOKIE_KEY);

const ensureSessionId = (): string | null => {
  if (typeof window === "undefined") return null;
  const existing = getSessionId();
  if (existing) return existing;
  const next = createSessionId();
  writeCookie(SESSION_COOKIE_KEY, next, SESSION_TTL_MS);
  return next;
};

const refreshSessionTtl = () => {
  const sessionId = getSessionId();
  if (sessionId) {
    writeCookie(SESSION_COOKIE_KEY, sessionId, SESSION_TTL_MS);
  }
};

const getStoredUserName = (): string | null => {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(USER_NAME_KEY)?.trim();
  return value?.length ? value : null;
};

const promptForUserName = (): string | null => {
  if (typeof window === "undefined") return null;
  const input = window.prompt("Укажите ваше имя для истории изменений");
  const value = input?.trim();
  if (!value) {
    window.alert("Введите имя, чтобы продолжить работу с сервисом.");
    return null;
  }
  localStorage.setItem(USER_NAME_KEY, value);
  return value;
};

const ensureUserName = (): string | null => getStoredUserName() ?? promptForUserName();

if (typeof window !== "undefined") {
  ensureSessionId();
}

const rawBaseQuery: BaseQueryFn = fetchBaseQuery({
  baseUrl: process.env.API_URL || "/api/v1/sprints-planning",
  prepareHeaders: (headers) => {
    const sessionId = ensureSessionId();
    const userName = getStoredUserName();
    if (sessionId) headers.set("X-Session-Id", sessionId);
    if (userName) headers.set("X-User-Name", encodeURIComponent(userName));
    return headers;
  },
}) as BaseQueryFn;

const getMethod = (args: unknown): string => {
  if (typeof args === "string" || args === undefined || args === null) return "GET";
  const value = (args as any).method;
  if (typeof value === "string") return value.toUpperCase();
  return "GET";
};

const getTeamFromLocation = (): string | null => {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  const match = hash.match(/^#\/(\w[\w-]*)/i);
  return match?.[1]?.toLowerCase() ?? null;
};

const addTeamToUrl = (url: string, teamKey: string) => {
  const normalizedTeam = (teamKey || getTeamFromLocation() || DEFAULT_TEAM_KEY).toLowerCase();
  const normalizedUrl = url.startsWith("/") ? url : `/${url}`;
  if (normalizedUrl.startsWith(`/${normalizedTeam}/`)) return normalizedUrl;
  return `/${normalizedTeam}${normalizedUrl}`;
};

const shouldSkipTeamPrefix = (args: unknown): boolean => {
  if (typeof args !== "object" || args === null) return false;
  return Boolean((args as any).skipTeamPrefix);
};

const removeSkipTeamFlag = (args: any) => {
  if (!args || typeof args !== "object") return args;
  const { skipTeamPrefix, ...rest } = args as any;
  return rest;
};

const withTeamInArgs = (args: unknown, teamKey: string): unknown => {
  if (typeof args === "string") return addTeamToUrl(args, teamKey);
  if (typeof args === "object" && args !== null) {
    const currentUrl = typeof (args as any).url === "string" ? (args as any).url : "/";
    return { ...(args as any), url: addTeamToUrl(currentUrl, teamKey) };
  }
  return { url: addTeamToUrl("/", teamKey) };
};

const isActionMethod = (method: string) =>
  ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());

const baseQuery: BaseQueryFn = async (args, api, extraOptions) => {
  const hasWindow = typeof window !== "undefined";
  const teamKey: string =
    (
      selectCurrentTeamKey(api.getState() as any) ||
      getTeamFromLocation() ||
      DEFAULT_TEAM_KEY
    ).toLowerCase();
  const shouldSkipTeam = shouldSkipTeamPrefix(args);
  const finalArgs = shouldSkipTeam
    ? removeSkipTeamFlag(args)
    : withTeamInArgs(args, teamKey);
  const method = getMethod(finalArgs);

  if (hasWindow) {
    ensureSessionId();
    if (isActionMethod(method)) {
      const userName = ensureUserName();
      if (!userName) {
        return {
          error: {
            status: 400,
            data: "Имя пользователя обязательно для отправки запросов",
          } as FetchBaseQueryError,
        };
      }
    }
  }

  const result = await rawBaseQuery(finalArgs, api, extraOptions);

  if (hasWindow && isActionMethod(method) && !("error" in result)) {
    refreshSessionTtl();
  }

  return result;
};

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

type TasksPage = Page<BacklogItem>;

const recalcPageMeta = (draft: TasksPage) => {
  const size = Math.max(1, (draft.page?.size ?? draft.content.length) || 1);
  const pageInfo = draft.page ??
    (draft.page = {
      size,
      number: 0,
      totalElements: draft.content.length,
      totalPages: Math.max(1, Math.ceil(draft.content.length / size)),
    });

  draft.numberOfElements = draft.content.length;
  pageInfo.totalElements = Math.max(pageInfo.totalElements, draft.content.length);
  const totalPages = Math.max(
    pageInfo.totalPages,
    Math.max(1, Math.ceil(pageInfo.totalElements / size))
  );
  pageInfo.totalPages = totalPages;
  draft.empty = draft.content.length === 0;
  draft.first = pageInfo.number <= 0;
  draft.last = pageInfo.number + 1 >= totalPages;
};

const updateTasksDraft = (
  draft: TasksPage | undefined,
  updater: (tasks: BacklogItem[]) => void
) => {
  if (!draft) return;
  updater(draft.content);
  recalcPageMeta(draft);
};

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
    "Capacity",
    "Task",
    "Release",
    "History",
    "Team",
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
      transformResponse: (response: Participant[]) =>
        response.map((p) => ({
          ...p,
          userStreams: normalizeUserStreams(p.userStreams),
        })),
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
        ...(result ? [entityTag("Participant", result.id)] : []),
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const optimistic: Participant = {
          id: arg.id ?? tempId(),
          fullName: arg.fullName ?? "Новый участник",
          role: arg.role ?? "",
          rate: arg.rate ?? 1,
          userStreams: normalizeUserStreams(arg.userStreams),
        } as Participant;

        const patch = dispatch(
          api.util.updateQueryData("getParticipants", undefined, (draft) => {
            draft.push(optimistic);
          })
        );

        try {
          const { data } = await queryFulfilled;
          const normalized = {
            ...data,
            userStreams: normalizeUserStreams(data.userStreams),
          };
          dispatch(
            api.util.updateQueryData("getParticipants", undefined, (draft) => {
              const idx = draft.findIndex((p) => p.id === optimistic.id);
              if (idx >= 0) draft[idx] = normalized;
              else draft.push(normalized);
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
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("getParticipants", undefined, (draft) => {
            const idx = draft.findIndex((p) => p.id === arg.id);
            if (idx >= 0) {
              const next: Participant = {
                ...draft[idx],
                ...arg,
              } as Participant;
              if (arg.userStreams === undefined) {
                next.userStreams = draft[idx].userStreams;
              } else {
                next.userStreams = normalizeUserStreams(arg.userStreams);
              }
              draft[idx] = next;
            }
          })
        );

        try {
          const { data } = await queryFulfilled;
          const normalized = {
            ...data,
            userStreams: normalizeUserStreams(data.userStreams),
          };
          dispatch(
            api.util.updateQueryData("getParticipants", undefined, (draft) => {
              const idx = draft.findIndex((p) => p.id === data.id);
              if (idx >= 0) draft[idx] = normalized;
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

    // ---- Capacity ----
    getCapacity: b.query<CapacityRow[], { quarterIds?: string[] } | void>({
      query: (arg) => {
        const quarterIds = arg?.quarterIds?.length ? arg.quarterIds.join(",") : undefined;
        return { url: "/capacity", method: "GET", params: { quarterId: quarterIds } };
      },
      providesTags: (result, error, arg) => {
        const ids = arg?.quarterIds?.length ? arg.quarterIds.slice().sort().join(",") : "all";
        return [
          { type: "Capacity" as const, id: "LIST" as const },
          { type: "Capacity" as const, id: ids },
        ];
      },
    }),

    // ---- Backlog ----
    getTasks: b.query<
      TasksPage,
      | void
      | {
          quarterIds?: string[];
          priority?: number[];
          statuses?: string[];
          releaseDate?: string;
          stream?: string;
          search?: string;
          participantIds?: string[];
          roles?: string[];
          userStreams?: string[];
          page?: number;
          size?: number;
        }
    >({
      query: (arg) => {
        const params: Record<string, string> = {};

        const joinOrUndefined = (values?: string[] | number[]) => {
          if (!values || values.length === 0) return undefined;
          return values.join(",");
        };

        const quarters = joinOrUndefined(arg?.quarterIds);
        if (quarters) params.quarterId = quarters;

        const priorities = joinOrUndefined(arg?.priority);
        if (priorities) params.priority = priorities;

        const statuses = joinOrUndefined(arg?.statuses);
        if (statuses) params.status = statuses;

        const releaseDate = (arg?.releaseDate || "").trim();
        if (releaseDate) params.releaseDate = releaseDate;

        const stream = (arg?.stream || "").trim();
        if (stream) params.stream = stream;

        const search = (arg?.search || "").trim();
        if (search) params.search = search;

        const participantIds = joinOrUndefined(arg?.participantIds);
        if (participantIds) params.participantId = participantIds;

        const roles = joinOrUndefined(arg?.roles);
        if (roles) params.role = roles;

        const userStreams = joinOrUndefined(arg?.userStreams);
        if (userStreams) params.userStream = userStreams;

        if (typeof arg?.page === "number") params.page = String(arg.page);
        if (typeof arg?.size === "number") params.size = String(arg.size);

        return {
          url: "/tasks",
          method: "GET",
          params: Object.keys(params).length ? params : undefined,
        };
      },
      serializeQueryArgs: ({ queryArgs, endpointName }) => {
        if (!queryArgs || typeof queryArgs !== "object") return endpointName;
        const { page, size, ...rest } = queryArgs as Record<string, unknown>;
        return `${endpointName}-${JSON.stringify(rest)}`;
      },
      merge: (currentCache, newData, { arg }) => {
        if (!newData) return;
        if (!currentCache) {
          return newData;
        }
        const shouldReset = !arg || typeof arg !== "object" || !("page" in arg) || (arg as any).page === 0;
        if (shouldReset) {
          Object.assign(currentCache, newData);
          recalcPageMeta(currentCache);
          return;
        }

        const existingIndex = new Map(currentCache.content.map((t, idx) => [t.id, idx] as const));
        newData.content.forEach((item) => {
          const idx = existingIndex.get(item.id);
          if (idx === undefined) {
            currentCache.content.push(item);
          } else {
            currentCache.content[idx] = item;
          }
        });

        currentCache.page = newData.page;
        currentCache._links = newData._links;
        currentCache.first = (newData.first ?? currentCache.first) &&
          ((arg as any).page ?? 0) === 0;
        recalcPageMeta(currentCache);
      },
      forceRefetch({ currentArg, previousArg }) {
        if (!currentArg || !previousArg) return true;
        const { page: currentPage, size: currentSize, ...currentFilters } =
          (currentArg as Record<string, unknown>) || {};
        const { page: prevPage, size: prevSize, ...prevFilters } =
          (previousArg as Record<string, unknown>) || {};

        if (currentPage !== prevPage || currentSize !== prevSize) return true;
        return JSON.stringify(currentFilters) !== JSON.stringify(prevFilters);
      },
      providesTags: (result) =>
        result
          ? [
              { type: "Task" as const, id: "LIST" as const },
              ...result.content.map((t) => ({ type: "Task" as const, id: t.id })),
            ]
          : [{ type: "Task" as const, id: "LIST" as const }],
    }),
    getTask: b.query<BacklogItem, string>({
      query: (id) => ({ url: `/tasks/${id}`, method: "GET" }),
      providesTags: (result, error, id) => [
        { type: "Task" as const, id },
        { type: "Task" as const, id: "LIST" as const },
      ],
    }),
    addTask: b.mutation<BacklogItem, Partial<BacklogItem>>({
      query: (body) => ({ url: "/tasks", method: "POST", body }),
      invalidatesTags: (result) => [
        listTag("Task"),
        ...(result ? [entityTag("Task", result.id)] : []),
        listTag("Capacity"),
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const now = new Date().toISOString().slice(0, 10);
        const optimistic: BacklogItem = {
          id: arg.id ?? tempId(),
          title: arg.title ?? "Новая задача",
          description: arg.description ?? "",
          dod: arg.dod ?? "",
          priority: (arg.priority as BacklogItem["priority"]) ?? 2,
          status: (arg.status as BacklogItem["status"]) ?? "inprogress",
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

        const cachedArgs = collectCachedArgs<Record<string, unknown> | void>(
          getState,
          "getTasks",
          [{ type: "Task", id: "LIST" }]
        );

        const patches = applyPatches(
          dispatch,
          "getTasks",
          cachedArgs,
          (draft: TasksPage) => {
            updateTasksDraft(draft, (tasks) => {
              tasks.push(optimistic);
            });
          }
        );

        try {
          const { data } = await queryFulfilled;
          applyPatches(dispatch, "getTasks", cachedArgs, (draft: TasksPage) => {
            updateTasksDraft(draft, (tasks) => {
              const idx = tasks.findIndex((t: BacklogItem) => t.id === optimistic.id);
              if (idx >= 0) tasks[idx] = data;
              else tasks.push(data);
            });
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
          { type: "Capacity" as const, id: "LIST" as const },
        ],
        async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
          const cachedArgs = collectCachedArgs<Record<string, unknown> | void>(
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
            (draft: TasksPage) => {
              updateTasksDraft(draft, (tasks) => {
                const idx = tasks.findIndex((t: BacklogItem) => t.id === arg.id);
                if (idx >= 0)
                  tasks[idx] = { ...tasks[idx], ...arg } as BacklogItem;
              });
            }
          );

          try {
            const { data } = await queryFulfilled;
            applyPatches(dispatch, "getTasks", cachedArgs, (draft: TasksPage) => {
              updateTasksDraft(draft, (tasks) => {
                const idx = tasks.findIndex((t: BacklogItem) => t.id === data.id);
                if (idx >= 0) tasks[idx] = data;
              });
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
        { type: "Capacity" as const, id: "LIST" as const },
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const cachedArgs = collectCachedArgs<Record<string, unknown> | void>(
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
          (draft: TasksPage) => {
            updateTasksDraft(draft, (tasks) => {
              const idx = tasks.findIndex((t: BacklogItem) => t.id === arg.id);
              if (idx >= 0) tasks.splice(idx, 1);
            });
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
        { type: "Capacity" as const, id: "LIST" as const },
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const cachedArgs = collectCachedArgs<Record<string, unknown> | void>(
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
          (draft: TasksPage) => {
            updateTasksDraft(draft, (tasks) => {
              const task = tasks.find((t: BacklogItem) => t.id === arg.taskId);
              if (task)
                applyAllocation(
                  task,
                  arg.participantId,
                  arg.sprintId,
                  arg.days
                );
            });
          }
        );

        try {
          const { data } = await queryFulfilled;
          applyPatches(dispatch, "getTasks", cachedArgs, (draft: TasksPage) => {
            updateTasksDraft(draft, (tasks) => {
              const idx = tasks.findIndex((t: BacklogItem) => t.id === data.id);
              if (idx >= 0) tasks[idx] = data;
            });
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
        { type: "Capacity" as const, id: "LIST" as const },
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const cachedArgs = collectCachedArgs<Record<string, unknown> | void>(
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
          (draft: TasksPage) => {
            updateTasksDraft(draft, (tasks) => {
              const task = tasks.find((t: BacklogItem) => t.id === arg.taskId);
              if (task) applyBulkAllocation(task, arg.participantId, arg.allocations);
            });
          }
        );

        try {
          const { data } = await queryFulfilled;
          applyPatches(dispatch, "getTasks", cachedArgs, (draft: TasksPage) => {
            updateTasksDraft(draft, (tasks) => {
              const idx = tasks.findIndex((t: BacklogItem) => t.id === data.id);
              if (idx >= 0) tasks[idx] = data;
            });
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
        { type: "Capacity" as const, id: "LIST" as const },
      ],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const cachedArgs = collectCachedArgs<Record<string, unknown> | void>(
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
          (draft: TasksPage) => {
            updateTasksDraft(draft, (tasks) => {
              const task = tasks.find((t: BacklogItem) => t.id === arg.taskId);
              if (task) applySprintLoad(task, arg.sprintId, arg.days);
            });
          }
        );

        try {
          const { data } = await queryFulfilled;
          applyPatches(dispatch, "getTasks", cachedArgs, (draft: TasksPage) => {
            updateTasksDraft(draft, (tasks) => {
              const idx = tasks.findIndex((t: BacklogItem) => t.id === data.id);
              if (idx >= 0) tasks[idx] = data;
            });
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

    // ---- History ----
    getHistory: b.query<ApiSessionHistory[], void>({
      query: () => ({ url: "/history", method: "GET" }),
      providesTags: [listTag("History")],
      keepUnusedDataFor: 0,
    }),

    // ---- Export ----
    exportExcel: b.query<Blob, void>({
      async queryFn(_arg, { getState }) {
        const baseUrl = process.env.API_URL || "/api/v1/sprints-planning";
        const teamKey = selectCurrentTeamKey(getState() as any);
        try {
          const response = await fetch(`${baseUrl}/${teamKey}/export/excel`);
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

    // ---- Teams ----
    getTeams: b.query<Team[], void>({
      query: () => ({ url: "/teams", method: "GET", skipTeamPrefix: true }),
      providesTags: [listTag("Team")],
    }),

    addTeam: b.mutation<Team, { key: string; name: string }>({
      query: (body) => ({
        url: "/teams",
        method: "POST",
        body,
        skipTeamPrefix: true,
      }),
      invalidatesTags: [listTag("Team")],
    }),

    updateTeam: b.mutation<Team, { key: string; name: string }>({
      query: ({ key, name }) => ({
        url: `/teams/${key}`,
        method: "PUT",
        body: { name },
        skipTeamPrefix: true,
      }),
      invalidatesTags: (r, e, arg) => [
        { type: "Team", id: arg.key },
        listTag("Team"),
      ],
    }),

    deleteTeam: b.mutation<void, { key: string; deleteData: boolean }>({
      query: ({ key, deleteData }) => ({
        url: `/teams/${key}`,
        method: "DELETE",
        params: { deleteData },
        skipTeamPrefix: true,
      }),
      invalidatesTags: (r, e, arg) => [
        { type: "Team", id: arg.key },
        listTag("Team"),
      ],
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

  useGetCapacityQuery,

  useGetTaskQuery,
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

  useGetTeamsQuery,
  useAddTeamMutation,
  useUpdateTeamMutation,
  useDeleteTeamMutation,

  useGetHistoryQuery,

  useLazyExportExcelQuery,
} = api;
