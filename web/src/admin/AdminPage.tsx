// 后台主页：顶栏 + 链接表格 + 新建/编辑、统计、删除三个对话框（始终挂载，用 open 控制）。
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Banner,
  Button,
  Dialog,
  DropdownMenu,
  Empty,
  Input,
  LayerCard,
  Loader,
  Table,
  Text,
  Tooltip,
  useKumoToastManager,
} from "@cloudflare/kumo";
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  ChartBarIcon,
  CopyIcon,
  DotsThreeIcon,
  GlobeHemisphereEastIcon,
  ImageIcon,
  InfoIcon,
  LinkSimpleIcon,
  LockKeyIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  ShieldWarningIcon,
  SignOutIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { LinkView } from "../../../src/shared/types.ts";
import { api } from "../api.ts";
import { countdown, fmtTime } from "./format.ts";
import { useNow } from "../useNow.ts";
import { LinkDialog } from "./LinkDialog.tsx";
// 图表库（ECharts）只在需要看统计时加载
const StatsDialog = lazy(() => import("./StatsDialog.tsx").then((m) => ({ default: m.StatsDialog })));

interface Props {
  user: { email: string; name?: string; picture?: string };
  origin: string;
  stats: { recording: boolean; queryable: boolean };
}

/** 过期时间：纯文字，"2026/10/15 01:24 +0800 过期 · 还剩 2天 3小时 19分钟" */
function ExpiryText({ iso }: { iso: string }) {
  const now = useNow();
  const left = countdown(iso, now);
  return left ? (
    <Text variant="secondary" size="sm">{fmtTime(iso)} 过期 · 还剩 {left}</Text>
  ) : (
    <Text variant="error" size="sm">已于 {fmtTime(iso)} 过期</Text>
  );
}

function LinkBadges({ l }: { l: LinkView }) {
  const routes = Object.keys(l.devices ?? {}).length + Object.keys(l.countries ?? {}).length;
  if (!l.hasPassword && !l.unsafe && !routes && !l.og) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {l.hasPassword && <Badge variant="neutral" icon={<LockKeyIcon />}>密码</Badge>}
      {l.unsafe && <Badge variant="orange" icon={<ShieldWarningIcon />}>安全提示</Badge>}
      {routes > 0 && <Badge variant="blue" icon={<GlobeHemisphereEastIcon />}>分流 {routes}</Badge>}
      {l.og && <Badge variant="purple" icon={<ImageIcon />}>预览</Badge>}
    </div>
  );
}

export function AdminPage({ user, origin, stats }: Props) {
  const toast = useKumoToastManager();
  const [links, setLinks] = useState<LinkView[] | null>(null);
  const [clicks, setClicks] = useState<Record<string, number> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<LinkView | null>(null);
  const [statsCode, setStatsCode] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [deleting, setDeleting] = useState<LinkView | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.list();
      setLinks(d.links);
      setClicks(d.clicks);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shortUrl = (code: string) => `${origin}/${code}`;
  const copy = async (code: string) => {
    await navigator.clipboard.writeText(shortUrl(code)).catch(() => {});
    toast.add({ title: "已复制", description: shortUrl(code), variant: "success" });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!links || !q) return links;
    return links.filter((l) => [l.code, l.url, l.note ?? ""].some((s) => s.toLowerCase().includes(q)));
  }, [links, query]);

  const openCreate = () => {
    setEditing(null);
    setEditOpen(true);
  };
  const openEdit = (l: LinkView) => {
    setEditing(l);
    setEditOpen(true);
  };
  const openStats = (code: string) => {
    setStatsCode(code);
    setStatsOpen(true);
  };
  const askDelete = (l: LinkView) => {
    setDeleting(l);
    setDeleteOpen(true);
  };

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.remove(deleting.code);
      toast.add({ title: `已删除 /${deleting.code}`, variant: "success" });
      setDeleteOpen(false);
      void load();
    } catch (e) {
      toast.add({ title: "删除失败", description: e instanceof Error ? e.message : String(e), variant: "error" });
    } finally {
      setDeleteBusy(false);
    }
  }

  const statsHint = !stats.recording
    ? "访问统计未开启：缺少 Analytics Engine 绑定，或 CLICK_STATS 为 off。"
    : !stats.queryable
      ? "访问已在记录，但后台查看统计还需要配置 CF_ACCOUNT_ID 和 CF_API_TOKEN。"
      : null;

  return (
    <div className="min-h-screen bg-kumo-canvas">
      <header className="sticky top-0 z-10 border-b border-kumo-line bg-kumo-base">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-kumo-brand text-white">
              <LinkSimpleIcon size={16} weight="bold" />
            </span>
            <Text variant="heading" as="h1">短链</Text>
            <Badge variant="outline">{origin.replace(/^https?:\/\//, "")}</Badge>
          </div>
          <DropdownMenu>
            <DropdownMenu.Trigger
              render={
                <Button variant="ghost" icon={user.picture ? <img src={user.picture} alt="" className="size-5 rounded-full" /> : undefined}>
                  <span className="max-w-40 truncate">{user.name ?? user.email}</span>
                  <CaretDownIcon />
                </Button>
              }
            />
            <DropdownMenu.Content align="end">
              {/* Label 是 Base UI 的 GroupLabel，必须放在 Group 里，否则抛错白屏 */}
              <DropdownMenu.Group>
                <DropdownMenu.Label>{user.email}</DropdownMenu.Label>
              </DropdownMenu.Group>
              <DropdownMenu.Separator />
              <DropdownMenu.Item icon={SignOutIcon} onClick={() => (document.getElementById("logout-form") as HTMLFormElement | null)?.submit()}>
                退出登录
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
          <form id="logout-form" method="post" action="/auth/logout" hidden />
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1">
            <Text variant="heading" size="lg" as="h2">链接</Text>
            <Text variant="secondary">{links ? `共 ${links.length} 条` : "加载中…"}</Text>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-kumo-subtle">
                <MagnifyingGlassIcon size={14} />
              </span>
              <Input aria-label="搜索" placeholder="搜索短码、链接或备注" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full pl-8" />
            </div>
            <Button variant="primary" icon={PlusIcon} onClick={openCreate}>
              新建短链
            </Button>
          </div>
        </div>

        {statsHint && <Banner variant="secondary" icon={<InfoIcon weight="fill" />} title="统计未完全配置" description={statsHint} />}
        {loadError && <Banner variant="error" icon={<XIcon />} title="加载失败" description={loadError} />}

        {!links ? (
          <div className="flex justify-center py-16">
            <Loader size={24} />
          </div>
        ) : links.length === 0 ? (
          <LayerCard>
            <LayerCard.Primary>
              <Empty
                icon={<span className="text-kumo-inactive"><LinkSimpleIcon size={48} /></span>}
                title="还没有短链"
                description="新建第一条，生成后会自动复制到剪贴板。"
                contents={<Button variant="primary" icon={PlusIcon} onClick={openCreate}>新建短链</Button>}
              />
            </LayerCard.Primary>
          </LayerCard>
        ) : (
          <LayerCard className="overflow-x-auto p-0">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>短链</Table.Head>
                  <Table.Head>目标</Table.Head>
                  {stats.queryable && <Table.Head className="text-right">近 90 天</Table.Head>}
                  <Table.Head className="hidden md:table-cell">创建时间</Table.Head>
                  <Table.Head className="w-12"><span className="sr-only">操作</span></Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filtered!.map((l) => (
                  <Table.Row key={l.code}>
                    <Table.Cell>
                      <div className="flex items-center gap-1">
                        <a href={shortUrl(l.code)} target="_blank" rel="noopener" className="font-mono text-[0.9em] text-kumo-link hover:underline">
                          /{l.code}
                        </a>
                        <Tooltip content="复制短链" asChild>
                          <Button variant="ghost" size="xs" shape="square" icon={CopyIcon} aria-label="复制短链" onClick={() => copy(l.code)} />
                        </Tooltip>
                      </div>
                      {l.note && <Text variant="secondary" size="sm">{l.note}</Text>}
                    </Table.Cell>
                    <Table.Cell className="max-w-md">
                      <div className="grid gap-1.5">
                        <Text truncate title={l.url}>{l.url}</Text>
                        {l.expiresAt && <ExpiryText iso={l.expiresAt} />}
                        <LinkBadges l={l} />
                      </div>
                    </Table.Cell>
                    {stats.queryable && (
                      <Table.Cell className="text-right tabular-nums">
                        <button type="button" className="text-kumo-link hover:underline" onClick={() => openStats(l.code)}>
                          {(clicks?.[l.code] ?? 0).toLocaleString("zh-CN")}
                        </button>
                      </Table.Cell>
                    )}
                    <Table.Cell className="hidden whitespace-nowrap text-kumo-subtle md:table-cell">{fmtTime(l.createdAt)}</Table.Cell>
                    <Table.Cell>
                      <DropdownMenu>
                        <DropdownMenu.Trigger render={<Button variant="ghost" size="sm" shape="square" icon={DotsThreeIcon} aria-label={`/${l.code} 的操作`} />} />
                        <DropdownMenu.Content align="end">
                          <DropdownMenu.Item icon={CopyIcon} onClick={() => copy(l.code)}>复制短链</DropdownMenu.Item>
                          <DropdownMenu.LinkItem icon={ArrowSquareOutIcon} href={shortUrl(l.code)} target="_blank">打开</DropdownMenu.LinkItem>
                          {stats.queryable && <DropdownMenu.Item icon={ChartBarIcon} onClick={() => openStats(l.code)}>访问统计</DropdownMenu.Item>}
                          <DropdownMenu.Item icon={PencilSimpleIcon} onClick={() => openEdit(l)}>编辑</DropdownMenu.Item>
                          <DropdownMenu.Separator />
                          <DropdownMenu.Item icon={TrashIcon} variant="danger" onClick={() => askDelete(l)}>删除</DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu>
                    </Table.Cell>
                  </Table.Row>
                ))}
                {filtered!.length === 0 && (
                  <Table.Row>
                    <Table.Cell colSpan={5}>
                      <Text variant="secondary">没有匹配「{query}」的短链。</Text>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>
          </LayerCard>
        )}
      </main>

      <LinkDialog
        open={editOpen}
        editing={editing}
        origin={origin}
        onOpenChange={setEditOpen}
        onSaved={async (link, created) => {
          if (created) {
            await navigator.clipboard.writeText(shortUrl(link.code)).catch(() => {});
            toast.add({ title: "短链已创建并复制", description: shortUrl(link.code), variant: "success" });
          } else {
            toast.add({ title: `已保存 /${link.code}`, variant: "success" });
          }
          void load();
        }}
      />

      {stats.queryable && (
        <Suspense fallback={null}>
          <StatsDialog code={statsCode} open={statsOpen} onOpenChange={setStatsOpen} />
        </Suspense>
      )}

      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog size="sm" className="px-6 py-5">
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Dialog.Title className="text-lg font-semibold">删除 /{deleting?.code}？</Dialog.Title>
              <Dialog.Description className="text-base text-kumo-subtle">删除后这个短链会立即失效，无法恢复。</Dialog.Description>
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">取消</Button>} />
              <Button variant="destructive" loading={deleteBusy} onClick={confirmDelete}>
                删除
              </Button>
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
