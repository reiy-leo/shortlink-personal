import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toasty } from "@cloudflare/kumo";
import type { PageData } from "../../src/shared/types.ts";
import { App } from "./App.tsx";
import "./styles.css";

function readPageData(): PageData {
  const el = document.getElementById("page-data");
  if (el?.textContent) {
    try {
      return JSON.parse(el.textContent) as PageData;
    } catch {
      /* fall through */
    }
  }
  // vite dev 直接打开时没有注入数据：用 ?page= 预览各页面
  const kind = new URLSearchParams(location.search).get("page") ?? "home";
  const demo: Record<string, PageData> = {
    admin: { kind: "admin", user: { email: "dev@localhost", name: "本地开发" }, origin: location.origin, stats: { recording: true, queryable: false } },
    login: { kind: "login", error: null },
    password: { kind: "password", code: "demo", wrong: false },
    warning: { kind: "warning", target: "https://example.com/some/path" },
    expired: { kind: "expired" },
    notfound: { kind: "notfound" },
  };
  return demo[kind] ?? { kind: "home" };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Toasty>
      <App page={readPageData()} />
    </Toasty>
  </StrictMode>,
);
