// 过期时间选择：Kumo Popover + DatePicker + Select（时、分、时区）。
// value / onChange："YYYY-MM-DDTHH:mm+08:00"（墙上时间 + 时区偏移；空字符串 = 永久有效）。
import { useState } from "react";
import { Button, DatePicker, Label, Popover, Select, Text } from "@cloudflare/kumo";
import { CalendarBlankIcon } from "@phosphor-icons/react";
import { zhCN } from "react-day-picker/locale";
import { countdown, fmtOffset, isoOffset, localOffset } from "./format.ts";
import { useNow } from "../useNow.ts";

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));
// UTC-12 … UTC+14 整点，加上常见的半点 / 45 分时区
const OFFSETS = [
  ...Array.from({ length: 27 }, (_, i) => (i - 12) * 60),
  -570, -210, 210, 270, 330, 345, 390, 525, 570, 630, 765,
].sort((a, b) => a - b);
const OFFSET_NAMES: Record<number, string> = {
  480: "北京、新加坡、台北", 540: "东京、首尔", 0: "UTC、伦敦（冬令时）", 60: "柏林、巴黎（冬令时）",
  "-300": "纽约（冬令时）", "-240": "纽约（夏令时）", "-480": "洛杉矶（冬令时）", "-420": "洛杉矶（夏令时）", 330: "印度",
} as Record<number, string>;

interface Parsed { date?: Date; hh: string; mm: string; off: number }

function parse(v: string): Parsed {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?:([+-])(\d{2}):?(\d{2}))?/);
  if (!m) return { hh: "23", mm: "55", off: localOffset() };
  const off = m[6] ? (m[6] === "-" ? -1 : 1) * (Number(m[7]) * 60 + Number(m[8])) : localOffset();
  return { date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), hh: m[4]!, mm: m[5]!, off };
}
const format = (d: Date, hh: string, mm: string, off: number) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hh}:${mm}${isoOffset(off)}`;

interface Props {
  value: string;
  onChange: (v: string) => void;
  description?: string;
}

export function ExpiryPicker({ value, onChange, description }: Props) {
  const [open, setOpen] = useState(false);
  const now = useNow();
  const p = parse(value);
  const { date, hh, mm, off } = p;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minutes = MINUTES.includes(mm) ? MINUTES : [...MINUTES, mm].sort();
  const offsets = OFFSETS.includes(off) ? OFFSETS : [...OFFSETS, off].sort((a, b) => a - b);
  const update = (patch: Partial<Parsed>) => {
    const n = { ...p, ...patch };
    if (n.date) onChange(format(n.date, n.hh, n.mm, n.off));
  };
  const left = value ? countdown(value, now) : null;
  const label = date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hh}:${mm} ${fmtOffset(off)}` : "永久有效";

  return (
    <div className="grid content-start gap-1.5">
      <Label>过期时间</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            <Button variant="secondary" icon={CalendarBlankIcon} className="justify-start">
              {label}
            </Button>
          }
        />
        <Popover.Content align="start" className="grid gap-3 p-3">
          <DatePicker
            mode="single"
            locale={zhCN}
            weekStartsOn={1}
            selected={date}
            onChange={(d?: Date) => d && update({ date: d })}
            disabled={{ before: today }}
            defaultMonth={date ?? today}
          />
          <div className="flex items-end gap-2">
            <Select label="时" value={hh} onValueChange={(v) => update({ hh: String(v) })} disabled={!date} className="w-20">
              {HOURS.map((h) => <Select.Option key={h} value={h}>{h}</Select.Option>)}
            </Select>
            <Select label="分" value={mm} onValueChange={(v) => update({ mm: String(v) })} disabled={!date} className="w-20">
              {minutes.map((m) => <Select.Option key={m} value={m}>{m}</Select.Option>)}
            </Select>
            <Select
              label="时区"
              value={off}
              onValueChange={(v) => update({ off: Number(v) })}
              disabled={!date}
              renderValue={(v) => fmtOffset(Number(v))}
              className="w-28"
            >
              {offsets.map((o) => (
                <Select.Option key={o} value={o}>
                  {OFFSET_NAMES[o] ? `${fmtOffset(o)} ${OFFSET_NAMES[o]}` : fmtOffset(o)}
                </Select.Option>
              ))}
            </Select>
          </div>
          {value && <Text variant="secondary" size="sm">{left ? `还剩 ${left}` : "这个时间已经过去了"}</Text>}
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => { onChange(""); setOpen(false); }}>永久有效</Button>
            <Button variant="primary" size="sm" onClick={() => setOpen(false)}>完成</Button>
          </div>
        </Popover.Content>
      </Popover>
      <Text variant="secondary" size="sm">
        {value ? (left ? `还剩 ${left}。` : "这个时间已经过去，保存后链接立即失效。") : ""}
        {description}
      </Text>
    </div>
  );
}
