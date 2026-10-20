import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Check, ChevronRight, CircleAlert, Copy, FileImage, GripVertical,
  Layers3, Loader2, MousePointer2, Plus, Rocket, Save, Trash2, UploadCloud, X,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { toast } from "../components/Toast";
import { metaAdsService, uploadMetaCreativeFiles, type MetaConnectionStatus } from "../services/metaAdsService";
import { metaLegacyService, type MetaLegacyStatus } from "../services/metaLegacyService";

type StudioAd = {
  id: string; name: string; creativeLabel: string; primaryText: string;
  headline: string; destinationUrl: string; cta: string;
};
type StudioAdset = {
  id: string; name: string; dailyBudget: number; countries: string; ads: StudioAd[];
};
type StudioCampaign = {
  id: string; name: string; budgetMode: "CBO" | "ABO"; dailyBudget: number;
  adsets: StudioAdset[];
};
type Selection = { kind: "setup" | "campaign" | "adset" | "ad"; id?: string };
type Media = { id: string; file: File };
type Preset = { id: string; name: string; configuration: { studio_version?: number; campaigns?: StudioCampaign[]; setup?: Partial<StudioSetup> }; created_by: string | null; visibility?: string };
type StudioSetup = {
  accountId: string; pageId: string; instagramId: string; pixelId: string;
  conversionEvent: string; destinationUrl: string; launchMode: "PAUSED" | "ACTIVE" | "SCHEDULED";
  launchAt: string;
};
type DragPayload = { kind: "campaign" | "adset" | "ad" | "creative"; id?: string };
type DropTarget = { kind: "campaign-list" | "campaign" | "adset" | "ad"; id?: string };

const fieldClass = "w-full rounded-xl border border-base-border bg-base-raised px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";
const cardClass = "rounded-2xl border border-base-border bg-base-surface";
const nameSafe = (value: string) => value.trim().slice(0, 240);
const newAd = (): StudioAd => ({ id: crypto.randomUUID(), name: "New ad", creativeLabel: "Creative needed", primaryText: "", headline: "", destinationUrl: "", cta: "SHOP_NOW" });
const newAdset = (): StudioAdset => ({ id: crypto.randomUUID(), name: "New ad set", dailyBudget: 10, countries: "MA", ads: [] });
const newCampaign = (): StudioCampaign => ({ id: crypto.randomUUID(), name: "New campaign", budgetMode: "ABO", dailyBudget: 30, adsets: [] });

function readDrag(event: DragEvent): DragPayload | null {
  try { return JSON.parse(event.dataTransfer.getData("application/ecomos-studio")) as DragPayload; }
  catch { return null; }
}
function setDrag(event: DragEvent, payload: DragPayload) {
  event.dataTransfer.effectAllowed = payload.id && payload.kind !== "creative" ? "move" : "copy";
  event.dataTransfer.setData("application/ecomos-studio", JSON.stringify(payload));
}
function isWebUrl(value: string) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}
function accountTime(value: string, timezone?: string): string {
  if (!value || !timezone) return "Meta receives the exact UTC instant";
  try { return `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value))} in ${timezone}`; }
  catch { return "Meta receives the exact UTC instant"; }
}

type StudioProps = { mode?: "legacy" | "oauth"; legacyStatus?: MetaLegacyStatus | null; onExit?: () => void };

function knownLegacyConnection(status: MetaLegacyStatus): MetaConnectionStatus {
  const account = status.connection;
  return {
    state: status.connected && account ? "connected" : "not_connected",
    connection: account ? { id: account.id, status: account.status, default_ad_account_id: account.ad_account_id } : null,
    businesses: [],
    ad_accounts: account ? [{ id: account.ad_account_id, name: account.account_name ?? account.ad_account_id,
      currency: account.currency ?? undefined, timezone: account.timezone_name ?? undefined }] : [],
    pages: [], instagram_accounts: [], pixels: [],
  };
}

export default function MetaLaunchStudio({ mode, legacyStatus, onExit }: StudioProps = {}) {
  const location = useLocation();
  const isLegacy = mode === "legacy" || (mode !== "oauth" && location.pathname.startsWith("/ads-manager-legacy"));
  const source = isLegacy ? "legacy" as const : "oauth" as const;
  const backPath = isLegacy ? "/ads-manager-legacy" : "/ads-manager";
  const { workspace, profile, isDemoMode } = useAuth();
  const [connection, setConnection] = useState<MetaConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [assetsError, setAssetsError] = useState("");
  const [assetsIssues, setAssetsIssues] = useState<{ pages?: string; pixels?: string; instagram?: string }>({});
  const [backendReady, setBackendReady] = useState(false);
  const [assetReload, setAssetReload] = useState(0);
  const [campaigns, setCampaigns] = useState<StudioCampaign[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "setup" });
  const [setup, setSetup] = useState<StudioSetup>({ accountId: "", pageId: "", instagramId: "", pixelId: "", conversionEvent: "PURCHASE", destinationUrl: "", launchMode: "PAUSED", launchAt: "" });
  const [media, setMedia] = useState<Media[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [sharing, setSharing] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [jobs, setJobs] = useState<Array<{ id: string; status: string; total_items: number; succeeded_items: number; failed_items: number; last_error: string | null }>>([]);
  const [publishKey, setPublishKey] = useState(() => crypto.randomUUID());
  const [uploadedMedia, setUploadedMedia] = useState<Record<string, { name: string; image_hash?: string; video_id?: string; media_type: "image" | "video" }>>({});
  const [published, setPublished] = useState(false);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  useEffect(() => { setUploadedMedia({}); }, [setup.accountId]);

  const loadPresets = useCallback(async () => {
    if (!workspace?.id) return;
    const { data, error } = await supabase.from("meta_workflows")
      .select("id,name,configuration,created_by,visibility")
      .eq("workspace_id", workspace.id)
      .eq("is_template", true)
      .order("updated_at", { ascending: false });
    if (error) return;
    setPresets((data ?? []).filter((item) => item.configuration?.studio_version === 1) as Preset[]);
  }, [workspace?.id]);
  useEffect(() => {
    if (isDemoMode) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setAssetsError("");
    setAssetsIssues({});
    setBackendReady(false);
    const applyConnection = (result: MetaConnectionStatus) => {
      if (cancelled) return;
      const firstAvailablePixel = result.pixels.find((item) => !item.is_unavailable && (!item.ad_account_id || item.ad_account_id === result.connection?.default_ad_account_id));
      setConnection(result);
      setSetup((current) => ({ ...current,
        accountId: isLegacy ? result.connection?.default_ad_account_id || result.ad_accounts[0]?.id || "" : current.accountId || result.connection?.default_ad_account_id || result.ad_accounts[0]?.id || "",
        pageId: isLegacy && result.pages.length > 0 && !result.pages.some((item) => item.id === current.pageId) ? result.pages[0]?.id || "" : current.pageId || result.connection?.default_page_id || result.pages[0]?.id || "",
        instagramId: isLegacy && !result.instagram_accounts.some((item) => item.id === current.instagramId) ? "" : current.instagramId || result.connection?.default_instagram_account_id || "",
        pixelId: isLegacy && firstAvailablePixel && !result.pixels.some((item) => item.id === current.pixelId && !item.is_unavailable) ? firstAvailablePixel.id : current.pixelId || result.connection?.default_pixel_id || firstAvailablePixel?.id || "",
      }));
    };
    const load = async () => {
      try {
        if (isLegacy) {
          const known = legacyStatus ?? await metaLegacyService.status();
          if (!cancelled) {
            setConnection(knownLegacyConnection(known));
            setSetup((current) => ({ ...current, accountId: known.connection?.ad_account_id || current.accountId }));
          }
          if (!known.connected || !known.connection) return;
          try {
            const assets = await metaLegacyService.launchAssets();
            applyConnection({
              state: "connected", businesses: [],
              connection: { id: assets.connection.id, status: assets.connection.status,
                default_ad_account_id: assets.connection.ad_account_id },
              ad_accounts: assets.ad_accounts.map((item) => ({ ...item, currency: item.currency ?? undefined, timezone: item.timezone ?? undefined })),
              pages: assets.pages, instagram_accounts: assets.instagram_accounts, pixels: assets.pixels,
            });
            if (!cancelled) {
              setBackendReady(true);
              setAssetsIssues(assets.issues ?? {});
              setAssetsError([
                !assets.pages.length ? assets.issues?.pages : undefined,
                !assets.pixels.some((pixel) => !pixel.is_unavailable) ? assets.issues?.pixels : undefined,
              ].filter(Boolean).join(" "));
            }
          } catch (error) {
            if (!cancelled) {
              const message = error instanceof Error ? error.message : "Could not load Meta Pages and Pixels.";
              setAssetsError(message.includes("Unsupported legacy Meta action")
                ? "The Legacy Meta publishing update has not been deployed to this Supabase project yet. The connected account is still available, but ad creation cannot start until the server update is deployed."
                : message);
            }
          }
        } else {
          applyConnection(await metaAdsService.status());
          if (!cancelled) setBackendReady(true);
        }
      } catch (error) {
        if (!cancelled) setAssetsError(error instanceof Error ? error.message : "Meta connection could not be loaded");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isDemoMode, isLegacy, legacyStatus?.connection?.id, legacyStatus?.connected, assetReload]);
  useEffect(() => { void loadPresets(); }, [loadPresets]);
  useEffect(() => {
    if (!workspace?.id || !setup.accountId || !connection?.connection?.id) return;
    const connectionId = connection.connection.id;
    const load = async () => {
      const query = supabase.from("meta_bulk_jobs")
        .select("id,status,total_items,succeeded_items,failed_items,last_error")
        .eq("workspace_id", workspace.id).eq("ad_account_id", setup.accountId)
        .eq("job_type", "bulk_launch")
        .eq(isLegacy ? "legacy_connection_id" : "connection_id", connectionId)
        .order("created_at", { ascending: false }).limit(5);
      const { data } = await query;
      setJobs(data ?? []);
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [workspace?.id, setup.accountId, connection?.connection?.id, isLegacy]);

  const selectedCampaign = campaigns.find((item) => item.id === selection.id);
  const selectedAdset = campaigns.flatMap((item) => item.adsets).find((item) => item.id === selection.id);
  const selectedAd = campaigns.flatMap((item) => item.adsets.flatMap((adset) => adset.ads)).find((item) => item.id === selection.id);
  const counts = useMemo(() => ({
    campaigns: campaigns.length,
    adsets: campaigns.reduce((sum, campaign) => sum + campaign.adsets.length, 0),
    ads: campaigns.reduce((sum, campaign) => sum + campaign.adsets.reduce((inner, adset) => inner + adset.ads.length, 0), 0),
  }), [campaigns]);
  const account = connection?.ad_accounts.find((item) => item.id === setup.accountId);
  const availablePixels = useMemo(() => connection?.pixels.filter((item) => !item.is_unavailable && (!item.ad_account_id || item.ad_account_id === setup.accountId)) ?? [], [connection?.pixels, setup.accountId]);
  const budget = campaigns.reduce((sum, campaign) => sum + (campaign.budgetMode === "CBO" ? Number(campaign.dailyBudget || 0) : campaign.adsets.reduce((inner, adset) => inner + Number(adset.dailyBudget || 0), 0)), 0);
  const minimumScheduleMinutes = Math.max(30, Math.ceil(counts.ads / 10) + 15);

  const addCampaign = () => {
    const item = newCampaign(); setCampaigns((current) => [...current, item]); setSelection({ kind: "campaign", id: item.id });
  };
  const addAdset = (campaignId: string) => {
    const item = newAdset();
    setCampaigns((current) => current.map((campaign) => campaign.id === campaignId ? { ...campaign, adsets: [...campaign.adsets, item] } : campaign));
    setSelection({ kind: "adset", id: item.id });
  };
  const addAd = (adsetId: string) => {
    const item = newAd();
    setCampaigns((current) => current.map((campaign) => ({ ...campaign, adsets: campaign.adsets.map((adset) => adset.id === adsetId ? { ...adset, ads: [...adset.ads, item] } : adset) })));
    setSelection({ kind: "ad", id: item.id });
  };
  const updateCampaign = (id: string, patch: Partial<StudioCampaign>) => setCampaigns((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const updateAdset = (id: string, patch: Partial<StudioAdset>) => setCampaigns((current) => current.map((campaign) => ({ ...campaign, adsets: campaign.adsets.map((item) => item.id === id ? { ...item, ...patch } : item) })));
  const updateAd = (id: string, patch: Partial<StudioAd>) => setCampaigns((current) => current.map((campaign) => ({ ...campaign, adsets: campaign.adsets.map((adset) => ({ ...adset, ads: adset.ads.map((item) => item.id === id ? { ...item, ...patch } : item) })) })));
  const removeSelected = () => {
    if (!selection.id) return;
    if (selection.kind === "campaign") setCampaigns((current) => current.filter((item) => item.id !== selection.id));
    if (selection.kind === "adset") setCampaigns((current) => current.map((item) => ({ ...item, adsets: item.adsets.filter((adset) => adset.id !== selection.id) })));
    if (selection.kind === "ad") setCampaigns((current) => current.map((item) => ({ ...item, adsets: item.adsets.map((adset) => ({ ...adset, ads: adset.ads.filter((ad) => ad.id !== selection.id) })) })));
    setSelection({ kind: "setup" });
  };
  const duplicateSelected = () => {
    if (selectedCampaign) {
      const clone: StudioCampaign = { ...selectedCampaign, id: crypto.randomUUID(), name: `${selectedCampaign.name} copy`, adsets: selectedCampaign.adsets.map((adset) => ({ ...adset, id: crypto.randomUUID(), ads: adset.ads.map((ad) => ({ ...ad, id: crypto.randomUUID() })) })) };
      setCampaigns((current) => [...current, clone]); setSelection({ kind: "campaign", id: clone.id });
    } else if (selectedAdset) {
      const parent = campaigns.find((item) => item.adsets.some((adset) => adset.id === selectedAdset.id));
      if (!parent) return;
      const clone: StudioAdset = { ...selectedAdset, id: crypto.randomUUID(), name: `${selectedAdset.name} copy`, ads: selectedAdset.ads.map((ad) => ({ ...ad, id: crypto.randomUUID() })) };
      updateCampaign(parent.id, { adsets: [...parent.adsets, clone] }); setSelection({ kind: "adset", id: clone.id });
    } else if (selectedAd) {
      const parent = campaigns.flatMap((item) => item.adsets).find((adset) => adset.ads.some((ad) => ad.id === selectedAd.id));
      if (!parent) return;
      const clone = { ...selectedAd, id: crypto.randomUUID(), name: `${selectedAd.name} copy` };
      updateAdset(parent.id, { ads: [...parent.ads, clone] }); setSelection({ kind: "ad", id: clone.id });
    }
  };
  const beginDrag = (event: DragEvent, payload: DragPayload) => {
    setDrag(event, payload);
    setDragging(payload);
    setDropTarget(null);
  };
  const finishDrag = () => {
    setDragging(null);
    setDropTarget(null);
  };
  const allowDrop = (event: DragEvent, target: DropTarget, acceptedKind: DragPayload["kind"]) => {
    if (dragging?.kind !== acceptedKind) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = dragging.id && dragging.kind !== "creative" ? "move" : "copy";
    if (dropTarget?.kind !== target.kind || dropTarget.id !== target.id) setDropTarget(target);
  };
  const isTarget = (kind: DropTarget["kind"], id?: string) => dropTarget?.kind === kind && dropTarget.id === id;
  const dropOnCanvas = (event: DragEvent) => {
    event.preventDefault(); event.stopPropagation();
    const payload = readDrag(event) ?? dragging;
    if (payload?.kind === "campaign" && !payload.id) addCampaign();
    else if (payload?.kind === "campaign" && payload.id) {
      setCampaigns((current) => {
        const moving = current.find((item) => item.id === payload.id);
        if (!moving || current[current.length - 1]?.id === moving.id) return current;
        return [...current.filter((item) => item.id !== moving.id), moving];
      });
    }
    finishDrag();
  };
  const dropOnCampaign = (event: DragEvent, campaignId: string) => {
    event.preventDefault(); event.stopPropagation();
    const payload = readDrag(event) ?? dragging;
    if (payload?.kind === "adset" && !payload.id) addAdset(campaignId);
    else if (payload?.kind === "adset" && payload.id) {
      const moving = campaigns.flatMap((item) => item.adsets).find((item) => item.id === payload.id);
      if (!moving) return finishDrag();
      setCampaigns((current) => current.map((campaign) => ({ ...campaign, adsets: campaign.id === campaignId ? [...campaign.adsets.filter((item) => item.id !== moving.id), moving] : campaign.adsets.filter((item) => item.id !== moving.id) })));
    }
    finishDrag();
  };
  const dropOnAdset = (event: DragEvent, adsetId: string) => {
    event.preventDefault(); event.stopPropagation();
    const payload = readDrag(event) ?? dragging;
    if (payload?.kind === "ad" && !payload.id) addAd(adsetId);
    else if (payload?.kind === "ad" && payload.id) {
      const moving = campaigns.flatMap((item) => item.adsets.flatMap((adset) => adset.ads)).find((item) => item.id === payload.id);
      if (!moving) return finishDrag();
      setCampaigns((current) => current.map((campaign) => ({ ...campaign, adsets: campaign.adsets.map((adset) => ({ ...adset, ads: adset.id === adsetId ? [...adset.ads.filter((item) => item.id !== moving.id), moving] : adset.ads.filter((item) => item.id !== moving.id) })) })));
    }
    finishDrag();
  };
  const dropOnAd = (event: DragEvent, adId: string) => {
    event.preventDefault(); event.stopPropagation();
    const payload = readDrag(event) ?? dragging;
    if (payload?.kind !== "creative" || !media.some((item) => item.id === payload.id)) return finishDrag();
    const file = media.find((item) => item.id === payload.id)!;
    setAssignments((current) => ({ ...current, [adId]: file.id }));
    updateAd(adId, { creativeLabel: file.file.name });
    setSelection({ kind: "ad", id: adId });
    finishDrag();
  };
  const addMedia = (files: FileList | File[]) => {
    const next = Array.from(files);
    const unsupported = next.find((file) => !["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"].includes(file.type) || !file.size || file.size > (file.type.startsWith("video/") ? 1024 * 1024 * 1024 : 18 * 1024 * 1024));
    if (unsupported) { toast.error("Use JPG, PNG or WebP images up to 18 MB, or MP4/MOV videos up to 1 GB."); return; }
    setMedia((current) => [...current, ...next.map((file) => ({ id: crypto.randomUUID(), file }))]);
  };

  const errors = useMemo(() => {
    const found: string[] = [];
    if (isLegacy && !backendReady) found.push("Publishing is unavailable because the connected account's Pages and Pixels could not be loaded.");
    if (!setup.accountId) found.push("Select an ad account.");
    if (!setup.pageId) found.push("Select a Facebook Page.");
    if (!setup.pixelId) found.push("Select a Pixel/dataset.");
    if (isLegacy && setup.pageId && !/^\d{5,40}$/.test(setup.pageId)) found.push("Enter a numeric Facebook Page ID.");
    if (isLegacy && setup.pixelId && !/^\d{5,40}$/.test(setup.pixelId)) found.push("Enter a numeric Pixel ID.");
    if (setup.pixelId && (!isLegacy || availablePixels.length > 0) && !availablePixels.some((item) => item.id === setup.pixelId)) found.push("Select an available Pixel for this ad account.");
    if (!isWebUrl(setup.destinationUrl)) found.push("Enter a valid destination URL.");
    if (setup.launchMode === "SCHEDULED" && (!setup.launchAt || new Date(setup.launchAt).getTime() < Date.now() + minimumScheduleMinutes * 60_000)) found.push(`Schedule at least ${minimumScheduleMinutes} minutes ahead for this workflow.`);
    if (!campaigns.length) found.push("Drag a campaign onto the canvas.");
    for (const campaign of campaigns) {
      if (!nameSafe(campaign.name)) found.push("Every campaign needs a name.");
      if (!campaign.adsets.length) found.push(`${campaign.name} needs an ad set.`);
      if (campaign.budgetMode === "CBO" && Number(campaign.dailyBudget) < 1) found.push(`${campaign.name} needs a campaign budget.`);
      for (const adset of campaign.adsets) {
        if (!nameSafe(adset.name)) found.push("Every ad set needs a name.");
        if (campaign.budgetMode === "ABO" && Number(adset.dailyBudget) < 1) found.push(`${adset.name} needs a daily budget.`);
        if (!adset.countries.trim()) found.push(`${adset.name} needs at least one country.`);
        if (!adset.ads.length) found.push(`${adset.name} needs an ad.`);
        if (adset.countries.split(/[\s,]+/).filter(Boolean).some((country) => !/^[A-Za-z]{2}$/.test(country))) found.push(`${adset.name} needs two-letter country codes.`);
        for (const ad of adset.ads) {
          if (!nameSafe(ad.name)) found.push("Every ad needs a name.");
          if (!assignments[ad.id]) found.push(`${ad.name} needs a creative.`);
          if (!ad.primaryText.trim()) found.push(`${ad.name} needs primary text.`);
          if (!ad.headline.trim()) found.push(`${ad.name} needs a headline.`);
          if (ad.destinationUrl && !isWebUrl(ad.destinationUrl)) found.push(`${ad.name} has an invalid URL.`);
        }
      }
    }
    if (counts.ads > 1000) found.push("A launch is limited to 1,000 ads.");
    for (const campaign of campaigns) {
      const adsetNames = campaign.adsets.map((item) => item.name.trim().toLowerCase());
      if (new Set(adsetNames).size !== adsetNames.length) found.push(`${campaign.name} has duplicate ad set names.`);
      for (const adset of campaign.adsets) {
        const adNames = adset.ads.map((item) => item.name.trim().toLowerCase());
        if (new Set(adNames).size !== adNames.length) found.push(`${adset.name} has duplicate ad names.`);
      }
    }
    return found;
  }, [setup, campaigns, assignments, counts.ads, connection, availablePixels, minimumScheduleMinutes, isLegacy, backendReady]);

  const savePreset = async () => {
    if (!presetName.trim()) { toast.error("Name this preset first."); return; }
    setBusy(true);
    try {
      const configuration = { studio_version: 1, campaigns: campaigns.map((campaign) => ({ ...campaign, adsets: campaign.adsets.map((adset) => ({ ...adset, ads: adset.ads.map((ad) => ({ ...ad, creativeLabel: ad.creativeLabel === "Creative needed" ? "Creative needed" : "Replace creative" })) })) })), setup: { accountId: setup.accountId, pageId: setup.pageId, instagramId: setup.instagramId, pixelId: setup.pixelId, conversionEvent: setup.conversionEvent, destinationUrl: setup.destinationUrl, launchMode: "PAUSED" } };
      const result = await metaAdsService.manage("save_workflow", { entity_id: presetId || undefined, payload: { name: presetName.trim(), description: `${counts.campaigns} campaigns · ${counts.adsets} ad sets · ${counts.ads} ads`, configuration, is_template: true, visibility: sharing ? "workspace" : "private" } });
      if (result.item?.id) setPresetId(String(result.item.id));
      toast.success("Preset saved. Creative files stay on Meta and are not stored in EcomOS.");
      await loadPresets();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Preset could not be saved"); }
    finally { setBusy(false); }
  };
  const usePreset = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setCampaigns(preset.configuration.campaigns ?? []);
    setSetup((current) => ({ ...current, ...preset.configuration.setup,
      accountId: isLegacy ? connection?.connection?.default_ad_account_id || current.accountId : preset.configuration.setup?.accountId || current.accountId,
      launchMode: "PAUSED", launchAt: "" }));
    setAssignments({}); setMedia([]); setSelection({ kind: "setup" });
    setUploadedMedia({}); setPublished(false);
    setPresetId(preset.created_by === profile?.id ? id : "");
    setPresetName(preset.name); setSharing(preset.visibility === "workspace");
    setPublishKey(crypto.randomUUID());
    toast.success("Preset loaded. Add a creative to each ad before launch.");
  };

  const publish = async () => {
    if (errors.length || busy || published) return;
    setBusy(true);
    try {
      const activeAdIds = new Set(campaigns.flatMap((campaign) => campaign.adsets.flatMap((adset) => adset.ads.map((ad) => ad.id))));
      const selectedMedia = media.filter((item) => Object.entries(assignments).some(([adId, mediaId]) => activeAdIds.has(adId) && mediaId === item.id));
      const missing = selectedMedia.filter((item) => !uploadedMedia[item.id]);
      const mediaCache = { ...uploadedMedia };
      if (missing.length) {
        setProgress(`Uploading ${missing.length} creative${missing.length === 1 ? "" : "s"} to Meta…`);
        const newlyUploaded = await uploadMetaCreativeFiles(setup.accountId, missing.map((item) => item.file), (done, total) => setProgress(`Uploaded ${done} of ${total} creatives to Meta`), source);
        missing.forEach((item, index) => { mediaCache[item.id] = newlyUploaded[index]; });
        setUploadedMedia(mediaCache);
      }
      const uploaded = selectedMedia.map((item) => mediaCache[item.id]);
      for (let campaignIndex = 0; campaignIndex < campaigns.length; campaignIndex += 1) {
        const campaign = campaigns[campaignIndex];
        setProgress(`Publishing campaign ${campaignIndex + 1} of ${campaigns.length}: ${campaign.name}`);
        const campaignMediaIds = [...new Set(campaign.adsets.flatMap((adset) => adset.ads.map((ad) => assignments[ad.id])))];
        const mediaIndex = new Map(campaignMediaIds.map((id, index) => [id, index]));
        const campaignCreatives = campaignMediaIds.map((id) => uploaded[selectedMedia.findIndex((item) => item.id === id)]);
        const ads = campaign.adsets.flatMap((adset, adsetIndex) => adset.ads.map((ad) => ({
          name: nameSafe(ad.name), adset_index: adsetIndex,
          creative_index: mediaIndex.get(assignments[ad.id]) ?? -1,
          primary_text: ad.primaryText.trim(), headline: ad.headline.trim(),
          destination_url: ad.destinationUrl.trim() || setup.destinationUrl.trim(),
          call_to_action: ad.cta,
        })));
        const configuration = {
          budget_mode: campaign.budgetMode,
          campaign: { name: nameSafe(campaign.name), objective: "OUTCOME_SALES", ...(campaign.budgetMode === "CBO" ? { daily_budget: Number(campaign.dailyBudget) } : {}) },
          adsets: campaign.adsets.map((adset) => ({ name: nameSafe(adset.name), ...(campaign.budgetMode === "ABO" ? { daily_budget: Number(adset.dailyBudget) } : {}), targeting: { geo_locations: { countries: adset.countries.split(/[\s,]+/).map((country) => country.toUpperCase()).filter(Boolean) }, age_min: 18, age_max: 65 }, ...(setup.launchMode === "SCHEDULED" ? { start_time: new Date(setup.launchAt).toISOString() } : {}) })),
          ads, creatives: campaignCreatives, page_id: setup.pageId, instagram_account_id: setup.instagramId || undefined,
          pixel_id: setup.pixelId, conversion_event: setup.conversionEvent,
          destination_url: setup.destinationUrl.trim(),
          create_status: setup.launchMode === "PAUSED" ? "PAUSED" : "ACTIVE",
        };
        await metaAdsService.bulk({ action: "enqueue", source, job_type: "bulk_launch", defer_processing: true, idempotency_key: `studio:${publishKey}:${campaign.id}`, ad_account_id: setup.accountId, configuration, ...(presetId ? { workflow_id: presetId } : {}) });
      }
      setProgress("Campaigns queued for Meta. Watch the job progress below.");
      toast.success(`${campaigns.length} campaign job${campaigns.length === 1 ? "" : "s"} queued.`);
      setPublished(true);
      setReview(false);
    } catch (error) {
      setProgress("");
      toast.error(error instanceof Error ? error.message : "Launch failed");
    } finally { setBusy(false); }
  };
  const startNewLaunch = () => {
    setPublished(false); setPublishKey(crypto.randomUUID()); setUploadedMedia({});
    setMedia([]); setAssignments({}); setProgress("");
    setCampaigns((current) => current.map((campaign) => ({ ...campaign, adsets: campaign.adsets.map((adset) => ({ ...adset, ads: adset.ads.map((ad) => ({ ...ad, creativeLabel: "Creative needed" })) })) })));
    setSelection({ kind: "setup" });
  };
  const retryJob = async (jobId: string) => {
    try { await metaAdsService.bulk({ action: "retry_failed", source, job_id: jobId }); toast.success("Failed ads requeued."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Retry failed"); }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-ink-muted"><Loader2 className="animate-spin" size={24} /> <span className="ml-3">Loading Meta Launch Studio…</span></div>;
  if (isDemoMode || !connection || !["connected", "syncing", "sync_failed", "permission_required"].includes(connection.state)) return <div className={`${cardClass} p-8 text-center`}><h1 className="text-xl font-semibold text-ink">{isLegacy ? "Legacy Meta connection unavailable" : "Connect Meta to use Launch Studio"}</h1><p className="mt-2 text-sm text-ink-muted">{assetsError || "Your ad accounts, Pages and Pixels will appear in the workflow."}</p>{onExit ? <button type="button" onClick={onExit} className="mt-5 inline-flex rounded-xl bg-brand px-4 py-2 text-white">Back to Legacy Ads Manager</button> : <Link to={backPath} className="mt-5 inline-flex rounded-xl bg-brand px-4 py-2 text-white">Go to {isLegacy ? "Legacy Ads Manager" : "Meta Ads Manager"}</Link>}</div>;

  return <div className="-mx-2 -mt-2 min-h-[calc(100vh-110px)] space-y-4 overflow-x-clip pb-8 sm:-mx-4 xl:-mx-6">
    <div className="flex flex-wrap items-center gap-3 px-2 sm:px-4 xl:px-6">
      {onExit ? <button type="button" onClick={onExit} className="rounded-xl border border-base-border p-2 text-ink-muted" aria-label="Back to Legacy Ads Manager"><ArrowLeft size={17} /></button> : <Link to={backPath} className="rounded-xl border border-base-border p-2 text-ink-muted" aria-label="Back to Ads Manager"><ArrowLeft size={17} /></Link>}
      <div className="min-w-[210px] flex-1"><h1 className="text-xl font-bold text-ink">{isLegacy ? "Create Ads" : "Meta Launch Studio"}</h1><p className="text-xs text-ink-muted">Drag your campaign structure, add creatives, then publish to Meta.</p></div>
      <select className={`${fieldClass} max-w-56`} value={presetId} onChange={(event) => usePreset(event.target.value)} aria-label="Load a saved preset"><option value="">Open a saved preset</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>
      {published ? <button type="button" onClick={startNewLaunch} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> New launch from this structure</button> : <button type="button" onClick={() => setReview(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"><Rocket size={16} /> Review & Publish</button>}
    </div>
    {isLegacy && assetsError && <div role="alert" className="mx-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-ink sm:mx-4 xl:mx-6"><p className="font-semibold">Connected account: {connection.connection?.default_ad_account_id}</p><p className="mt-1">{backendReady ? "Meta assets need attention" : "Meta creation is not ready"}: {assetsError}</p><p className="mt-1 text-xs text-ink-muted">Your manual connection is preserved. Refresh after the publishing service or Meta asset permissions are updated.</p><button type="button" onClick={() => setAssetReload((current) => current + 1)} className="mt-3 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-ink">Refresh Meta assets</button></div>}
    <div className="mx-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-base-border bg-base-surface px-4 py-3 shadow-sm sm:mx-4 xl:mx-6">
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${errors.length ? "text-amber-500" : "text-emerald-500"}`}>{errors.length ? <CircleAlert size={15} /> : <Check size={15} />}{published ? "Launch submitted" : errors.length ? `${errors.length} things to finish` : "Ready to publish"}</span>
      <span className="text-xs text-ink-muted">{counts.campaigns} campaigns · {counts.adsets} ad sets · {counts.ads} ads · {account?.currency || "USD"} {budget.toLocaleString()}/day</span>
      {progress && <span className="min-w-0 flex-1 truncate text-xs font-medium text-brand">{progress}</span>}
      <span className="ml-auto hidden text-[11px] text-ink-faint sm:inline">Drag blocks only onto matching dotted areas</span>
    </div>
    <div className="grid min-h-[680px] gap-3 px-2 lg:grid-cols-[190px_minmax(0,1fr)_300px] sm:px-4 xl:px-6">
      <aside className={`${cardClass} h-fit p-3 lg:sticky lg:top-3`}>
        <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-widest text-ink-faint">Build with drag & drop</p>
        {([ ["campaign", "Campaign", "Start a new campaign"], ["adset", "Ad set", "Drop into a campaign"], ["ad", "Ad", "Drop into an ad set"] ] as const).map(([kind, label, hint]) => <button key={kind} type="button" draggable onDragStart={(event) => beginDrag(event, { kind })} onDragEnd={finishDrag} onClick={() => { if (kind === "campaign") addCampaign(); else if (kind === "adset" && selectedCampaign) addAdset(selectedCampaign.id); else if (kind === "ad" && selectedAdset) addAd(selectedAdset.id); else toast.error(`Select ${kind === "ad" ? "an ad set" : "a campaign"} first, or drag this into the matching dotted area.`); }} className="mb-2 flex w-full cursor-grab items-center gap-2 rounded-xl border border-base-border bg-base-raised/60 p-3 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-brand/50 hover:bg-brand/5 active:cursor-grabbing active:scale-[0.98]"><GripVertical size={15} className="shrink-0 text-ink-faint" /><span><span className="block text-sm font-semibold text-ink">{label}</span><span className="block text-[11px] text-ink-muted">{hint}</span></span></button>)}
        <label className="mt-3 flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-brand/50 p-4 text-center text-brand hover:bg-brand/5"><UploadCloud size={20} /><span className="text-xs font-semibold">Add creatives</span><span className="text-[10px] text-ink-muted">Files go directly to Meta at publish</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" className="sr-only" onChange={(event) => { if (event.target.files) addMedia(event.target.files); event.target.value = ""; }} /></label>
        {media.length > 0 && <div className="mt-3 space-y-1.5"><p className="px-1 text-[11px] font-bold uppercase text-ink-faint">Creative tray</p>{media.map((item) => <div key={item.id} draggable onDragStart={(event) => beginDrag(event, { kind: "creative", id: item.id })} onDragEnd={finishDrag} className="flex cursor-grab items-center gap-2 rounded-lg border border-base-border bg-base-raised p-2 text-xs text-ink transition hover:border-brand/40 active:cursor-grabbing" title="Drag onto an ad"><FileImage size={15} className="shrink-0 text-brand" /><span className="min-w-0 flex-1 truncate">{item.file.name}</span><GripVertical size={13} className="text-ink-faint" /></div>)}</div>}
      </aside>
      <main className={`${cardClass} min-h-[600px] overflow-hidden shadow-sm`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-border px-5 py-3"><div><p className="text-sm font-bold text-ink">Workflow canvas</p><p className="text-[11px] text-ink-muted">Campaign → Ad sets → Ads → Creatives</p></div><div className="flex items-center gap-2 text-[11px] text-ink-muted"><span>{counts.campaigns} campaigns</span><ChevronRight size={12} /><span>{counts.adsets} ad sets</span><ChevronRight size={12} /><span>{counts.ads} ads</span></div></div>
        <div className="min-h-[550px] space-y-5 bg-[radial-gradient(circle_at_1px_1px,rgba(140,140,140,0.12)_1px,transparent_0)] bg-[length:20px_20px] p-4 sm:p-6">
          <button type="button" onClick={() => setSelection({ kind: "setup" })} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${selection.kind === "setup" ? "border-brand bg-brand/5" : "border-base-border bg-base-surface"}`}><span className="rounded-xl bg-brand/10 p-2 text-brand"><Layers3 size={19} /></span><span className="flex-1"><span className="block text-sm font-bold text-ink">Meta setup</span><span className="text-xs text-ink-muted">{account?.name || "Choose account"} · {connection.pages.find((item) => item.id === setup.pageId)?.name || "Choose Page"} · {connection.pixels.find((item) => item.id === setup.pixelId)?.name || "Choose Pixel"}</span></span><ChevronRight size={16} className="text-ink-faint" /></button>
          <AnimatePresence>{campaigns.map((campaign) => <motion.section key={campaign.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .98 }} transition={{ duration: .18 }} className="relative pl-4 sm:pl-7">
            <div className="absolute bottom-0 left-1 top-0 w-px bg-brand/25 sm:left-3" />
            <button type="button" draggable onDragStart={(event) => beginDrag(event, { kind: "campaign", id: campaign.id })} onDragEnd={finishDrag} onClick={() => setSelection({ kind: "campaign", id: campaign.id })} className={`group flex w-full cursor-grab items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition duration-150 active:cursor-grabbing ${selection.id === campaign.id ? "border-brand bg-brand/5 ring-2 ring-brand/10" : "border-base-border bg-base-surface hover:-translate-y-px hover:border-brand/40 hover:shadow"}`}><GripVertical size={16} className="text-ink-faint transition group-hover:text-brand" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-ink">{campaign.name}</span><span className="text-xs text-ink-muted">Campaign · {campaign.budgetMode} · {campaign.adsets.length} ad sets</span></span><span className="rounded-full bg-brand/10 px-2 py-1 text-[10px] font-semibold text-brand">{campaign.budgetMode}</span></button>
            <div className="ml-3 mt-3 space-y-3 sm:ml-6"><AnimatePresence>{campaign.adsets.map((adset) => <motion.div key={adset.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="relative border-l border-base-border pl-4">
              <button type="button" draggable onDragStart={(event) => beginDrag(event, { kind: "adset", id: adset.id })} onDragEnd={finishDrag} onClick={() => setSelection({ kind: "adset", id: adset.id })} className={`group flex w-full cursor-grab items-center gap-2 rounded-xl border px-3 py-3 text-left shadow-sm transition duration-150 active:cursor-grabbing ${selection.id === adset.id ? "border-brand bg-brand/5 ring-2 ring-brand/10" : "border-base-border bg-base-surface hover:border-brand/40"}`}><GripVertical size={14} className="text-ink-faint transition group-hover:text-brand" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{adset.name}</span><span className="text-[11px] text-ink-muted">Ad set · {adset.countries || "No countries"} · {adset.ads.length} ads</span></span>{campaign.budgetMode === "ABO" && <span className="shrink-0 text-[11px] text-ink-muted">{account?.currency || "USD"} {adset.dailyBudget}/day</span>}</button>
              <div className="ml-3 mt-2 space-y-2 border-l border-base-border pl-3">{adset.ads.map((ad) => <button key={ad.id} type="button" draggable onDragStart={(event) => beginDrag(event, { kind: "ad", id: ad.id })} onDragEnd={finishDrag} onDragOver={(event) => allowDrop(event, { kind: "ad", id: ad.id }, "creative")} onDrop={(event) => dropOnAd(event, ad.id)} onClick={() => setSelection({ kind: "ad", id: ad.id })} className={`group flex w-full cursor-grab items-center gap-2 rounded-xl border px-3 py-2.5 text-left shadow-sm transition duration-150 active:cursor-grabbing ${isTarget("ad", ad.id) ? "scale-[1.01] border-brand bg-brand/10 ring-2 ring-brand/20" : selection.id === ad.id ? "border-brand bg-brand/5 ring-2 ring-brand/10" : "border-base-border bg-base-surface hover:border-brand/40"}`}><GripVertical size={13} className="text-ink-faint transition group-hover:text-brand" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-ink">{ad.name}</span><span className={`block truncate text-[11px] ${assignments[ad.id] ? "text-emerald-500" : isTarget("ad", ad.id) ? "font-semibold text-brand" : "text-ink-muted"}`}>{isTarget("ad", ad.id) ? "Release to attach creative" : assignments[ad.id] ? ad.creativeLabel : "Drop a creative here"}</span></span>{assignments[ad.id] ? <Check size={15} className="text-emerald-500" /> : <FileImage size={15} className={isTarget("ad", ad.id) ? "text-brand" : "text-ink-faint"} />}</button>)}
                {(adset.ads.length === 0 || dragging?.kind === "ad") && <div onDragOver={(event) => allowDrop(event, { kind: "adset", id: adset.id }, "ad")} onDrop={(event) => dropOnAdset(event, adset.id)} className={`flex min-h-10 items-center justify-center rounded-xl border border-dashed px-3 py-2 text-center text-[11px] font-medium transition ${isTarget("adset", adset.id) ? "border-brand bg-brand/10 text-brand ring-2 ring-brand/10" : "border-base-border bg-base-raised/40 text-ink-faint"}`}>{isTarget("adset", adset.id) ? "Release to place ad" : adset.ads.length ? "Drop ad here to move it to the end" : "Drop an Ad block here"}</div>}
              </div>
            </motion.div>)}</AnimatePresence>
              {(campaign.adsets.length === 0 || dragging?.kind === "adset") && <div onDragOver={(event) => allowDrop(event, { kind: "campaign", id: campaign.id }, "adset")} onDrop={(event) => dropOnCampaign(event, campaign.id)} className={`flex min-h-11 items-center justify-center rounded-xl border border-dashed p-3 text-center text-xs font-medium transition ${isTarget("campaign", campaign.id) ? "border-brand bg-brand/10 text-brand ring-2 ring-brand/10" : "border-base-border bg-base-raised/40 text-ink-faint"}`}>{isTarget("campaign", campaign.id) ? "Release to place ad set" : campaign.adsets.length ? "Drop ad set here to move it to the end" : "Drop an Ad set block here"}</div>}
            </div>
          </motion.section>)}</AnimatePresence>
          {(campaigns.length === 0 || dragging?.kind === "campaign") && <div onDragOver={(event) => allowDrop(event, { kind: "campaign-list" }, "campaign")} onDrop={dropOnCanvas} className={`flex min-h-20 items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center text-xs font-semibold transition ${isTarget("campaign-list") ? "border-brand bg-brand/10 text-brand ring-4 ring-brand/10" : "border-base-border bg-base-raised/30 text-ink-faint"}`}>{isTarget("campaign-list") ? "Release to add campaign" : campaigns.length ? "Drop campaign here to move it to the end" : "Drag Campaign from the left to begin"}</div>}
        </div>
      </main>
      <aside className={`${cardClass} h-fit p-4 shadow-sm lg:sticky lg:top-3`}>
        <div className="mb-4 flex items-center gap-2"><MousePointer2 size={16} className="text-brand" /><h2 className="text-sm font-bold text-ink">{selection.kind === "setup" ? "Meta setup" : selection.kind === "campaign" ? "Campaign settings" : selection.kind === "adset" ? "Ad set settings" : "Ad settings"}</h2>{isLegacy && selection.kind === "setup" && <button type="button" onClick={() => setAssetReload((current) => current + 1)} className="ml-auto text-[11px] font-semibold text-brand hover:underline">Refresh assets</button>}</div>
        {selection.kind === "setup" && <div className="space-y-3">
          <Select label="Ad account" value={setup.accountId} onChange={(value) => setSetup({ ...setup, accountId: value, pixelId: "" })} options={connection.ad_accounts.map((item) => ({ value: item.id, label: `${item.name || item.id} · ${item.currency || ""}` }))} />
          {isLegacy && backendReady && !connection.pages.length ? <><Input label="Page ID · manual token" value={setup.pageId} onChange={(value) => setSetup({ ...setup, pageId: value.trim(), instagramId: "" })} placeholder="Numeric Facebook Page ID" /><p className="text-[11px] text-ink-faint">{assetsIssues.pages ? "Meta could not list Pages for this token." : "Meta returned no Pages for this token."} Enter a Page ID it can access; EcomOS checks it on Meta before publishing.</p></> : <Select label="Facebook Page" value={setup.pageId} onChange={(value) => setSetup({ ...setup, pageId: value, instagramId: "" })} options={connection.pages.map((item) => ({ value: item.id, label: item.name || item.id }))} />}
          <Select label="Instagram account" value={setup.instagramId} onChange={(value) => setSetup({ ...setup, instagramId: value })} options={connection.instagram_accounts.map((item) => ({ value: item.id, label: `${item.username || item.name || item.id}${item.page_id && item.page_id !== setup.pageId ? ` · linked to ${connection.pages.find((page) => page.id === item.page_id)?.name || "another Page"}` : !item.page_id && isLegacy ? " · Page link not verified" : ""}`, disabled: Boolean(item.page_id && item.page_id !== setup.pageId) }))} optional />
          {isLegacy && backendReady && !connection.instagram_accounts.length && <p className="text-[11px] text-ink-faint">{assetsIssues.instagram || "No Instagram account was returned for this token. Connect one to a Facebook Page in Meta, grant the token access, then refresh assets."}</p>}
          {isLegacy && backendReady && !availablePixels.length ? <><Input label="Pixel ID · manual token" value={setup.pixelId} onChange={(value) => setSetup({ ...setup, pixelId: value.trim() })} placeholder="Numeric Pixel or dataset ID" /><p className="text-[11px] text-ink-faint">{assetsIssues.pixels ? "Meta could not list Pixels for this token." : "Meta returned no available Pixel for this ad account."} Enter a Pixel ID only if it is connected to this account; EcomOS verifies the link with Meta before publishing.</p></> : <Select label="Pixel / dataset" value={setup.pixelId} onChange={(value) => setSetup({ ...setup, pixelId: value })} options={availablePixels.map((item) => ({ value: item.id, label: item.name || item.id }))} />}
          <Select label="Conversion event" value={setup.conversionEvent} onChange={(value) => setSetup({ ...setup, conversionEvent: value })} options={[{ value: "PURCHASE", label: "Purchase" }, { value: "ADD_TO_CART", label: "Add to cart" }, { value: "LEAD", label: "Lead" }]} />
          <Input label="Destination URL" value={setup.destinationUrl} onChange={(value) => setSetup({ ...setup, destinationUrl: value })} placeholder="https://yourstore.com/product" />
          <Select label="Launch" value={setup.launchMode} onChange={(value) => setSetup({ ...setup, launchMode: value as StudioSetup["launchMode"] })} options={[{ value: "PAUSED", label: "Create paused" }, { value: "ACTIVE", label: "Activate immediately" }, { value: "SCHEDULED", label: "Schedule start" }]} />
          {setup.launchMode === "SCHEDULED" && <><Input label="Start time · your local time" type="datetime-local" value={setup.launchAt} onChange={(value) => setSetup({ ...setup, launchAt: value })} /><p className="text-[11px] text-ink-faint">Meta account timezone: {account?.timezone || "Unavailable"}. We send the exact instant in UTC.</p></>}
        </div>}
        {selectedCampaign && <div className="space-y-3"><Input label="Campaign name" value={selectedCampaign.name} onChange={(value) => updateCampaign(selectedCampaign.id, { name: value })} /><Select label="Budget mode" value={selectedCampaign.budgetMode} onChange={(value) => updateCampaign(selectedCampaign.id, { budgetMode: value as "CBO" | "ABO" })} options={[{ value: "ABO", label: "ABO · Budget per ad set" }, { value: "CBO", label: "CBO · Campaign budget" }]} />{selectedCampaign.budgetMode === "CBO" && <Input label={`Daily campaign budget · ${account?.currency || "USD"}`} type="number" value={String(selectedCampaign.dailyBudget)} onChange={(value) => updateCampaign(selectedCampaign.id, { dailyBudget: Number(value) })} />}</div>}
        {selectedAdset && <div className="space-y-3"><Input label="Ad set name" value={selectedAdset.name} onChange={(value) => updateAdset(selectedAdset.id, { name: value })} /><Input label="Target countries · codes separated by commas" value={selectedAdset.countries} onChange={(value) => updateAdset(selectedAdset.id, { countries: value })} placeholder="MA, FR" />{campaigns.find((item) => item.adsets.some((adset) => adset.id === selectedAdset.id))?.budgetMode === "ABO" && <Input label={`Daily ad set budget · ${account?.currency || "USD"}`} type="number" value={String(selectedAdset.dailyBudget)} onChange={(value) => updateAdset(selectedAdset.id, { dailyBudget: Number(value) })} />}</div>}
        {selectedAd && <div className="space-y-3"><Input label="Ad name" value={selectedAd.name} onChange={(value) => updateAd(selectedAd.id, { name: value })} /><label className="block text-xs font-semibold text-ink-muted">Primary text<textarea className={`${fieldClass} mt-1 min-h-24`} value={selectedAd.primaryText} onChange={(event) => updateAd(selectedAd.id, { primaryText: event.target.value })} /></label><Input label="Headline" value={selectedAd.headline} onChange={(value) => updateAd(selectedAd.id, { headline: value })} /><Input label="Destination override · optional" value={selectedAd.destinationUrl} onChange={(value) => updateAd(selectedAd.id, { destinationUrl: value })} placeholder={setup.destinationUrl || "Use workflow URL"} /><Select label="Call to action" value={selectedAd.cta} onChange={(value) => updateAd(selectedAd.id, { cta: value })} options={[{ value: "SHOP_NOW", label: "Shop now" }, { value: "LEARN_MORE", label: "Learn more" }, { value: "SIGN_UP", label: "Sign up" }]} /><Select label="Creative · drag onto ad or choose here" value={assignments[selectedAd.id] || ""} onChange={(value) => { setAssignments((current) => ({ ...current, [selectedAd.id]: value })); updateAd(selectedAd.id, { creativeLabel: media.find((item) => item.id === value)?.file.name || "Creative needed" }); }} options={media.map((item) => ({ value: item.id, label: item.file.name }))} /></div>}
        {selection.kind !== "setup" && <div className="mt-4 flex gap-2 border-t border-base-border pt-4"><button type="button" onClick={duplicateSelected} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-base-border px-2 py-2 text-xs text-ink"><Copy size={13} /> Duplicate</button><button type="button" onClick={removeSelected} className="inline-flex items-center gap-1 rounded-xl border border-danger/30 px-2 py-2 text-xs text-danger"><Trash2 size={13} /> Remove</button></div>}
        <div className="mt-6 space-y-2 border-t border-base-border pt-4"><div className="flex items-center justify-between"><p className="text-xs font-bold text-ink">Save as preset</p>{presetId && <button type="button" onClick={() => { setPresetId(""); setPresetName(""); setSharing(false); }} className="text-[11px] font-semibold text-brand">Save as new</button>}</div><Input label="Preset name" value={presetName} onChange={(value) => setPresetName(value)} placeholder="My winning structure" /><label className="flex items-center gap-2 text-xs text-ink-muted"><input type="checkbox" checked={sharing} onChange={(event) => setSharing(event.target.checked)} /> Share with workspace</label><button type="button" onClick={() => void savePreset()} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 px-3 py-2 text-xs font-semibold text-brand disabled:opacity-50"><Save size={14} /> Save preset</button><p className="text-[11px] text-ink-faint">Presets keep the structure and settings. Add fresh creatives for the next launch.</p></div>
      </aside>
    </div>
    {review && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-label="Review campaign launch"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-base-surface p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-ink">Review launch</h2><p className="mt-1 text-xs text-ink-muted">Confirm your hierarchy, spend and timing before sending anything to Meta.</p></div><button type="button" onClick={() => setReview(false)} aria-label="Close review" className="p-1 text-ink-muted"><X size={18} /></button></div><div className="mt-4 grid grid-cols-3 gap-2 text-center">{[["Campaigns", counts.campaigns], ["Ad sets", counts.adsets], ["Ads", counts.ads]].map(([label, value]) => <div key={label} className="rounded-xl bg-base-raised p-3"><p className="text-lg font-bold text-ink">{value}</p><p className="text-[11px] text-ink-muted">{label}</p></div>)}</div><p className="mt-4 text-sm font-semibold text-ink">Daily budget: {account?.currency || "USD"} {budget.toLocaleString()}</p><p className="mt-1 text-xs text-ink-muted">{setup.launchMode === "SCHEDULED" ? `Starts ${setup.launchAt ? new Date(setup.launchAt).toLocaleString() : "after a start time is chosen"} (your local time) · ${accountTime(setup.launchAt, account?.timezone)}.` : setup.launchMode === "ACTIVE" ? "Ads activate when Meta accepts and reviews them." : "Objects are created paused and will not spend until activated."}</p><div className="mt-4 max-h-40 space-y-1 overflow-y-auto">{campaigns.flatMap((campaign) => campaign.adsets.flatMap((adset) => adset.ads.map((ad) => <p key={ad.id} className="text-xs text-ink-muted"><span className="font-semibold text-ink">{campaign.name}</span> → {adset.name} → {ad.name} → {media.find((item) => item.id === assignments[ad.id])?.file.name || "No creative"}</p>)))}</div>{errors.length > 0 && <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3" role="alert"><p className="text-xs font-bold text-amber-500">Finish these before publishing</p>{errors.map((error, index) => <p key={`${error}-${index}`} className="mt-1 text-xs text-ink">• {error}</p>)}</div>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setReview(false)} className="rounded-xl border border-base-border px-4 py-2 text-sm text-ink">Keep editing</button><button type="button" onClick={() => void publish()} disabled={errors.length > 0 || busy} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />} {busy ? "Publishing…" : "Confirm & Publish"}</button></div></div></div>}
    {jobs.length > 0 && <div className={`${cardClass} mx-2 p-4 sm:mx-4 xl:mx-6`}><h2 className="text-sm font-bold text-ink">Recent launch progress</h2><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{jobs.map((job) => <div key={job.id} className="rounded-xl border border-base-border p-3 text-xs"><span className="font-semibold capitalize text-ink">{job.status.replace(/_/g, " ")}</span><span className="ml-2 text-ink-muted">{job.succeeded_items}/{job.total_items} ads</span>{job.last_error && <p className="mt-1 text-danger">{job.last_error}</p>}{job.failed_items > 0 && ["failed", "partial_failure"].includes(job.status) && <button type="button" onClick={() => void retryJob(job.id)} className="mt-2 rounded-lg border border-base-border px-2 py-1 text-brand">Retry failed ads</button>}</div>)}</div></div>}
  </div>;
}

function Input({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="block text-xs font-semibold text-ink-muted">{label}<input className={`${fieldClass} mt-1`} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} min={type === "number" ? 0 : undefined} /></label>;
}
function Select({ label, value, onChange, options, optional = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string; disabled?: boolean }>; optional?: boolean }) {
  return <label className="block text-xs font-semibold text-ink-muted">{label}<select className={`${fieldClass} mt-1`} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{optional ? "None" : "Select…"}</option>{options.map((item) => <option key={item.value} value={item.value} disabled={item.disabled}>{item.label}</option>)}</select></label>;
}
