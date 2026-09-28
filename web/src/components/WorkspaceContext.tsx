"use client";

import { createContext, useContext, useMemo } from "react";
import { activeWorkspaceId } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { ReaderSettings } from "@/lib/reader";
import type { User, Workspace } from "@/lib/types";

export interface Member {
  userId: string;
  name: string;
  email?: string;
  role: "owner" | "editor" | "viewer";
}

interface WorkspaceCtx {
  user: User | null;
  workspace: Workspace | null;
  members: Member[];
  isFamily: boolean;
  canWrite: boolean;
  loading: boolean;
  /** Document reading (AI) settings for this space; null until loaded. */
  reader: ReaderSettings | null;
  nameOf: (userId?: string | null) => string | undefined;
  reload: () => void;
}

const Ctx = createContext<WorkspaceCtx>({
  user: null,
  workspace: null,
  members: [],
  isFamily: false,
  canWrite: true,
  loading: true,
  reader: null,
  nameOf: () => undefined,
  reload: () => {},
});

/** Current user, active workspace and its members, loaded once for the whole app shell. */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const me = useApi<{ user: User }>("/auth/me");
  const mem = useApi<{ members: Member[] }>("/workspaces/current/members");
  const reader = useApi<ReaderSettings>("/workspaces/current/reader");

  const value = useMemo<WorkspaceCtx>(() => {
    const user = me.data?.user ?? null;
    const wanted = typeof window !== "undefined" ? activeWorkspaceId() : null;
    const workspace = user?.workspaces.find((w) => w.id === wanted) ?? user?.workspaces.find((w) => w.id === user.defaultWorkspaceId) ?? null;
    const members = mem.data?.members ?? [];
    return {
      user,
      workspace,
      members,
      isFamily: workspace?.kind === "family",
      canWrite: workspace?.role !== "viewer",
      loading: !me.data,
      reader: reader.data,
      nameOf: (id) => members.find((m) => m.userId === id)?.name,
      reload: () => {
        void me.reload();
        void mem.reload();
        void reader.reload();
      },
    };
  }, [me, mem, reader]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWorkspace = () => useContext(Ctx);
