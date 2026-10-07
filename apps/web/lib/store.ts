import { create } from "zustand";

export interface CellChange {
  rowId: string | number;
  column: string;
  oldValue: unknown;
  newValue: unknown;
}

interface WorkspaceState {
  // Navigation & layout
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  isInspectorOpen: boolean;
  toggleInspector: () => void;
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  activeEnv: "dev" | "staging" | "prod";
  setActiveEnv: (env: "dev" | "staging" | "prod") => void;

  // Status bar
  runningJob: { name: string; progress: string } | null;
  setRunningJob: (job: { name: string; progress: string } | null) => void;
  totalRows: number;
  totalColumns: number;
  sampleStatus: string;
  setStatusMetrics: (rows: number, cols: number, sample?: string) => void;

  // Data editing & Undo/Redo
  pendingChanges: CellChange[];
  undoStack: CellChange[];
  redoStack: CellChange[];
  recordChange: (change: CellChange) => void;
  undo: () => void;
  redo: () => void;
  clearChanges: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  isSidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  isInspectorOpen: true,
  toggleInspector: () => set((state) => ({ isInspectorOpen: !state.isInspectorOpen })),
  isCommandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  activeEnv: "dev",
  setActiveEnv: (env) => set({ activeEnv: env }),

  runningJob: { name: "orders_daily", progress: "Menyaring baris 8.200/12.480" },
  setRunningJob: (job) => set({ runningJob: job }),
  totalRows: 12,
  totalColumns: 9,
  sampleStatus: "seluruh data lokal (12 baris)",
  setStatusMetrics: (rows, cols, sample = "seluruh data lokal") =>
    set({ totalRows: rows, totalColumns: cols, sampleStatus: sample }),

  pendingChanges: [],
  undoStack: [],
  redoStack: [],
  recordChange: (change) =>
    set((state) => ({
      pendingChanges: [...state.pendingChanges, change],
      undoStack: [...state.undoStack, change],
      redoStack: [],
    })),
  undo: () =>
    set((state) => {
      if (state.undoStack.length === 0) return state;
      const last = state.undoStack[state.undoStack.length - 1];
      return {
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, last],
        pendingChanges: state.pendingChanges.filter(
          (c) => !(c.rowId === last.rowId && c.column === last.column)
        ),
      };
    }),
  redo: () =>
    set((state) => {
      if (state.redoStack.length === 0) return state;
      const next = state.redoStack[state.redoStack.length - 1];
      return {
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, next],
        pendingChanges: [...state.pendingChanges, next],
      };
    }),
  clearChanges: () => set({ pendingChanges: [], undoStack: [], redoStack: [] }),
}));
