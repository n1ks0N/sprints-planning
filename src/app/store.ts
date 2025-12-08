import { configureStore } from "@reduxjs/toolkit";
import { api } from "./api";
import uiReducer, { persistUIState } from "./uiSlice";
import undoReducer from "./undoSlice";
import teamReducer from "./teamSlice";

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    ui: uiReducer,
    undo: undoReducer,
    team: teamReducer,
  },
  middleware: (gDM) => gDM().concat(api.middleware),
});

// Сохранение UI-фильтров в localStorage
let lastPersistedUI = store.getState().ui;

store.subscribe(() => {
  const nextUI = store.getState().ui;
  if (nextUI === lastPersistedUI) return;
  lastPersistedUI = nextUI;
  persistUIState(nextUI);
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
