import { useEffect, useState } from "react";

/** 每隔 interval 毫秒刷新一次的当前时间（倒计时用） */
export function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}
