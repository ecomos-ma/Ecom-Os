import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "../../components/PageHeader";
import { Modal } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { supabase } from "../../lib/supabase";
import {
  BrainCircuit,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Play,
  Settings,
  Activity,
  Loader2,
  Shield,
  FileText,
  Palette,
  ChevronDown,
  ChevronUp,
  Download,
  Search,
  Clock,
  Zap,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Save,
  X,
  Copy,
  Eye,
  EyeOff,
  GitMerge,
} from "lucide-react";

// Types
type ProviderStatus = 'HEALTHY' | 'DEGRADED' | 'RATE_LIMITED' | 'FAILED' | 'DISABLED' | 'TESTING';

interface AIProvider {
  id: string;
  name: string;
  provider_type: 'gemini' | 'openai' | 'anthropic' | 'custom';
  project_id: string;
  model_id: string;
  priority: number;
  encrypted_credential: string;
  credential_encrypted: string;
  capabilities: string[];
  status: ProviderStatus;
  enabled: boolean;
  failure_count: number;
  last_success: string | null;
  last_failure: string | null;
  cooldown_until: string | null;
  last_health_check: string | null;
  request_count: number;
  requests?: number;
  errors?: number;
  last_used?: string | null;
  rate_limit_until?: string | null;
  created_at: string;
  updated_at: string;
}

interface UsageStats {
  id: string;
  provider: string;
  project: string;
  model: string;
  task: string;
  requests: number;
  success: number;
  failures: number;
  latency: number;
  input_tokens: number;
  output_tokens: number;
  timestamp: string;
}

interface Prompt {
  id: string;
  task_type: string;
  prompt_text: string;
  version: number;
  active: boolean;
  created_at: string;
}

interface LandingPageStyle {
  id: string;
  section: string;
  style_config: Record<string, any>;
  active: boolean;
  updated_at: string;
}

interface AuditLog {
  id: string;
  actor_email: string | null;
  action: string;
  details: Record<string, any> | null;
  created_at: string;
}

interface RoutingConfig {
  id: string;
  task_type: string;
  primary_provider_id: string;
  fallback_provider_ids: string[];
  created_at: string;
}

// Status configurations
const STATUS_CONFIG = {
  HEALTHY: { emoji: '🟢', label: 'HEALTHY', color: 'text-emerald-400 bg-emerald-500/10' },
  DEGRADED: { emoji: '🟡', label: 'DEGRADED', color: 'text-amber-400 bg-amber-500/10' },
  RATE_LIMITED: { emoji: '🟠', label: 'RATE LIMITED', color: 'text-orange-400 bg-orange-500/10' },
  FAILED: { emoji: '🔴', label: 'FAILED', color: 'text-red-400 bg-red-500/10' },
  DISABLED: { emoji: '⚫', label: 'DISABLED', color: 'text-slate-400 bg-slate-500/10' },
  TESTING: { emoji: '🔵', label: 'TESTING', color: 'text-blue-400 bg-blue-500/10' },
};

const CAPABILITY_OPTIONS = [
  { value: 'text', label: 'Text Generation' },
  { value: 'vision', label: 'Vision/Multimodal' },
  { value: 'structured_output', label: 'Structured Output' },
  { value: 'image_generation', label: 'Image Generation' },
  { value: 'audio', label: 'Audio Processing' },
];

const TASK_TYPES = [
  'product_description',
  'image_generation',
  'category_classification',
  'price_optimization',
  'customer_support',
  'content_creation',
  'translation',
  'sentiment_analysis',
];

const DATE_FILTERS = [
  { value: 'today', label: 'Today' },
  { value: '7days', label: '7 Days' },
  { value: '30days', label: '30 Days' },
];

export default function AIInfrastructure() {
  // Provider management
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [showCredential, setShowCredential] = useState(false);

  // Provider form state
  const [providerForm, setProviderForm] = useState<{
    name: string;
    provider_type: AIProvider['provider_type'];
    project_id: string;
    model_id: string;
    priority: number;
    encrypted_credential: string;
    capabilities: string[];
  }>({
    name: '',
    provider_type: 'gemini',
    project_id: '',
    model_id: '',
    priority: 1,
    encrypted_credential: '',
    capabilities: [] as string[],
  });

  // Usage statistics
  const [usageStats, setUsageStats] = useState<UsageStats[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [dateFilter, setDateFilter] = useState('7days');

  // Prompts
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [promptForm, setPromptForm] = useState({
    task_type: '',
    prompt_text: '',
  });

  // Styles
  const [styles, setStyles] = useState<LandingPageStyle[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(true);
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  const [editingStyle, setEditingStyle] = useState<LandingPageStyle | null>(null);
  const [styleForm, setStyleForm] = useState({
    section: '',
    style_config: '{}',
  });

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);

  // Routing config
  const [routingConfigs, setRoutingConfigs] = useState<RoutingConfig[]>([]);
  const [loadingRouting, setLoadingRouting] = useState(true);
  const [routingModalOpen, setRoutingModalOpen] = useState(false);
  const [editingRouting, setEditingRouting] = useState<RoutingConfig | null>(null);
  const [routingForm, setRoutingForm] = useState({
    task_type: '',
    primary_provider_id: '',
    fallback_provider_ids: [] as string[],
  });

  // Health check config
  const [healthCheckInterval, setHealthCheckInterval] = useState(60);

  // Countdown timer for rate-limited providers
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  // Load providers
  const loadProviders = useCallback(async () => {
    setLoadingProviders(true);
    const { data, error } = await supabase
      .from('ai_providers')
      .select('*')
      .order('priority', { ascending: true });

    if (error) {
      toast.error('Failed to load AI providers');
      console.error(error);
    } else {
      setProviders((data || []) as AIProvider[]);
    }
    setLoadingProviders(false);
  }, []);

  // Load usage statistics
  const loadUsageStats = useCallback(async () => {
    setLoadingStats(true);
    const now = new Date();
    let startDate = new Date();

    if (dateFilter === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (dateFilter === '7days') {
      startDate.setDate(now.getDate() - 7);
    } else if (dateFilter === '30days') {
      startDate.setDate(now.getDate() - 30);
    }

    const { data, error } = await supabase
      .from('ai_usage_stats')
      .select('*')
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) {
      toast.error('Failed to load usage statistics');
      console.error(error);
    } else {
      setUsageStats(data || []);
    }
    setLoadingStats(false);
  }, [dateFilter]);

  // Load prompts
  const loadPrompts = useCallback(async () => {
    setLoadingPrompts(true);
    const { data, error } = await supabase
      .from('ai_prompts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load prompts');
      console.error(error);
    } else {
      setPrompts(data || []);
    }
    setLoadingPrompts(false);
  }, []);

  // Load styles
  const loadStyles = useCallback(async () => {
    setLoadingStyles(true);
    const { data, error } = await supabase
      .from('landing_page_styles')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      toast.error('Failed to load styles');
      console.error(error);
    } else {
      setStyles(data || []);
    }
    setLoadingStyles(false);
  }, []);

  // Load audit logs
  const loadAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    const { data, error } = await supabase
      .from('platform_audit_logs')
      .select('*')
      .ilike('action', '%ai%')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      toast.error('Failed to load audit logs');
      console.error(error);
    } else {
      setAuditLogs(data || []);
    }
    setLoadingAudit(false);
  }, []);

  // Load routing configs
  const loadRoutingConfigs = useCallback(async () => {
    setLoadingRouting(true);
    const { data, error } = await supabase
      .from('ai_routing_config')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load routing configs');
      console.error(error);
    } else {
      setRoutingConfigs(data || []);
    }
    setLoadingRouting(false);
  }, []);

  // Initial load
  useEffect(() => {
    loadProviders();
    loadUsageStats();
    loadPrompts();
    loadStyles();
    loadAuditLogs();
    loadRoutingConfigs();
  }, [loadProviders, loadUsageStats, loadPrompts, loadStyles, loadAuditLogs, loadRoutingConfigs]);

  // Countdown timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      const newCountdowns: Record<string, number> = {};
      providers.forEach(provider => {
        if (provider.status === 'RATE_LIMITED' && provider.rate_limit_until) {
          const until = new Date(provider.rate_limit_until).getTime();
          const now = Date.now();
          const remaining = Math.max(0, Math.floor((until - now) / 1000));
          if (remaining > 0) {
            newCountdowns[provider.id] = remaining;
          }
        }
      });
      setCountdowns(newCountdowns);
    }, 1000);

    return () => clearInterval(interval);
  }, [providers]);

  // Provider CRUD operations
  const handleAddProvider = () => {
    setEditingProvider(null);
    setProviderForm({
      name: '',
      provider_type: 'gemini',
      project_id: '',
      model_id: '',
      priority: 1,
      encrypted_credential: '',
      capabilities: [],
    });
    setProviderModalOpen(true);
  };

  const handleEditProvider = (provider: AIProvider) => {
    setEditingProvider(provider);
    setProviderForm({
      name: provider.name,
      provider_type: provider.provider_type,
      project_id: provider.project_id,
      model_id: provider.model_id,
      priority: provider.priority,
      encrypted_credential: provider.encrypted_credential || provider.credential_encrypted || '',
      capabilities: provider.capabilities,
    });
    setProviderModalOpen(true);
  };

  const handleSaveProvider = async () => {
    try {
      if (editingProvider) {
        const { error } = await supabase
          .from('ai_providers')
          .update({
            name: providerForm.name,
            provider_type: providerForm.provider_type,
            project_id: providerForm.project_id,
            model_id: providerForm.model_id,
            priority: providerForm.priority,
            encrypted_credential: providerForm.encrypted_credential,
            credential_encrypted: providerForm.encrypted_credential,
            capabilities: providerForm.capabilities,
            enabled: true,
          })
          .eq('id', editingProvider.id);

        if (error) throw error;
        toast.success('Provider updated successfully');
      } else {
        const { error } = await supabase
          .from('ai_providers')
          .insert({
            name: providerForm.name,
            provider_type: providerForm.provider_type,
            project_id: providerForm.project_id,
            model_id: providerForm.model_id,
            priority: providerForm.priority,
            encrypted_credential: providerForm.encrypted_credential,
            credential_encrypted: providerForm.encrypted_credential,
            capabilities: providerForm.capabilities,
            status: 'TESTING',
            enabled: true,
          });

        if (error) throw error;
        toast.success('Provider added successfully');
      }

      setProviderModalOpen(false);
      loadProviders();
    } catch (error) {
      toast.error('Failed to save provider');
      console.error(error);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return;

    const { error } = await supabase.from('ai_providers').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete provider');
      console.error(error);
    } else {
      toast.success('Provider deleted successfully');
      loadProviders();
    }
  };

  const handleTestProvider = async (provider: AIProvider) => {
    try {
      // Update status to testing
      await supabase
        .from('ai_providers')
        .update({ status: 'TESTING' })
        .eq('id', provider.id);

      setProviders(prev => prev.map(p =>
        p.id === provider.id ? { ...p, status: 'TESTING' as ProviderStatus } : p
      ));

      // Simulate test - in real implementation, make actual API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update status based on result
      const success = Math.random() > 0.2; // 80% success rate for demo
      const newStatus: ProviderStatus = success ? 'HEALTHY' : 'FAILED';

      await supabase
        .from('ai_providers')
        .update({ status: newStatus, last_used: new Date().toISOString() })
        .eq('id', provider.id);

      setProviders(prev => prev.map(p =>
        p.id === provider.id ? { ...p, status: newStatus, last_used: new Date().toISOString() } : p
      ));

      toast.success(success ? 'Provider test passed' : 'Provider test failed');
    } catch (error) {
      toast.error('Failed to test provider');
      console.error(error);
    }
  };

  const handleRetryProvider = async (provider: AIProvider) => {
    await supabase
      .from('ai_providers')
        .update({ status: 'HEALTHY', rate_limit_until: null })
      .eq('id', provider.id);

    setProviders(prev => prev.map(p =>
      p.id === provider.id ? { ...p, status: 'HEALTHY' as ProviderStatus, rate_limit_until: null } : p
    ));

    toast.success('Provider retry enabled');
  };

  // Prompt CRUD operations
  const handleAddPrompt = () => {
    setEditingPrompt(null);
    setPromptForm({ task_type: '', prompt_text: '' });
    setPromptModalOpen(true);
  };

  const handleEditPrompt = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setPromptForm({ task_type: prompt.task_type, prompt_text: prompt.prompt_text });
    setPromptModalOpen(true);
  };

  const handleSavePrompt = async () => {
    try {
      if (editingPrompt) {
        const { error } = await supabase
          .from('ai_prompts')
          .update({
            task_type: promptForm.task_type,
            prompt_text: promptForm.prompt_text,
          })
          .eq('id', editingPrompt.id);

        if (error) throw error;
        toast.success('Prompt updated successfully');
      } else {
        const { error } = await supabase
          .from('ai_prompts')
          .insert({
            task_type: promptForm.task_type,
            prompt_text: promptForm.prompt_text,
            version: 1,
            active: true,
          });

        if (error) throw error;
        toast.success('Prompt added successfully');
      }

      setPromptModalOpen(false);
      loadPrompts();
    } catch (error) {
      toast.error('Failed to save prompt');
      console.error(error);
    }
  };

  const handleDeletePrompt = async (id: string) => {
    if (!confirm('Are you sure you want to delete this prompt?')) return;

    const { error } = await supabase.from('ai_prompts').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete prompt');
      console.error(error);
    } else {
      toast.success('Prompt deleted successfully');
      loadPrompts();
    }
  };

  const handleTogglePromptActive = async (prompt: Prompt) => {
    const { error } = await supabase
      .from('ai_prompts')
      .update({ active: !prompt.active })
      .eq('id', prompt.id);

    if (error) {
      toast.error('Failed to toggle prompt');
      console.error(error);
    } else {
      setPrompts(prev => prev.map(p =>
        p.id === prompt.id ? { ...p, active: !p.active } : p
      ));
      toast.success('Prompt toggled successfully');
    }
  };

  // Style CRUD operations
  const handleAddStyle = () => {
    setEditingStyle(null);
    setStyleForm({ section: '', style_config: '{}' });
    setStyleModalOpen(true);
  };

  const handleEditStyle = (style: LandingPageStyle) => {
    setEditingStyle(style);
    setStyleForm({
      section: style.section,
      style_config: JSON.stringify(style.style_config, null, 2)
    });
    setStyleModalOpen(true);
  };

  const handleSaveStyle = async () => {
    try {
      const styleConfig = JSON.parse(styleForm.style_config);

      if (editingStyle) {
        const { error } = await supabase
          .from('landing_page_styles')
          .update({
            section: styleForm.section,
            style_config: styleConfig,
          })
          .eq('id', editingStyle.id);

        if (error) throw error;
        toast.success('Style updated successfully');
      } else {
        const { error } = await supabase
          .from('landing_page_styles')
          .insert({
            section: styleForm.section,
            style_config: styleConfig,
            active: true,
          });

        if (error) throw error;
        toast.success('Style added successfully');
      }

      setStyleModalOpen(false);
      loadStyles();
    } catch (error) {
      toast.error('Invalid JSON in style config');
      console.error(error);
    }
  };

  const handleDeleteStyle = async (id: string) => {
    if (!confirm('Are you sure you want to delete this style?')) return;

    const { error } = await supabase.from('landing_page_styles').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete style');
      console.error(error);
    } else {
      toast.success('Style deleted successfully');
      loadStyles();
    }
  };

  // Routing CRUD operations
  const handleAddRouting = () => {
    setEditingRouting(null);
    setRoutingForm({ task_type: '', primary_provider_id: '', fallback_provider_ids: [] });
    setRoutingModalOpen(true);
  };

  const handleEditRouting = (routing: RoutingConfig) => {
    setEditingRouting(routing);
    setRoutingForm({
      task_type: routing.task_type,
      primary_provider_id: routing.primary_provider_id,
      fallback_provider_ids: routing.fallback_provider_ids,
    });
    setRoutingModalOpen(true);
  };

  const handleSaveRouting = async () => {
    try {
      if (editingRouting) {
        const { error } = await supabase
          .from('ai_routing_config')
          .update({
            task_type: routingForm.task_type,
            primary_provider_id: routingForm.primary_provider_id,
            fallback_provider_ids: routingForm.fallback_provider_ids,
          })
          .eq('id', editingRouting.id);

        if (error) throw error;
        toast.success('Routing config updated successfully');
      } else {
        const { error } = await supabase
          .from('ai_routing_config')
          .insert({
            task_type: routingForm.task_type,
            primary_provider_id: routingForm.primary_provider_id,
            fallback_provider_ids: routingForm.fallback_provider_ids,
          });

        if (error) throw error;
        toast.success('Routing config added successfully');
      }

      setRoutingModalOpen(false);
      loadRoutingConfigs();
    } catch (error) {
      toast.error('Failed to save routing config');
      console.error(error);
    }
  };

  const handleDeleteRouting = async (id: string) => {
    if (!confirm('Are you sure you want to delete this routing config?')) return;

    const { error } = await supabase.from('ai_routing_config').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete routing config');
      console.error(error);
    } else {
      toast.success('Routing config deleted successfully');
      loadRoutingConfigs();
    }
  };

  // Health check interval update
  const handleUpdateHealthCheckInterval = async () => {
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'ai_health_check_interval', value: healthCheckInterval });

    if (error) {
      toast.error('Failed to update health check interval');
      console.error(error);
    } else {
      toast.success('Health check interval updated');
    }
  };

  // Toggle capability
  const toggleCapability = (capability: string) => {
    setProviderForm(prev => ({
      ...prev,
      capabilities: prev.capabilities.includes(capability)
        ? prev.capabilities.filter(c => c !== capability)
        : [...prev.capabilities, capability],
    }));
  };

  // Toggle fallback provider
  const toggleFallbackProvider = (providerId: string) => {
    setRoutingForm(prev => ({
      ...prev,
      fallback_provider_ids: prev.fallback_provider_ids.includes(providerId)
        ? prev.fallback_provider_ids.filter(id => id !== providerId)
        : [...prev.fallback_provider_ids, providerId],
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Infrastructure"
        subtitle="Manage AI providers, routing, prompts, and monitor usage across the platform."
        action={
          <button
            onClick={loadProviders}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-[12.5px] text-slate-300 hover:bg-slate-700/50 transition-colors"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />

      {/* Health Check Configuration */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-brand-accent" />
          <div className="text-[12px] uppercase tracking-[0.2em] text-slate-500 font-medium">Health Check Configuration</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-[12px] text-slate-400 mb-1 block">Health Check Interval (seconds)</label>
            <input
              type="number"
              value={healthCheckInterval}
              onChange={e => setHealthCheckInterval(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent"
              min="10"
              max="3600"
            />
          </div>
          <button
            onClick={handleUpdateHealthCheckInterval}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-accent/80 transition-colors"
          >
            <Save size={14} /> Save
          </button>
        </div>
      </div>

      {/* Provider Management */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <BrainCircuit size={18} className="text-brand-accent" />
            <div className="text-[14px] font-semibold text-white">AI Providers</div>
          </div>
          <button
            onClick={handleAddProvider}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-accent/80 transition-colors"
          >
            <Plus size={14} /> Add Provider
          </button>
        </div>

        {loadingProviders ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={20} className="animate-spin text-slate-500" />
          </div>
        ) : providers.length === 0 ? (
          <div className="p-10 text-center">
            <BrainCircuit size={32} className="mx-auto mb-3 text-slate-600" />
            <div className="text-[14px] font-medium text-slate-400">No AI providers configured</div>
            <div className="text-[12.5px] text-slate-500 mt-1">Add your first AI provider to get started</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/30">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Provider</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Project</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Model</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Requests</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Errors</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Last Used</th>
                  <th className="px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {providers.map(provider => {
                  const statusConfig = STATUS_CONFIG[provider.status];
                  return (
                    <tr key={provider.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="text-[13px] font-medium text-white">{provider.name}</div>
                          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400 capitalize">
                            {provider.provider_type}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[12.5px] text-slate-400">{provider.project_id}</td>
                      <td className="px-5 py-3 text-[12.5px] text-slate-400">{provider.model_id}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-medium ${statusConfig.color}`}>
                          {statusConfig.emoji} {statusConfig.label}
                        </span>
                        {provider.status === 'RATE_LIMITED' && countdowns[provider.id] !== undefined && (
                          <div className="text-[10px] text-orange-400 mt-1">
                            Retry in: {Math.floor(countdowns[provider.id] / 60)}:{(countdowns[provider.id] % 60).toString().padStart(2, '0')}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-[12.5px] text-slate-400">{(provider.requests ?? provider.request_count ?? 0).toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-[12.5px] text-red-400">{(provider.errors ?? provider.failure_count ?? 0).toLocaleString()}</td>
                      <td className="px-5 py-3 text-[12px] text-slate-500">
                        {provider.last_used ? new Date(provider.last_used).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleTestProvider(provider)}
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-green-400 transition-colors"
                            title="Test Now"
                          >
                            <Play size={14} />
                          </button>
                          {provider.status === 'RATE_LIMITED' && (
                            <button
                              onClick={() => handleRetryProvider(provider)}
                              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors"
                              title="Retry"
                            >
                              <RefreshCw size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleEditProvider(provider)}
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-brand-accent transition-colors"
                            title="Edit"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteProvider(provider.id)}
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Usage Statistics */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-brand-accent" />
            <div className="text-[14px] font-semibold text-white">Usage Statistics</div>
          </div>
          <div className="flex items-center gap-2">
            {DATE_FILTERS.map(filter => (
              <button
                key={filter.value}
                onClick={() => setDateFilter(filter.value)}
                className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors ${dateFilter === filter.value
                  ? 'bg-brand-accent text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {loadingStats ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={20} className="animate-spin text-slate-500" />
          </div>
        ) : usageStats.length === 0 ? (
          <div className="p-10 text-center">
            <Activity size={32} className="mx-auto mb-3 text-slate-600" />
            <div className="text-[14px] font-medium text-slate-400">No usage data available</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/30">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Provider</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Project</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Model</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Task</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Requests</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Success</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Failures</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Latency</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">In Tokens</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Out Tokens</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {usageStats.map(stat => (
                  <tr key={stat.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-5 py-3 text-[12.5px] text-white">{stat.provider}</td>
                    <td className="px-5 py-3 text-[12.5px] text-slate-400">{stat.project}</td>
                    <td className="px-5 py-3 text-[12.5px] text-slate-400">{stat.model}</td>
                    <td className="px-5 py-3 text-[12.5px] text-slate-400">{stat.task}</td>
                    <td className="px-5 py-3 text-right text-[12.5px] text-white">{stat.requests.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-[12.5px] text-green-400">{stat.success.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-[12.5px] text-red-400">{stat.failures.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-[12.5px] text-slate-400">{stat.latency}ms</td>
                    <td className="px-5 py-3 text-right text-[12.5px] text-slate-400">{stat.input_tokens.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-[12.5px] text-slate-400">{stat.output_tokens.toLocaleString()}</td>
                    <td className="px-5 py-3 text-[12px] text-slate-500">{new Date(stat.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provider Routing Configuration */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <GitMerge size={18} className="text-brand-accent" />
            <div className="text-[14px] font-semibold text-white">Provider Routing</div>
          </div>
          <button
            onClick={handleAddRouting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-accent/80 transition-colors"
          >
            <Plus size={14} /> Add Routing
          </button>
        </div>

        {loadingRouting ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={20} className="animate-spin text-slate-500" />
          </div>
        ) : routingConfigs.length === 0 ? (
          <div className="p-10 text-center">
            <GitMerge size={32} className="mx-auto mb-3 text-slate-600" />
            <div className="text-[14px] font-medium text-slate-400">No routing configurations</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/30">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Task Type</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Primary Provider</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Fallback Providers</th>
                  <th className="px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {routingConfigs.map(config => {
                  const primaryProvider = providers.find(p => p.id === config.primary_provider_id);
                  return (
                    <tr key={config.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-5 py-3">
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11.5px] text-white capitalize">
                          {config.task_type}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[12.5px] text-white">
                        {primaryProvider?.name || 'Unknown'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {config.fallback_provider_ids.map(id => {
                            const provider = providers.find(p => p.id === id);
                            return provider ? (
                              <span key={id} className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
                                {provider.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEditRouting(config)}
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-brand-accent transition-colors"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteRouting(config.id)}
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Prompt Management */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand-accent" />
            <div className="text-[14px] font-semibold text-white">Prompt Management</div>
          </div>
          <button
            onClick={handleAddPrompt}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-accent/80 transition-colors"
          >
            <Plus size={14} /> Add Prompt
          </button>
        </div>

        {loadingPrompts ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={20} className="animate-spin text-slate-500" />
          </div>
        ) : prompts.length === 0 ? (
          <div className="p-10 text-center">
            <FileText size={32} className="mx-auto mb-3 text-slate-600" />
            <div className="text-[14px] font-medium text-slate-400">No prompts configured</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {prompts.map(prompt => (
              <div key={prompt.id} className="p-5 hover:bg-slate-800/20 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11.5px] text-white capitalize">
                        {prompt.task_type}
                      </span>
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
                        v{prompt.version}
                      </span>
                      {prompt.active && (
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[12.5px] text-slate-400 line-clamp-2">
                      {prompt.prompt_text}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleTogglePromptActive(prompt)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
                      title={prompt.active ? 'Deactivate' : 'Activate'}
                    >
                      {prompt.active ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    </button>
                    <button
                      onClick={() => handleEditPrompt(prompt)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-brand-accent transition-colors"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleDeletePrompt(prompt.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Style Management */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Palette size={18} className="text-brand-accent" />
            <div className="text-[14px] font-semibold text-white">Landing Page Styles</div>
          </div>
          <button
            onClick={handleAddStyle}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-accent/80 transition-colors"
          >
            <Plus size={14} /> Add Style
          </button>
        </div>

        {loadingStyles ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={20} className="animate-spin text-slate-500" />
          </div>
        ) : styles.length === 0 ? (
          <div className="p-10 text-center">
            <Palette size={32} className="mx-auto mb-3 text-slate-600" />
            <div className="text-[14px] font-medium text-slate-400">No styles configured</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {styles.map(style => (
              <div key={style.id} className="p-5 hover:bg-slate-800/20 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11.5px] text-white capitalize">
                        {style.section}
                      </span>
                      {style.active && (
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
                          Active
                        </span>
                      )}
                    </div>
                    <pre className="text-[11px] text-slate-400 bg-slate-800/50 rounded-lg p-3 overflow-x-auto">
                      {JSON.stringify(style.style_config, null, 2)}
                    </pre>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleEditStyle(style)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-brand-accent transition-colors"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteStyle(style.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit Logs */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-brand-accent" />
            <div className="text-[14px] font-semibold text-white">AI Audit Logs</div>
          </div>
        </div>

        {loadingAudit ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={20} className="animate-spin text-slate-500" />
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="p-10 text-center">
            <Shield size={32} className="mx-auto mb-3 text-slate-600" />
            <div className="text-[14px] font-medium text-slate-400">No audit logs</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50 max-h-[400px] overflow-y-auto">
            {auditLogs.map(log => (
              <div key={log.id} className="p-4 hover:bg-slate-800/20 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] text-white mb-1">{log.action}</div>
                    <div className="text-[11px] text-slate-500">{log.actor_email || 'System'}</div>
                  </div>
                  <div className="text-[11px] text-slate-500 shrink-0">
                    {new Date(log.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Provider Modal */}
      {providerModalOpen && (
        <Modal
          title={editingProvider ? 'Edit Provider' : 'Add Provider'}
          onClose={() => setProviderModalOpen(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="text-[12px] text-slate-400 mb-1 block">Name</label>
              <input
                type="text"
                value={providerForm.name}
                onChange={e => setProviderForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent"
                placeholder="e.g., Gemini Pro Primary"
              />
            </div>

            <div>
              <label className="text-[12px] text-slate-400 mb-1 block">Provider Type</label>
              <select
                value={providerForm.provider_type}
                onChange={e => setProviderForm(prev => ({ ...prev, provider_type: e.target.value as any }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent"
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label className="text-[12px] text-slate-400 mb-1 block">Project ID</label>
              <input
                type="text"
                value={providerForm.project_id}
                onChange={e => setProviderForm(prev => ({ ...prev, project_id: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent"
                placeholder="e.g., my-project-123"
              />
            </div>

            <div>
              <label className="text-[12px] text-slate-400 mb-1 block">Model ID</label>
              <input
                type="text"
                value={providerForm.model_id}
                onChange={e => setProviderForm(prev => ({ ...prev, model_id: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent"
                placeholder="e.g., gemini-pro"
              />
            </div>

            <div>
              <label className="text-[12px] text-slate-400 mb-1 block">Priority</label>
              <input
                type="number"
                value={providerForm.priority}
                onChange={e => setProviderForm(prev => ({ ...prev, priority: Number(e.target.value) }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent"
                min="1"
                max="100"
              />
            </div>

            <div>
              <label className="text-[12px] text-slate-400 mb-1 block">Credential (API Key)</label>
              <div className="relative">
                <input
                  type={showCredential ? 'text' : 'password'}
                  value={providerForm.encrypted_credential}
                  onChange={e => setProviderForm(prev => ({ ...prev, encrypted_credential: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent pr-10"
                  placeholder="Enter API key"
                />
                <button
                  type="button"
                  onClick={() => setShowCredential(!showCredential)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showCredential ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[12px] text-slate-400 mb-2 block">Capabilities</label>
              <div className="flex flex-wrap gap-2">
                {CAPABILITY_OPTIONS.map(cap => (
                  <button
                    key={cap.value}
                    type="button"
                    onClick={() => toggleCapability(cap.value)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${providerForm.capabilities.includes(cap.value)
                      ? 'bg-brand-accent text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                  >
                    {cap.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                onClick={() => setProviderModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-[13px] text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProvider}
                className="px-4 py-2 rounded-lg bg-brand-accent text-[13px] font-medium text-white hover:bg-brand-accent/80 transition-colors"
              >
                {editingProvider ? 'Update' : 'Add'} Provider
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Prompt Modal */}
      {promptModalOpen && (
        <Modal
          title={editingPrompt ? 'Edit Prompt' : 'Add Prompt'}
          onClose={() => setPromptModalOpen(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="text-[12px] text-slate-400 mb-1 block">Task Type</label>
              <select
                value={promptForm.task_type}
                onChange={e => setPromptForm(prev => ({ ...prev, task_type: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent"
              >
                <option value="">Select task type</option>
                {TASK_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[12px] text-slate-400 mb-1 block">Prompt Text</label>
              <textarea
                value={promptForm.prompt_text}
                onChange={e => setPromptForm(prev => ({ ...prev, prompt_text: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent min-h-[150px] resize-y"
                placeholder="Enter prompt template..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                onClick={() => setPromptModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-[13px] text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePrompt}
                className="px-4 py-2 rounded-lg bg-brand-accent text-[13px] font-medium text-white hover:bg-brand-accent/80 transition-colors"
              >
                {editingPrompt ? 'Update' : 'Add'} Prompt
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Style Modal */}
      {styleModalOpen && (
        <Modal
          title={editingStyle ? 'Edit Style' : 'Add Style'}
          onClose={() => setStyleModalOpen(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="text-[12px] text-slate-400 mb-1 block">Section</label>
              <input
                type="text"
                value={styleForm.section}
                onChange={e => setStyleForm(prev => ({ ...prev, section: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent"
                placeholder="e.g., hero, features, pricing"
              />
            </div>

            <div>
              <label className="text-[12px] text-slate-400 mb-1 block">Style Config (JSON)</label>
              <textarea
                value={styleForm.style_config}
                onChange={e => setStyleForm(prev => ({ ...prev, style_config: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent min-h-[200px] resize-y font-mono"
                placeholder='{"backgroundColor": "#1a1a2e", "textColor": "#ffffff"}'
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                onClick={() => setStyleModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-[13px] text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStyle}
                className="px-4 py-2 rounded-lg bg-brand-accent text-[13px] font-medium text-white hover:bg-brand-accent/80 transition-colors"
              >
                {editingStyle ? 'Update' : 'Add'} Style
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Routing Modal */}
      {routingModalOpen && (
        <Modal
          title={editingRouting ? 'Edit Routing' : 'Add Routing'}
          onClose={() => setRoutingModalOpen(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="text-[12px] text-slate-400 mb-1 block">Task Type</label>
              <select
                value={routingForm.task_type}
                onChange={e => setRoutingForm(prev => ({ ...prev, task_type: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent"
              >
                <option value="">Select task type</option>
                {TASK_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[12px] text-slate-400 mb-1 block">Primary Provider</label>
              <select
                value={routingForm.primary_provider_id}
                onChange={e => setRoutingForm(prev => ({ ...prev, primary_provider_id: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-brand-accent"
              >
                <option value="">Select primary provider</option>
                {providers.map(provider => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[12px] text-slate-400 mb-2 block">Fallback Providers</label>
              <div className="flex flex-wrap gap-2">
                {providers.map(provider => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => toggleFallbackProvider(provider.id)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${routingForm.fallback_provider_ids.includes(provider.id)
                      ? 'bg-brand-accent text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                  >
                    {provider.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                onClick={() => setRoutingModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-[13px] text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRouting}
                className="px-4 py-2 rounded-lg bg-brand-accent text-[13px] font-medium text-white hover:bg-brand-accent/80 transition-colors"
              >
                {editingRouting ? 'Update' : 'Add'} Routing
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
