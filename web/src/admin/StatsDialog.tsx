// 单条短链的访问统计：每日柱状图（Kumo TimeseriesChart）+ 各维度排行（Kumo Meter）。
import { useEffect, useState } from "react";
import { Banner, Button, ChartPalette, Dialog, Empty, Grid, Loader, Meter, Tabs, Text, TimeseriesChart } from "@cloudflare/kumo";
import { ChartBarIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { AriaComponent, GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { LinkStats, StatsDimension, StatsRow } from "../../../src/shared/types.ts";
import { api } from "../api.ts";
import { countryName, deviceName } from "./format.ts";

echarts.use([BarChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);

const useDarkMode = () => {
  const [dark, setDark] = useState(() => document.documentElement.dataset.mode === "dark");
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.dataset.mode === "dark"));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
    return () => obs.disconnect();
  }, []);
  return dark;
};

const DIMENSIONS: { key: StatsDimension; title: string; label?: (n: string) => string }[] = [
  { key: "countries", title: "国家或地区", label: countryName },
  { key: "referers", title: "来源" },
  { key: "devices", title: "设备", label: deviceName },
  { key: "browsers", title: "浏览器" },
  { key: "os", title: "系统" },
];

function TopList({ title, rows, total, label }: { title: string; rows: StatsRow[]; total: number; label?: (n: string) => string }) {
  return (
    <div className="grid content-start gap-3">
      <Text variant="heading" as="h3">{title}</Text>
      {rows.length === 0 ? (
        <Text variant="secondary">暂无数据</Text>
      ) : (
        rows.slice(0, 5).map((r) => (
          <Meter key={r.name} label={label ? label(r.name) : r.name} value={r.clicks} max={Math.max(total, 1)} customValue={r.clicks.toLocaleString("zh-CN")} />
        ))
      )}
    </div>
  );
}

export function StatsDialog({ code, open, onOpenChange }: { code: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [days, setDays] = useState("7");
  const [stats, setStats] = useState<LinkStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dark = useDarkMode();

  useEffect(() => {
    if (!open || !code) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .stats(code, Number(days))
      .then((s) => !cancelled && setStats(s))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, code, days]);

  const series = stats
    ? [{ name: "访问", color: ChartPalette.categorical(0, dark), data: stats.daily.map((d) => [Date.parse(d.day + "T00:00:00Z"), d.clicks] as [number, number]) }]
    : [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="xl" className="px-6 py-5">
        <div className="grid gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <Dialog.Title className="text-lg font-semibold">/{code} 访问统计</Dialog.Title>
              <Dialog.Description className="text-base text-kumo-subtle">爬虫不计入，日期按 UTC，数据保留约 90 天。</Dialog.Description>
            </div>
            <Dialog.Close aria-label="关闭" render={(p) => <Button {...p} variant="ghost" shape="square" icon={<XIcon />} aria-label="关闭" />} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Tabs
              variant="segmented"
              value={days}
              onValueChange={setDays}
              tabs={[
                { value: "7", label: "近 7 天" },
                { value: "30", label: "近 30 天" },
                { value: "90", label: "近 90 天" },
              ]}
            />
            <div className="flex items-center gap-2">
              {loading && <Loader />}
              <Text variant="secondary">
                共 <span className="text-lg font-semibold text-kumo-default">{(stats?.total ?? 0).toLocaleString("zh-CN")}</span> 次访问
              </Text>
            </div>
          </div>

          {error ? (
            <Banner variant="error" icon={<WarningCircleIcon weight="fill" />} title="统计加载失败" description={error} />
          ) : stats && stats.total === 0 && !loading ? (
            <Empty size="sm" icon={<span className="text-kumo-inactive"><ChartBarIcon size={32} /></span>} title="还没有访问" description="有人点开这个短链后，数据会出现在这里。" />
          ) : (
            <div className="grid gap-6">
              <TimeseriesChart
                echarts={echarts}
                type="bar"
                data={series}
                height={220}
                isDarkMode={dark}
                loading={loading && !stats}
                yAxisMinInterval={1}
                xAxisName="日期（UTC）"
                tooltipValueFormat={(v) => `${v} 次`}
                ariaDescription="每日访问次数柱状图"
              />
              <Grid variant="2up" gap="lg">
                {DIMENSIONS.map((d) => (
                  <TopList key={d.key} title={d.title} rows={stats?.top[d.key] ?? []} total={stats?.total ?? 0} label={d.label} />
                ))}
              </Grid>
            </div>
          )}
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
