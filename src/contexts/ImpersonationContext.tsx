import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "../lib/supabase";

interface ImpersonationState {
  isActive: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
  startedAt: string | null;
  sessionId: string | null;
}

interface ImpersonationContextValue {
  state: ImpersonationState;
  startImpersonation: (workspaceId: string, workspaceName: string) => Promise<void>;
  endImpersonation: () => Promise<void>;
  isReadOnly: boolean;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  state: {
    isActive: false,
    workspaceId: null,
    workspaceName: null,
    startedAt: null,
    sessionId: null,
  },
  startImpersonation: async () => {},
  endImpersonation: async () => {},
  isReadOnly: true,
});

export function useImpersonation() {
  return useContext(ImpersonationContext);
}

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ImpersonationState>({
    isActive: false,
    workspaceId: null,
    workspaceName: null,
    startedAt: null,
    sessionId: null,
  });

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('founder_impersonation');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState(parsed);
      } catch (e) {
        console.error('Failed to parse impersonation state:', e);
        localStorage.removeItem('founder_impersonation');
      }
    }
  }, []);

  const startImpersonation = async (workspaceId: string, workspaceName: string) => {
    try {
      // Log impersonation start to database
      const { data: sessionId, error: logError } = await supabase
        .rpc('log_impersonation_start', {
          p_workspace_id: workspaceId,
          p_workspace_name: workspaceName
        });

      if (logError) {
        console.error('Failed to log impersonation start:', logError);
        // Continue anyway for UX, but log the error
      }

      const newState: ImpersonationState = {
        isActive: true,
        workspaceId,
        workspaceName,
        startedAt: new Date().toISOString(),
        sessionId: sessionId || null,
      };
      setState(newState);
      localStorage.setItem('founder_impersonation', JSON.stringify(newState));
    } catch (error) {
      console.error('Exception starting impersonation:', error);
      throw error;
    }
  };

  const endImpersonation = async () => {
    try {
      // Log impersonation end if we have a session ID
      if (state.sessionId) {
        const { error: logError } = await supabase
          .rpc('log_impersonation_end', {
            p_session_id: state.sessionId
          });

        if (logError) {
          console.error('Failed to log impersonation end:', logError);
        }
      }

      const newState: ImpersonationState = {
        isActive: false,
        workspaceId: null,
        workspaceName: null,
        startedAt: null,
        sessionId: null,
      };
      setState(newState);
      localStorage.removeItem('founder_impersonation');
    } catch (error) {
      console.error('Exception ending impersonation:', error);
      throw error;
    }
  };

  return (
    <ImpersonationContext.Provider
      value={{
        state,
        startImpersonation,
        endImpersonation,
        isReadOnly: state.isActive, // Always read-only during impersonation
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}
