// 新建 / 编辑短链：一个 Dialog，四个分区用 Tabs 切换。
import { useEffect, useState } from "react";
import { Banner, Button, Dialog, Grid, Input, InputArea, SensitiveInput, Switch, Tabs, Text } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import type { DeviceRules, LinkInput, LinkView } from "../../../src/shared/types.ts";
import { api } from "../api.ts";
import { hostOf, toLocalInput } from "./format.ts";

type Tab = "basic" | "control" | "routing" | "preview";
interface CountryRow { id: number; code: string; url: string }

interface FormState {
  url: string;
  code: string;
  note: string;
  expiresAt: string;
  password: string;
  clearPassword: boolean;
  unsafe: boolean;
  devices: Required<DeviceRules>;
  countries: CountryRow[];
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
}

let rowId = 0;
const empty = (): FormState => ({
  url: "", code: "", note: "", expiresAt: "", password: "", clearPassword: false, unsafe: false,
  devices: { ios: "", android: "", mobile: "", desktop: "" }, countries: [], ogTitle: "", ogDescription: "", ogImage: "",
});

const fromLink = (l: LinkView): FormState => ({
  url: l.url,
  code: l.code,
  note: l.note ?? "",
  expiresAt: toLocalInput(l.expiresAt),
  password: "",
  clearPassword: false,
  unsafe: Boolean(l.unsafe),
  devices: { ios: l.devices?.ios ?? "", android: l.devices?.android ?? "", mobile: l.devices?.mobile ?? "", desktop: l.devices?.desktop ?? "" },
  countries: Object.entries(l.countries ?? {}).map(([code, url]) => ({ id: ++rowId, code, url })),
  ogTitle: l.og?.title ?? "",
  ogDescription: l.og?.description ?? "",
  ogImage: l.og?.image ?? "",
});

function toInput(f: FormState, editing: LinkView | null): LinkInput {
  const input: LinkInput = {
    url: f.url.trim(),
    note: f.note.trim() || null,
    expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null,
    unsafe: f.unsafe,
    devices: f.devices,
    countries: Object.fromEntries(f.countries.filter((r) => r.code.trim() || r.url.trim()).map((r) => [r.code.trim(), r.url.trim()])),
    og: { title: f.ogTitle, description: f.ogDescription, image: f.ogImage },
  };
  if (f.password) input.password = f.password;
  else if (!editing || f.clearPassword) input.password = null;
  if (!editing && f.code.trim()) input.code = f.code.trim();
  return input;
}

export function LinkDialog(props: {
  open: boolean;
  editing: LinkView | null;
  origin: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (link: LinkView, created: boolean) => void;
}) {
  const { open, editing, origin, onOpenChange, onSaved } = props;
  const [f, setF] = useState<FormState>(empty);
  const [tab, setTab] = useState<Tab>("basic");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 每次打开时重置表单
  useEffect(() => {
    if (!open) return;
    setF(editing ? fromLink(editing) : empty());
    setTab("basic");
    setError(null);
  }, [open, editing]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const setDevice = (k: keyof DeviceRules, v: string) => setF((s) => ({ ...s, devices: { ...s.devices, [k]: v } }));
  const setCountry = (id: number, patch: Partial<CountryRow>) =>
    setF((s) => ({ ...s, countries: s.countries.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.url.trim()) {
      setTab("basic");
      setError("长链接不能为空");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = toInput(f, editing);
      const { link } = editing ? await api.update(editing.code, input) : await api.create(input);
      onSaved(link, !editing);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const routingCount = Object.values(f.devices).filter(Boolean).length + f.countries.length;
  const tabs = [
    { value: "basic", label: "基本信息" },
    { value: "control", label: f.password || f.expiresAt || f.unsafe || (editing?.hasPassword && !f.clearPassword) ? "链接控制 · 已启用" : "链接控制" },
    { value: "routing", label: routingCount ? `智能跳转 · ${routingCount}` : "智能跳转" },
    { value: "preview", label: f.ogTitle || f.ogDescription || f.ogImage ? "社交预览 · 已设置" : "社交预览" },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="xl" className="max-h-[90vh] overflow-y-auto px-6 py-5">
        <form onSubmit={save} className="grid gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <Dialog.Title className="text-lg font-semibold">{editing ? `编辑 /${editing.code}` : "新建短链"}</Dialog.Title>
              <Dialog.Description className="text-base text-kumo-subtle">
                {editing ? "短码创建后不能修改，其它设置随时可改。" : "只填长链接也行，其余都有默认值。"}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="关闭"
              render={(p) => <Button {...p} variant="ghost" shape="square" icon={<XIcon />} aria-label="关闭" />}
            />
          </div>

          <Tabs variant="underline" tabs={tabs} value={tab} onValueChange={(v) => setTab(v as Tab)} />

          <div className="min-h-72">
            {tab === "basic" && (
              <div className="grid gap-4">
                <Input
                  label="长链接"
                  type="url"
                  placeholder="https://example.com/very/long/path"
                  value={f.url}
                  onChange={(e) => set("url", e.target.value)}
                  required
                  autoFocus
                />
                <Grid variant="2up" gap="base">
                  <Input
                    label="短码"
                    placeholder="留空自动生成"
                    value={f.code}
                    onChange={(e) => set("code", e.target.value)}
                    disabled={Boolean(editing)}
                    pattern="[A-Za-z0-9_\-]{1,64}"
                    description={f.code ? `${origin}/${f.code}` : "字母、数字、- 和 _，区分大小写"}
                  />
                  <Input label="备注" description="可选，只有你看得到" value={f.note} onChange={(e) => set("note", e.target.value)} maxLength={200} />
                </Grid>
              </div>
            )}

            {tab === "control" && (
              <div className="grid gap-5">
                <Grid variant="2up" gap="base">
                  <Input
                    label="过期时间"
                    type="datetime-local"
                    value={f.expiresAt}
                    onChange={(e) => set("expiresAt", e.target.value)}
                    description="留空表示永久有效，过期后访问返回「链接已过期」"
                  />
                  <SensitiveInput
                    label="访问密码"
                    value={f.password}
                    onValueChange={(v: string) => set("password", v)}
                    autoComplete="new-password"
                    description={editing?.hasPassword ? "已设置密码；留空保持不变，填写则替换" : "留空表示不设密码"}
                  />
                </Grid>
                {editing?.hasPassword && (
                  <Switch label="移除现有密码" checked={f.clearPassword} onCheckedChange={(v: boolean) => set("clearPassword", v)} />
                )}
                <Switch
                  label="跳转前显示安全提示页"
                  labelTooltip="访客会先看到「这个链接可能不安全」，确认后再前往目标地址"
                  checked={f.unsafe}
                  onCheckedChange={(v: boolean) => set("unsafe", v)}
                />
              </div>
            )}

            {tab === "routing" && (
              <div className="grid gap-6">
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <Text variant="heading" as="h3">按设备</Text>
                    <Text variant="secondary">优先级最高。没填的设备走国家规则或默认长链接。</Text>
                  </div>
                  <Grid variant="2up" gap="base">
                    <Input label="iOS" type="url" placeholder="https://apps.apple.com/…" value={f.devices.ios} onChange={(e) => setDevice("ios", e.target.value)} />
                    <Input label="Android" type="url" placeholder="https://play.google.com/…" value={f.devices.android} onChange={(e) => setDevice("android", e.target.value)} />
                    <Input label="其它手机" type="url" value={f.devices.mobile} onChange={(e) => setDevice("mobile", e.target.value)} />
                    <Input label="桌面电脑" type="url" value={f.devices.desktop} onChange={(e) => setDevice("desktop", e.target.value)} />
                  </Grid>
                </div>
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <Text variant="heading" as="h3">按国家或地区</Text>
                    <Text variant="secondary">两位 ISO 代码，例如 CN、US、JP。</Text>
                  </div>
                  {f.countries.map((r) => (
                    <div key={r.id} className="flex items-start gap-2">
                      <div className="w-24 shrink-0">
                        <Input className="w-full" aria-label="国家代码" placeholder="CN" maxLength={2} value={r.code} onChange={(e) => setCountry(r.id, { code: e.target.value.toUpperCase() })} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Input className="w-full" aria-label="目标链接" type="url" placeholder="https://example.cn" value={r.url} onChange={(e) => setCountry(r.id, { url: e.target.value })} />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        shape="square"
                        icon={TrashIcon}
                        aria-label="删除这条规则"
                        onClick={() => set("countries", f.countries.filter((x) => x.id !== r.id))}
                      />
                    </div>
                  ))}
                  <div>
                    <Button type="button" variant="secondary" icon={PlusIcon} onClick={() => set("countries", [...f.countries, { id: ++rowId, code: "", url: "" }])}>
                      添加国家规则
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {tab === "preview" && (
              <div className="grid gap-5 md:grid-cols-[1fr_280px]">
                <div className="grid content-start gap-4">
                  <Input label="标题" value={f.ogTitle} onChange={(e) => set("ogTitle", e.target.value)} maxLength={200} />
                  <InputArea label="描述" value={f.ogDescription} onValueChange={(v: string) => set("ogDescription", v)} autoResize minRows={2} maxRows={5} maxLength={500} />
                  <Input label="图片地址" type="url" placeholder="https://…/cover.png" value={f.ogImage} onChange={(e) => set("ogImage", e.target.value)} description="建议 1200×630" />
                </div>
                <div className="grid content-start gap-2">
                  <Text variant="secondary" size="sm">预览</Text>
                  <div className="overflow-hidden rounded-lg bg-kumo-base ring ring-kumo-hairline">
                    <div className="aspect-[1200/630] bg-kumo-recessed">
                      {f.ogImage && <img src={f.ogImage} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="grid gap-1 px-3 py-2.5">
                      <Text variant="secondary" size="xs">{hostOf(origin)}</Text>
                      <Text bold truncate>{f.ogTitle || "（未设置标题）"}</Text>
                      {f.ogDescription && <Text variant="secondary" size="sm">{f.ogDescription}</Text>}
                    </div>
                  </div>
                  <Text variant="secondary" size="xs">微信、Telegram、X、Slack 等抓取链接时显示。</Text>
                </div>
              </div>
            )}
          </div>

          {error && <Banner size="sm" variant="error" icon={<WarningCircleIcon weight="fill" />} title="保存失败" description={error} />}

          <div className="flex justify-end gap-2">
            <Dialog.Close render={(p) => <Button {...p} type="button" variant="secondary">取消</Button>} />
            <Button type="submit" variant="primary" loading={saving}>
              {editing ? "保存" : "创建"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
