import { useState } from "react";
import { AlertTriangle, X, CheckCircle, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

interface WorkspaceResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  workspaceName?: string;
}

export function WorkspaceResetModal({ isOpen, onClose, onConfirm, workspaceName }: WorkspaceResetModalProps) {
  const [confirmationText, setConfirmationText] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (isConfirmed) {
      onConfirm();
    }
  };

  const handleCancel = () => {
    setConfirmationText("");
    setIsConfirmed(false);
    setShowDetails(false);
    onClose();
  };

  const dataCategories = [
    {
      icon: "📦",
      title: "Orders & Customers",
      items: ["Orders", "Customers", "Order Items"]
    },
    {
      icon: "🚚",
      title: "Shipping",
      items: ["Shipments", "Tracking Numbers", "Shipping Logs", "Shipping Providers", "Credentials"]
    },
    {
      icon: "📊",
      title: "Analytics",
      items: ["Reports", "Expenses", "Finance Records", "Campaigns", "Ad Spend", "Performance Data"]
    },
    {
      icon: "🔗",
      title: "Integrations",
      items: ["Google Sheets", "YouCan Tokens", "Meta Settings", "All API Connections"]
    },
    {
      icon: "⚙️",
      title: "Workspace",
      items: ["Settings", "Notifications", "Logs", "Team Invitations", "Assignments", "COD Scenarios"]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-[650px] max-h-[85vh] bg-base-surface rounded-2xl shadow-2xl border border-base-border overflow-hidden flex flex-col">
        {/* Header - Fixed */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-base-border bg-base-raised">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10">
              <AlertTriangle className="h-5 w-5 text-danger" />
            </div>
            <h2 className="text-lg font-semibold text-ink">⚠️ Reset Workspace</h2>
          </div>
          <button
            onClick={handleCancel}
            className="rounded-lg p-2 text-ink-muted hover:bg-base-border transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-5">
            <p className="text-sm text-ink font-medium mb-2">
              This action is <span className="text-danger font-bold">permanent</span> and <span className="text-danger font-bold">cannot be undone</span>.
            </p>
            <p className="text-sm text-ink-muted">
              Resetting the workspace will permanently delete ALL data belonging to this workspace and return it to a brand-new state.
            </p>
          </div>

          {/* Summary Cards */}
          <div className="mb-5">
            <p className="text-sm text-ink font-medium mb-3">Data that will be deleted:</p>
            <div className="grid grid-cols-2 gap-3">
              {dataCategories.map((category, index) => (
                <div
                  key={index}
                  className="bg-base-raised rounded-lg p-3 border border-base-border"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{category.icon}</span>
                    <span className="text-sm font-medium text-ink">{category.title}</span>
                  </div>
                  <div className="space-y-1">
                    {category.items.slice(0, 2).map((item, itemIndex) => (
                      <div key={itemIndex} className="text-xs text-ink-muted">{item}</div>
                    ))}
                    {category.items.length > 2 && (
                      <div className="text-xs text-ink-muted">+{category.items.length - 2} more</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Accordion for Details */}
          <div className="mb-5">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-2 text-sm text-brand-accent hover:text-brand-accentHover transition-colors"
            >
              {showDetails ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  View everything that will be deleted
                </>
              )}
            </button>

            {showDetails && (
              <div className="mt-3 bg-base-raised rounded-lg p-4 border border-base-border">
                <div className="space-y-3">
                  {dataCategories.map((category, index) => (
                    <div key={index}>
                      <div className="flex items-center gap-2 mb-2">
                        <span>{category.icon}</span>
                        <span className="text-sm font-medium text-ink">{category.title}</span>
                      </div>
                      <div className="ml-6 space-y-1">
                        {category.items.map((item, itemIndex) => (
                          <div key={itemIndex} className="text-sm text-ink-muted">• {item}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Warning Message */}
          <div className="mb-5">
            <p className="text-sm text-ink font-medium">
              The workspace will become exactly like a newly created workspace.
            </p>
            <p className="text-sm text-danger font-medium mt-1">
              This action cannot be undone.
            </p>
          </div>
        </div>

        {/* Footer - Fixed */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-base-border bg-base-raised">
          {/* Confirmation Input */}
          <div className="mb-4">
            <label className="block text-sm text-ink font-medium mb-2">
              Type <span className="font-mono bg-base-raised px-2 py-1 rounded border border-base-border">RESET</span> to confirm
            </label>
            <input
              type="text"
              value={confirmationText}
              onChange={(e) => {
                setConfirmationText(e.target.value);
                setIsConfirmed(e.target.value === "RESET");
              }}
              placeholder="Type RESET to confirm"
              className="w-full px-4 py-3 rounded-lg border border-base-border bg-base-surface text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-danger focus:border-transparent"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-ink hover:bg-base-border transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isConfirmed}
              className="px-4 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[140px]"
            >
              Reset Workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface WorkspaceResetProgressModalProps {
  isOpen: boolean;
  progress: number;
  currentStep: string;
}

export function WorkspaceResetProgressModal({ isOpen, progress, currentStep }: WorkspaceResetProgressModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="max-w-md w-full mx-4 bg-base-surface rounded-2xl shadow-2xl border border-base-border overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-base-border bg-base-raised">
          <h2 className="text-lg font-semibold text-ink">Resetting Workspace...</h2>
        </div>

        {/* Content */}
        <div className="px-6 py-8">
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-ink">{progress}%</span>
              <span className="text-sm text-ink-muted">{currentStep}</span>
            </div>
            <div className="h-3 bg-base-border rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-accent transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Step Description */}
          <div className="text-center">
            <p className="text-sm text-ink-muted">{currentStep}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface WorkspaceResetSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToOrders: () => void;
}

export function WorkspaceResetSuccessModal({ isOpen, onClose, onNavigateToOrders }: WorkspaceResetSuccessModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="max-w-md w-full mx-4 bg-base-surface rounded-2xl shadow-2xl border border-base-border overflow-hidden">
        {/* Header */}
        <div className="px-6 py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-semibold text-ink mb-2">
            ✅ Workspace Successfully Reset
          </h2>
          <p className="text-sm text-ink-muted mb-6">
            Your workspace has been restored to a clean state.
          </p>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          <div className="bg-base-raised rounded-lg p-4 mb-6">
            <p className="text-sm text-ink font-medium mb-3">You can now:</p>
            <div className="space-y-2 text-sm text-ink-muted">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-brand-accent" />
                <span>Connect a new Google Sheet</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-brand-accent" />
                <span>Connect YouCan</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-brand-accent" />
                <span>Connect Shipping Provider</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-brand-accent" />
                <span>Start importing new orders</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              onClose();
              onNavigateToOrders();
            }}
            className="w-full px-4 py-3 rounded-lg bg-brand-accent text-white text-sm font-medium hover:bg-brand-accentHover transition-colors"
          >
            Go to Orders
          </button>
        </div>
      </div>
    </div>
  );
}
