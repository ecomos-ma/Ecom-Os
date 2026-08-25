import { useState, useMemo } from "react";
import { Calculator, ChevronDown, ChevronUp } from "lucide-react";

// ─── Calculation Logic ────────────────────────────────────────────────────────

function calcCOD(i: any) {
    const confRate = i.confirmationRate / 100;
    const delRate = i.deliveryRate / 100;
    const effectiveDeliveryRate = confRate * delRate;

    // Per 100 orders sent
    const confirmed = 100 * confRate;
    const delivered = 100 * effectiveDeliveryRate;

    const revenue = delivered * i.sellingPrice;
    const adCost = 100 * i.adCostPerOrder;
    const productCostTotal = delivered * i.productCost;
    const deliveryCostTotal = delivered * i.deliveryFee;
    const confirmationCostTotal = delivered * i.confirmationFee;
    const fulfillmentCostTotal = 100 * i.fulfillmentFee;
    const returnCost = (100 - delivered) * i.returnShippingCost;
    const otherCost = 100 * i.otherCostPerOrder;

    const totalCosts =
        adCost +
        productCostTotal +
        deliveryCostTotal +
        confirmationCostTotal +
        fulfillmentCostTotal +
        returnCost +
        otherCost;
    const netProfit = revenue - totalCosts;

    const grossMargin = i.sellingPrice - i.productCost;
    const fixedCodCosts = i.deliveryFee + i.confirmationFee + i.fulfillmentFee;
    const netProfitPerOrder = delivered > 0 ? netProfit / delivered : 0;
    const roi = totalCosts > 0 ? (netProfit / totalCosts) * 100 : 0;
    const costPerDelivered = delivered > 0 ? adCost / delivered : 0;
    const costPerConfirmed = confirmed > 0 ? adCost / confirmed : 0;
    const costPerLead = i.adCostPerOrder;
    const roas = adCost > 0 ? revenue / adCost : 0;

    // Break-even calculations
    const nonProductCostsPerDelivered = adCost + 100 * i.fulfillmentFee + returnCost + otherCost;
    const minSellingPrice = delivered > 0 ? i.productCost + i.deliveryFee + i.confirmationFee + nonProductCostsPerDelivered / delivered : 0;

    const constFixed = adCost + 100 * i.fulfillmentFee + 100 * i.returnShippingCost + otherCost;
    const marginDelivered = i.sellingPrice - i.productCost - i.deliveryFee - i.confirmationFee + i.returnShippingCost;
    const minDelivered = marginDelivered > 0 ? constFixed / marginDelivered : 0;

    const minConfirmationRate = (() => {
        for (let cr = 0; cr <= 100; cr++) {
            const tempDeliv = 100 * (cr / 100) * delRate;
            const rev = tempDeliv * i.sellingPrice;
            const cost2 =
                adCost +
                tempDeliv * i.productCost +
                tempDeliv * i.deliveryFee +
                tempDeliv * i.confirmationFee +
                100 * i.fulfillmentFee +
                (100 - tempDeliv) * i.returnShippingCost +
                otherCost;
            if (rev >= cost2) return cr;
        }
        return 100;
    })();

    const minDeliveryRate = (() => {
        for (let dr = 0; dr <= 100; dr++) {
            const tempDeliv = confirmed * (dr / 100);
            const rev = tempDeliv * i.sellingPrice;
            const cost2 =
                adCost +
                tempDeliv * i.productCost +
                tempDeliv * i.deliveryFee +
                tempDeliv * i.confirmationFee +
                100 * i.fulfillmentFee +
                (100 - tempDeliv) * i.returnShippingCost +
                otherCost;
            if (rev >= cost2) return dr;
        }
        return 100;
    })();

    return {
        effectiveDeliveryRate: effectiveDeliveryRate * 100,
        ordersDelivered: delivered,
        revenue,
        totalCosts,
        netProfit,
        grossMargin,
        fixedCodCosts,
        netProfitPerOrder,
        roi,
        costPerDelivered,
        costPerConfirmed,
        costPerLead,
        roas,
        minSellingPrice,
        minDelivered,
        minConfirmationRate,
        minDeliveryRate,
    };
}

const SCENARIOS = [
    { conf: 40, deliv: 60 },
    { conf: 50, deliv: 65 },
    { conf: 60, deliv: 70 },
    { conf: 65, deliv: 75 },
    { conf: 70, deliv: 80 },
    { conf: 75, deliv: 85 },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CalcField({ label, value, onChange, max }: any) {
    return (
        <div className="mb-2.5">
            <label className="mb-1 block text-[11.5px] text-ink-muted">{label}</label>
            <input
                type="number"
                value={value}
                onChange={onChange}
                min={0}
                max={max}
                className="w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 font-mono text-[13px] text-ink focus:border-brand/50 focus:outline-none"
            />
        </div>
    );
}

function ResultBox({ label, value, color = "text-ink" }: any) {
    return (
        <div className="rounded-lg border border-base-border bg-base-raised p-3">
            <div className={`font-mono text-[17px] font-bold leading-none ${color}`}>
                {value}
            </div>
            <div className="mt-1 text-[11.5px] text-ink-muted">{label}</div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
import { PageHeader } from "../components/PageHeader";

export default function CODCalculator() {
    const [inputs, setInputs] = useState({
        sellingPrice: 199,
        productCost: 45,
        adCostPerOrder: 20,
        deliveryFee: 35,
        confirmationFee: 11,
        fulfillmentFee: 2,
        returnShippingCost: 0,
        otherCostPerOrder: 0,
        confirmationRate: 65,
        deliveryRate: 75,
    });

    const result = useMemo(() => calcCOD(inputs), [inputs]);

    const set = (key: string) => (e: any) =>
        setInputs((prev) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }));

    const profitColor =
        result.netProfit >= 0 ? "text-emerald-400" : "text-danger";
    const profitBg =
        result.netProfit >= 0
            ? "border-emerald-500/40 bg-emerald-900/20"
            : "border-danger/40 bg-danger/10";

    return (
        <div>
            <PageHeader
                title="COD Scenarios"
                subtitle="Morocco market · Simulate your COD operation margins & break-even points"
                action={
                    <div className={`px-4 py-2 flex items-center justify-center rounded-lg border ${profitBg}`}>
                        <span className={`font-mono text-[14px] font-bold ${profitColor}`}>
                            {result.netProfit >= 0 ? "+" : ""}
                            {Math.round(result.netProfit)} DH / 100 orders
                        </span>
                    </div>
                }
            />

            <div className="space-y-6 pb-12">
                {/* COD Costs Banner */}
                <div className="flex items-center gap-2 rounded-lg bg-base-raised px-4 py-3 text-[13px] text-ink-muted">
                    <span className="font-medium text-ink">COD costs (Maroc):</span>
                    <span>{inputs.deliveryFee} DH livraison</span>·
                    <span>{inputs.confirmationFee} DH confirmation</span>·
                    <span>{inputs.fulfillmentFee} DH fulfillment</span>
                </div>

                {/* Input Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Product Info */}
                    <div className="rounded-xl border border-base-border bg-base-surface p-4 shadow-card">
                        <div className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
                            🛒 Product Info
                        </div>
                        <CalcField label="Selling price (DH)" value={inputs.sellingPrice} onChange={set("sellingPrice")} />
                        <CalcField label="Product cost (DH)" value={inputs.productCost} onChange={set("productCost")} />
                        <CalcField label="Ads cost per order (DH)" value={inputs.adCostPerOrder} onChange={set("adCostPerOrder")} />
                    </div>

                    {/* COD Fixed Costs */}
                    <div className="rounded-xl border border-base-border bg-base-surface p-4 shadow-card">
                        <div className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
                            📦 COD Fixed Costs
                        </div>
                        <CalcField label="Delivery (DH)" value={inputs.deliveryFee} onChange={set("deliveryFee")} />
                        <CalcField label="Confirmation (DH)" value={inputs.confirmationFee} onChange={set("confirmationFee")} />
                        <CalcField label="Fulfillment (DH)" value={inputs.fulfillmentFee} onChange={set("fulfillmentFee")} />
                    </div>

                    {/* Delivery Rates */}
                    <div className="rounded-xl border border-base-border bg-base-surface p-4 shadow-card">
                        <div className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
                            📊 Delivery Rates
                        </div>
                        <CalcField label="Confirmation rate (%)" value={inputs.confirmationRate} onChange={set("confirmationRate")} max={100} />
                        <CalcField label="Delivery rate (% of conf)" value={inputs.deliveryRate} onChange={set("deliveryRate")} max={100} />
                        <div className="mt-4 rounded-lg border border-base-border bg-base-raised px-3 py-2.5">
                            <div className="text-[11.5px] text-ink-muted">Effective delivery</div>
                            <div className="mt-0.5 font-mono text-[16px] font-semibold text-brand">
                                {result.effectiveDeliveryRate.toFixed(2)}%
                            </div>
                        </div>
                    </div>

                    {/* Return / Refus */}
                    <div className="rounded-xl border border-base-border bg-base-surface p-4 shadow-card">
                        <div className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
                            ↩️ Return / Refus
                        </div>
                        <CalcField label="Return shipping cost (DH)" value={inputs.returnShippingCost} onChange={set("returnShippingCost")} />
                        <CalcField label="Other costs per order (DH)" value={inputs.otherCostPerOrder} onChange={set("otherCostPerOrder")} />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    {/* Per 100 Orders Summary */}
                    <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
                        <div className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
                            🔥 Per 100 Orders Sent
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <ResultBox label="Orders delivered" value={result.ordersDelivered.toFixed(1)} color="text-amber-400" />
                            <ResultBox label="Revenue (DH)" value={`${Math.round(result.revenue)} DH`} color="text-sky-400" />
                            <ResultBox label="Total costs (DH)" value={`${Math.round(result.totalCosts)} DH`} color="text-danger" />
                            <div className={`rounded-xl border p-3 ${profitBg}`}>
                                <div className={`font-mono text-[17px] font-bold leading-none ${profitColor}`}>
                                    {result.netProfit >= 0 ? "+" : ""}
                                    {Math.round(result.netProfit)} DH
                                </div>
                                <div className="mt-1 text-[11.5px] text-ink-muted">Net profit/loss</div>
                            </div>
                        </div>
                    </div>

                    {/* Per Single Delivered Order */}
                    <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
                        <div className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
                            📦 Per Single Delivered Order
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <ResultBox label="Gross margin (DH)" value={`${Math.round(result.grossMargin)} DH`} color="text-amber-400" />
                            <ResultBox label="Fixed COD costs (DH)" value={`${Math.round(result.fixedCodCosts)} DH`} color="text-sky-400" />
                            <div className={`rounded-xl border p-3 ${result.netProfitPerOrder >= 0 ? "border-emerald-500/40 bg-emerald-900/20" : "border-danger/40 bg-danger/10"}`}>
                                <div className={`font-mono text-[17px] font-bold ${result.netProfitPerOrder >= 0 ? "text-emerald-400" : "text-danger"}`}>
                                    {result.netProfitPerOrder >= 0 ? "+" : ""}
                                    {result.netProfitPerOrder.toFixed(1)} DH
                                </div>
                                <div className="mt-1 text-[11.5px] text-ink-muted">Net profit per order</div>
                            </div>
                            <ResultBox label="ROI %" value={`${result.roi >= 0 ? "+" : ""}${result.roi.toFixed(1)}%`} color={result.roi >= 0 ? "text-emerald-400" : "text-danger"} />
                        </div>
                    </div>

                    {/* Media Buying Metrics */}
                    <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
                        <div className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
                            📱 Media Buying Metrics
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <ResultBox label="Cost per Delivered (DH)" value={`${result.costPerDelivered.toFixed(2)} DH`} color="text-amber-400" />
                            <ResultBox label="Cost per Confirmed (DH)" value={`${result.costPerConfirmed.toFixed(2)} DH`} color="text-sky-400" />
                            <ResultBox label="Cost per Lead (DH)" value={`${result.costPerLead.toFixed(2)} DH`} color="text-purple-400" />
                            <ResultBox label="ROAS" value={`${result.roas.toFixed(2)}x`} color="text-emerald-400" />
                        </div>
                    </div>

                    {/* Break-even Analysis */}
                    <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
                        <div className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
                            ⚖️ Break-even Analysis
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <ResultBox label="Min selling price (DH)" value={`${Math.round(result.minSellingPrice)} DH`} color="text-amber-400" />
                            <ResultBox label="Min delivered (per 100)" value={`${Math.round(result.minDelivered)}`} color="text-sky-400" />
                            <ResultBox label="Min confirmation rate" value={`${result.minConfirmationRate}%`} color="text-purple-400" />
                            <ResultBox label="Min delivery rate" value={`${result.minDeliveryRate}%`} color="text-pink-400" />
                        </div>
                    </div>
                </div>

                {/* Scenario Simulator */}
                <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card mt-6">
                    <div className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
                        🎮 Scenario Simulator (per 100 orders)
                    </div>
                    <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
                        {SCENARIOS.map((s) => {
                            const r = calcCOD({
                                ...inputs,
                                confirmationRate: s.conf,
                                deliveryRate: s.deliv,
                            });
                            const isActive =
                                inputs.confirmationRate === s.conf &&
                                inputs.deliveryRate === s.deliv;
                            return (
                                <button
                                    key={`${s.conf}-${s.deliv}`}
                                    onClick={() =>
                                        setInputs((p) => ({
                                            ...p,
                                            confirmationRate: s.conf,
                                            deliveryRate: s.deliv,
                                        }))
                                    }
                                    className={`rounded-xl border p-3 text-left transition-colors hover:border-brand/50 ${isActive
                                        ? "border-brand bg-brand/10"
                                        : "border-base-border bg-base-raised"
                                        }`}
                                >
                                    <div className="text-[11px] text-ink-muted mb-1.5 flex items-center justify-between">
                                        <span>Conf {s.conf}%</span>
                                        <span>Del {s.deliv}%</span>
                                    </div>
                                    <div
                                        className={`font-mono text-[15px] font-bold ${r.netProfit >= 0 ? "text-emerald-400" : "text-danger"
                                            }`}
                                    >
                                        {r.netProfit >= 0 ? "+" : ""}
                                        {Math.round(r.netProfit)} DH
                                    </div>
                                    <div className="text-[10px] text-ink-muted mt-1">
                                        {r.ordersDelivered.toFixed(0)} orders delivered
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
