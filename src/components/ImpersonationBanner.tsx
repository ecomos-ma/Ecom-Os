import { useImpersonation } from "../contexts/ImpersonationContext";
import { LogOut, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function ImpersonationBanner() {
  const { state, endImpersonation } = useImpersonation();
  const navigate = useNavigate();

  if (!state.isActive) {
    return null;
  }

  const handleExit = async () => {
    await endImpersonation();
    navigate('/internal-founder-access');
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-amber-100 p-2 rounded-full">
            <Shield size={16} className="text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-900">
              Mode impersonation actif
            </p>
            <p className="text-xs text-amber-700">
              Vous consultez le workspace <strong>{state.workspaceName}</strong> en tant que founder — 
              <span className="font-semibold"> Lecture seule</span>
            </p>
          </div>
        </div>
        <button
          onClick={handleExit}
          className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-md text-sm font-medium transition-colors"
        >
          <LogOut size={14} />
          Quitter
        </button>
      </div>
    </div>
  );
}
