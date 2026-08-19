import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AutocompleteState {
  history: string[];
  addHistory: (command: string) => void;
  clearHistory: () => void;
}

export const useAutocompleteStore = create<AutocompleteState>()(
  persist(
    (set) => ({
      history: [
        "git status",
        "git diff",
        "npm run dev",
        "cargo check",
        "cargo run",
        "docker ps",
        "ls -la",
        "cd ..",
      ],
      addHistory: (command) => {
        if (!command || !command.trim()) return;
        set((state) => {
          // Remove duplicates to keep history clean, and place newest at the front
          const filtered = state.history.filter((c) => c !== command);
          return {
            history: [command, ...filtered].slice(0, 100), // limit to 100 entries
          };
        });
      },
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: "aster-terminal-autocomplete-history",
    }
  )
);
