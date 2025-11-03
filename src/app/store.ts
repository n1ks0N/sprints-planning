import { configureStore } from "@reduxjs/toolkit";
import { api } from "./api";
import uiReducer, { persistUIState } from "./uiSlice";
import undoReducer from "./undoSlice";

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    ui: uiReducer,
    undo: undoReducer,
  },
  middleware: (gDM) => gDM().concat(api.middleware),
});

// Сохранение UI-фильтров в localStorage
store.subscribe(() => {
  const state = store.getState();
  persistUIState(state.ui);
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
