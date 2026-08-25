import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";

export default function DashboardRevenueChart({ metrics, chartColors }: { metrics: any; chartColors: any }) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.revenueVsAdSpend ?? []}>
                <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartColors.accent} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={chartColors.accent} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="adSpendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid stroke={chartColors.grid} strokeDasharray="4 4" vertical={false} opacity={0.5} />
                <XAxis
                    dataKey="date"
                    tick={{ fill: chartColors.muted, fontSize: 11, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                />
                <YAxis
                    yAxisId="money"
                    tick={{ fill: chartColors.muted, fontSize: 11, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                    tickFormatter={(v) => (typeof v === "number" ? `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : String(v))}
                />
                <YAxis
                    yAxisId="count"
                    orientation="right"
                    tick={{ fill: chartColors.muted, fontSize: 11, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                />
                <Tooltip
                    contentStyle={{
                        background: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        borderRadius: 12,
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
                        fontSize: 13,
                        fontWeight: 500,
                        padding: "10px 14px",
                    }}
                    labelStyle={{ color: chartColors.muted, marginBottom: 4 }}
                    itemStyle={{ color: chartColors.accent, paddingTop: 2, paddingBottom: 2 }}
                    cursor={{ stroke: chartColors.grid, strokeWidth: 1, strokeDasharray: "3 3" }}
                    formatter={(value: any, name: any) => {
                        if (name === "Ad Spend") return [`$${Number(value).toFixed(2)}`, "Ad Spend"];
                        if (name === "Revenue") return [`MAD ${Number(value).toLocaleString()}`, "Revenue"];
                        return [value, name];
                    }}
                />
                <Area
                    type="natural"
                    dataKey="revenue"
                    stroke={chartColors.accent}
                    strokeWidth={3}
                    fill="url(#revenueFill)"
                    yAxisId="money"
                    activeDot={{ r: 6, strokeWidth: 0, fill: chartColors.accent }}
                />
                <Area
                    type="natural"
                    dataKey="adSpend"
                    stroke="#ef4444"
                    strokeWidth={3}
                    fill="url(#adSpendFill)"
                    yAxisId="count"
                />
                <Area
                    type="monotone"
                    dataKey="orders"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fillOpacity={0}
                    yAxisId="count"
                />
                <Area
                    type="monotone"
                    dataKey="confirmed"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fillOpacity={0}
                    yAxisId="count"
                />
                <Area
                    type="monotone"
                    dataKey="delivered"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={0}
                    yAxisId="count"
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
