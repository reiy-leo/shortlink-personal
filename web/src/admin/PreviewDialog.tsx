// 社交预览（OG）：从列表「…」菜单打开，单独保存，只改 og 字段。
import { useEffect, useState } from "react";
import { Banner, Button, Dialog, Input, InputArea, Text } from "@cloudflare/kumo";
import { WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import type { LinkView } from "../../../src/shared/types.ts";
import { api } from "../api.ts";
import { hostOf } from "./format.ts";

export function PreviewDialog(props: {
  open: boolean;
  link: LinkView | null;
  origin: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (link: LinkView) => void;
}) {
  const { open, link, origin, onOpenChange, onSaved } = props;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !link) return;
    setTitle(link.og?.title ?? "");
    setDescription(link.og?.description ?? "");
    setImage(link.og?.image ?? "");
    setError(null);
  }, [open, link]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!link) return;
    setSaving(true);
    setError(null);
    try {
      const { link: saved } = await api.update(link.code, { og: { title, description, image } });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="xl" className="max-h-[90vh] overflow-y-auto px-6 py-5">
        <form onSubmit={save} className="grid gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <Dialog.Title className="text-lg font-semibold">社交预览 {link ? `/${link.code}` : ""}</Dialog.Title>
              <Dialog.Description className="text-base text-kumo-subtle">
                微信、Telegram、X、Slack 等抓取这个短链时显示的卡片。全部留空则不设置。
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="关闭"
              render={(p) => <Button {...p} variant="ghost" shape="square" icon={<XIcon />} aria-label="关闭" />}
            />
          </div>

          <div className="grid gap-5 md:grid-cols-[1fr_280px]">
            <div className="grid content-start gap-4">
              <Input label="标题" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              <InputArea label="描述" value={description} onValueChange={(v: string) => setDescription(v)} autoResize minRows={2} maxRows={5} maxLength={500} />
              <Input label="图片地址" type="url" placeholder="https://…/cover.png" value={image} onChange={(e) => setImage(e.target.value)} description="建议 1200×630" />
            </div>
            <div className="grid content-start gap-2">
              <Text variant="secondary" size="sm">预览</Text>
              <div className="overflow-hidden rounded-lg bg-kumo-base ring ring-kumo-hairline">
                <div className="aspect-[1200/630] bg-kumo-recessed">
                  {image && <img src={image} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="grid gap-1 px-3 py-2.5">
                  <Text variant="secondary" size="xs">{hostOf(origin)}</Text>
                  <Text bold truncate>{title || "（未设置标题）"}</Text>
                  {description && <Text variant="secondary" size="sm">{description}</Text>}
                </div>
              </div>
            </div>
          </div>

          {error && <Banner size="sm" variant="error" icon={<WarningCircleIcon weight="fill" />} title="保存失败" description={error} />}

          <div className="flex justify-end gap-2">
            <Dialog.Close render={(p) => <Button {...p} type="button" variant="secondary">取消</Button>} />
            <Button type="submit" variant="primary" loading={saving}>保存</Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
