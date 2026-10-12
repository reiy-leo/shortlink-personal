// 过期时间选择：Kumo Popover + DatePicker + Select（时、分）。
// value / onChange 使用本地时间字符串 "YYYY-MM-DDTHH:mm"（空字符串 = 永久有效）。
import { useState } from "react";
import { Button, DatePicker, Label, Popover, Select, Text } from "@cloudflare/kumo";
import { CalendarBlankIcon } from "@phosphor-icons/react";
import { zhCN } from "react-day-picker/locale";

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

function parse(v: string): { date?: Date; hh: string; mm: string } {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return { hh: "23", mm: "55" };
  return { date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), hh: m[4]!, mm: m[5]! };
}
const format = (d: Date, hh: string, mm: string) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hh}:${mm}`;
const display = (v: string) => {
  const { date, hh, mm } = parse(v);
  return date ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}` : "永久有效";
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  description?: string;
}

export function ExpiryPicker({ value, onChange, description }: Props) {
  const [open, setOpen] = useState(false);
  const { date, hh, mm } = parse(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 分钟下拉以 5 分钟为步长；已有的非整 5 分钟值也要能显示
  const minutes = MINUTES.includes(mm) ? MINUTES : [...MINUTES, mm].sort();

  return (
    <div className="grid content-start gap-1.5">
      <Label>过期时间</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            <Button variant="secondary" icon={CalendarBlankIcon} className="justify-start">
              {display(value)}
            </Button>
          }
        />
        <Popover.Content align="start" className="grid gap-3 p-3">
          <DatePicker
            mode="single"
            locale={zhCN}
            weekStartsOn={1}
            selected={date}
            onChange={(d?: Date) => d && onChange(format(d, hh, mm))}
            disabled={{ before: today }}
            defaultMonth={date ?? today}
          />
          <div className="flex items-end gap-2">
            <Select label="时" value={hh} onValueChange={(v) => date && onChange(format(date, String(v), mm))} disabled={!date} className="w-20">
              {HOURS.map((h) => <Select.Option key={h} value={h}>{h}</Select.Option>)}
            </Select>
            <Select label="分" value={mm} onValueChange={(v) => date && onChange(format(date, hh, String(v)))} disabled={!date} className="w-20">
              {minutes.map((m) => <Select.Option key={m} value={m}>{m}</Select.Option>)}
            </Select>
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => { onChange(""); setOpen(false); }}>永久有效</Button>
            <Button variant="primary" size="sm" onClick={() => setOpen(false)}>完成</Button>
          </div>
        </Popover.Content>
      </Popover>
      {description && <Text variant="secondary" size="sm">{description}</Text>}
    </div>
  );
}
