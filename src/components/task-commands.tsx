/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { TaskDialog, type CreatePrefill } from "@/components/task-dialog";
import { CommandPalette } from "@/components/command-palette";
import { useTasks } from "@/hooks/use-tasks";

interface CommandsContextType {
  openCreate: (prefill?: CreatePrefill) => void;
  openEdit: (id: string) => void;
  openPalette: () => void;
}

const CommandsContext = createContext<CommandsContextType | undefined>(undefined);

export function TaskCommandsProvider({ children }: { children: React.ReactNode }) {
  const { tasks } = useTasks();
  const [createOpen, setCreateOpen] = useState(false);
  const [prefill, setPrefill] = useState<CreatePrefill | undefined>(undefined);
  const [editId, setEditId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openCreate = useCallback((p?: CreatePrefill) => {
    setPrefill(p);
    setCreateOpen(true);
  }, []);
  const openEdit = useCallback((id: string) => setEditId(id), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);

  const editing = editId ? tasks.find((t) => t.id === editId) : null;

  // Memo value so useTaskCommands() consumers (Dashboard, Tasks, Calendar,
  // TopBar) don't re-render when paletteOpen/createOpen/editId flip.
  const value = useMemo(
    () => ({ openCreate, openEdit, openPalette }),
    [openCreate, openEdit, openPalette]
  );

  return (
    <CommandsContext.Provider value={value}>
      {children}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onCreate={() => openCreate()}
        onPickTask={openEdit}
      />
      <TaskDialog
        kind="create"
        open={createOpen}
        onOpenChange={(b) => {
          setCreateOpen(b);
          if (!b) setPrefill(undefined);
        }}
        prefill={prefill}
      />
      {editing && (
        <TaskDialog
          kind="edit"
          task={editing}
          open
          onOpenChange={(b) => !b && setEditId(null)}
        />
      )}
    </CommandsContext.Provider>
  );
}

export function useTaskCommands() {
  const ctx = useContext(CommandsContext);
  if (!ctx) throw new Error("useTaskCommands must be used within TaskCommandsProvider");
  return ctx;
}
