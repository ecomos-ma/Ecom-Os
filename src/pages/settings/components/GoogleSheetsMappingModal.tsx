import { useState, useEffect } from "react";
import { CheckCircle2, Loader2, AlertCircle, X, ChevronRight, ArrowRight, Eye, EyeOff } from "lucide-react";
import { generateSmartMappings, suggestDestinationField, getMappingConfidence, getDestinationFieldInfo, FieldMapping, MappingConfidence, AVAILABLE_DESTINATION_FIELDS, getDestinationFieldsByCategory, getMappingCategories } from "../../../lib/googleSheetsMappingEngine";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../components/Toast";

interface GoogleSheetsMappingModalProps {
  workspaceId: string;
  webAppUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onMappingSaved: () => void;
}

export default function GoogleSheetsMappingModal({ workspaceId, webAppUrl, isOpen, onClose, onMappingSaved }: GoogleSheetsMappingModalProps) {
  const { workspace } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sampleData, setSampleData] = useState<Record<string, any>[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [unknownStatusValues, setUnknownStatusValues] = useState<Record<string, Record<string, string>>>({});
  const [statusMappingMode, setStatusMappingMode] = useState<'confirmation' | 'delivery' | null>(null);

  // Load existing mappings when modal opens
  useEffect(() => {
    if (isOpen && workspaceId) {
      loadExistingMappings();
    }
  }, [isOpen, workspaceId]);

  const loadExistingMappings = async () => {
    try {
      const { data, error } = await supabase
        .from('google_sheets_credentials')
        .select('field_mappings, custom_status_mappings')
        .eq('workspace_id', workspaceId)
        .single();

      if (error) {
        console.error('Error loading mappings:', error);
        return;
      }

      if (data?.field_mappings && Array.isArray(data.field_mappings) && data.field_mappings.length > 0) {
        setMappings(data.field_mappings);
      }

      if (data?.custom_status_mappings && typeof data.custom_status_mappings === 'object') {
        setUnknownStatusValues(data.custom_status_mappings as Record<string, Record<string, string>>);
      }
    } catch (error) {
      console.error('Failed to load mappings:', error);
    }
  };

  const fetchSheetData = async () => {
    if (!webAppUrl) {
      toast.error('Web App URL not configured');
      return;
    }

    setFetchingData(true);
    try {
      const response = await fetch(webAppUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const text = await response.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No data found in Google Sheet');
      }

      // Extract headers
      const headers = Object.keys(data[0]);
      setSheetHeaders(headers);

      // Store sample data (first 3 rows)
      setSampleData(data.slice(0, 3));

      // Generate smart mappings if no existing mappings
      const { data: existingCreds } = await supabase
        .from('google_sheets_credentials')
        .select('field_mappings')
        .eq('workspace_id', workspaceId)
        .single();

      if (!existingCreds?.field_mappings || existingCreds.field_mappings.length === 0) {
        const smartMappings = generateSmartMappings(headers);
        setMappings(smartMappings);
        toast.success('Smart mappings generated');
      } else {
        setMappings(existingCreds.field_mappings);
      }

    } catch (error: any) {
      console.error('Error fetching sheet data:', error);
      toast.error(`Failed to fetch sheet data: ${error.message}`);
    } finally {
      setFetchingData(false);
    }
  };

  const handleMappingChange = (sheetHeader: string, destinationField: string | null) => {
    setMappings(prev => 
      prev.map(m => 
        m.sheetHeader === sheetHeader 
          ? { ...m, destinationField, confidence: getMappingConfidence(sheetHeader, destinationField) }
          : m
      )
    );
  };

  const handleSaveMappings = async () => {
    setSaving(true);
    try {
      // Validate no duplicate destinations (except for "do not import")
      const usedDestinations = new Set<string>();
      const conflicts: string[] = [];

      mappings.forEach(m => {
        if (m.destinationField && m.destinationField !== 'do_not_import') {
          if (usedDestinations.has(m.destinationField)) {
            conflicts.push(m.sheetHeader);
          }
          usedDestinations.add(m.destinationField);
        }
      });

      if (conflicts.length > 0) {
        toast.error(`Conflict: Multiple columns mapped to same destination: ${conflicts.join(', ')}`);
        return;
      }

      const { error } = await supabase
        .from('google_sheets_credentials')
        .update({
          field_mappings: mappings,
          custom_status_mappings: unknownStatusValues,
          mapping_version: 1
        })
        .eq('workspace_id', workspaceId);

      if (error) throw error;

      toast.success('Mapping saved successfully');
      onMappingSaved();
      onClose();
    } catch (error: any) {
      console.error('Error saving mappings:', error);
      toast.error(`Failed to save mappings: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusValueMapping = (sheetValue: string, canonicalStatus: string) => {
    const category = statusMappingMode || 'confirmation';
    setUnknownStatusValues(prev => ({
      ...prev,
      [category]: {
        ...(prev[category] || {}),
        [sheetValue]: canonicalStatus
      }
    }));
  };

  const getCategories = () => {
    const categories = getMappingCategories();
    return ['all', ...categories];
  };

  const filterByCategory = (category: string) => {
    if (category === 'all') return AVAILABLE_DESTINATION_FIELDS;
    return getDestinationFieldsByCategory(category);
  };

  const previewData = () => {
    if (sampleData.length === 0) return [];

    return sampleData.slice(0, 2).map(row => {
      const preview: Record<string, string> = {};
      
      mappings.forEach(mapping => {
        if (mapping.destinationField && mapping.destinationField !== 'do_not_import') {
          const sheetValue = row[mapping.sheetHeader];
          let displayValue = sheetValue;
          
          // Handle status normalization for preview
          if (mapping.destinationField === 'status' && sheetValue) {
            const { normalizeStatus } = require('../../../lib/statusEngine');
            const canonical = normalizeStatus(sheetValue);
            displayValue = `${sheetValue} → ${canonical}`;
          }
          
          if (mapping.destinationField === 'shipping_status' && sheetValue) {
            const { normalizeStatus } = require('../../../lib/statusEngine');
            const canonical = normalizeStatus(sheetValue);
            displayValue = `${sheetValue} → ${canonical}`;
          }
          
          preview[mapping.sheetHeader] = displayValue;
        }
      });
      
      return preview;
    });
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <div className="relative z-10 w-full max-w-4xl rounded-[28px] border border-base-border bg-base-surface shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-7 py-6 border-b border-base-border/60 bg-base-raised/30">
              <div>
                <h2 className="text-[18px] font-bold text-ink">Google Sheets Field Mapping</h2>
                <p className="text-[13px] text-ink-muted">Map your Google Sheet columns to Ecom OS order fields</p>
              </div>
              <button onClick={onClose} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink hover:bg-base-border transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Toolbar */}
              <div className="px-7 py-4 border-b border-base-border/60 flex items-center gap-3">
                {!sheetHeaders.length ? (
                  <button
                    onClick={fetchSheetData}
                    disabled={fetchingData || !webAppUrl}
                    className="h-[38px] flex items-center justify-center gap-2 rounded-xl bg-brand px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors disabled:opacity-60"
                  >
                    {fetchingData ? <><Loader2 size={14} className="animate-spin" /> Loading Sheet Data...</> : <><ArrowRight size={14} /> Load Sheet Data</>}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setShowPreview(!showPreview)}
                      className="h-[38px] flex items-center justify-center gap-2 rounded-xl border border-base-border bg-base-raised px-3 text-[13px] font-semibold text-ink hover:bg-base-border transition-colors"
                    >
                      {showPreview ? <EyeOff size={14} /> : <Eye size={14} />} {showPreview ? 'Hide Preview' : 'Show Preview'}
                    </button>
                    <button
                      onClick={() => {
                        const smartMappings = generateSmartMappings(sheetHeaders);
                        setMappings(smartMappings);
                        toast.success('Smart mappings applied');
                      }}
                      className="h-[38px] flex items-center justify-center gap-2 rounded-xl border border-brand/20 bg-brand/5 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
                    >
                      <CheckCircle2 size={14} /> Auto-Map
                    </button>
                  </>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-7 py-4">
                {!sheetHeaders.length ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertCircle size={48} className="text-ink-faint mb-4" />
                    <h3 className="text-[16px] font-semibold text-ink mb-2">No Sheet Data Loaded</h3>
                    <p className="text-[13px] text-ink-muted mb-6">
                      Click "Load Sheet Data" to fetch column headers and generate smart mappings
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Mapping Table */}
                    <div className="rounded-xl border border-base-border overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-base-raised/50">
                            <th className="px-4 py-3 text-left text-[12px] font-semibold text-ink border-b border-base-border/60">Sheet Column</th>
                            <th className="px-4 py-3 text-left text-[12px] font-semibold text-ink border-b border-base-border/60">Destination</th>
                            <th className="px-4 py-3 text-left text-[12px] font-semibold text-ink border-b border-base-border/60">Confidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mappings.map((mapping, index) => (
                            <tr key={index} className="border-b border-base-border/60 hover:bg-base-raised/30">
                              <td className="px-4 py-3">
                                <span className="text-[13px] font-medium text-ink">{mapping.sheetHeader}</span>
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={mapping.destinationField || ''}
                                  onChange={(e) => handleMappingChange(mapping.sheetHeader, e.target.value || null)}
                                  className="w-full max-w-[200px] rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/20"
                                >
                                  <option value="">Do not import</option>
                                  {AVAILABLE_DESTINATION_FIELDS.map(field => (
                                    <option key={field.field} value={field.field}>
                                      {field.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                  mapping.confidence === 'matched' 
                                    ? 'bg-green-100 text-green-800' 
                                    : mapping.confidence === 'needs_review'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {mapping.confidence === 'matched' && <CheckCircle2 size={12} />}
                                  {mapping.confidence}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Preview Section */}
                    {showPreview && (
                      <div className="rounded-xl border border-base-border overflow-hidden">
                        <div className="px-4 py-3 bg-base-raised/50 border-b border-base-border/60">
                          <h4 className="text-[13px] font-semibold text-ink">Mapping Preview</h4>
                        </div>
                        <div className="p-4">
                          {previewData().map((row, i) => (
                            <div key={i} className="mb-4 last:mb-0">
                              <div className="text-[11px] text-ink-muted mb-2">Row {i + 1}</div>
                              <div className="space-y-1">
                                {Object.entries(row).map(([key, value]) => (
                                  <div key={key} className="flex items-start gap-3 text-[12px]">
                                    <span className="font-medium text-ink-faint min-w-[120px]">{key}:</span>
                                    <span className="text-ink">{value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-7 py-5 border-t border-base-border/60 bg-base-raised/20 flex items-center justify-between">
              <button 
                onClick={onClose} 
                className="rounded-xl bg-base-raised py-2.5 px-4 text-[13px] font-semibold text-ink hover:bg-base-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMappings}
                disabled={saving || !sheetHeaders.length}
                className="rounded-xl bg-brand py-2.5 px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors disabled:opacity-60"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Save Mapping'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
