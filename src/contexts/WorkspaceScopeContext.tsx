import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { Profile, Workspace } from "../lib/types";

interface WorkspaceScopeContextValue {
  currentWorkspaceId: string | null;
  currentWorkspace: Workspace | null;
  currentProfile: Profile | null;
  isPreviewActive: boolean;
  setWorkspaceContext: (params: {
    workspaceId: string | null;
    workspace?: Workspace | null;
    profile?: Profile | null;
    preview?: boolean;
  }) => void;
  clearWorkspaceContext: () => void;
}

const WorkspaceScopeContext = createContext<WorkspaceScopeContextValue | null>(null);

export function WorkspaceScopeProvider({ children }: { children: ReactNode }) {
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [isPreviewActive, setIsPreviewActive] = useState(false);

  const setWorkspaceContext = useCallback(
    ({ workspaceId, workspace = null, profile = null, preview = false }: { workspaceId: string | null; workspace?: Workspace | null; profile?: Profile | null; preview?: boolean }) => {
      setCurrentWorkspaceId(workspaceId);
      setCurrentWorkspace(workspace);
      setCurrentProfile(profile);
      setIsPreviewActive(preview);
    },
    []
  );

  const clearWorkspaceContext = useCallback(() => {
    setCurrentWorkspaceId(null);
    setCurrentWorkspace(null);
    setCurrentProfile(null);
    setIsPreviewActive(false);
  }, []);

  const contextValue = useMemo(
    () => ({
      currentWorkspaceId,
      currentWorkspace,
      currentProfile,
      isPreviewActive,
      setWorkspaceContext,
      clearWorkspaceContext,
    }),
    [
      currentWorkspaceId,
      currentWorkspace,
      currentProfile,
      isPreviewActive,
      setWorkspaceContext,
      clearWorkspaceContext,
    ]
  );

  return (
    <WorkspaceScopeContext.Provider value={contextValue}>
      {children}
    </WorkspaceScopeContext.Provider>
  );
}

export function useWorkspaceScope() {
  const context = useContext(WorkspaceScopeContext);
  if (!context) {
    throw new Error("useWorkspaceScope must be used within a WorkspaceScopeProvider");
  }
  return context;
}
