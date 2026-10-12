import { lazy, Suspense } from "react";
import { Loader } from "@cloudflare/kumo";
import type { PageData } from "../../src/shared/types.ts";
import { ExpiredPage, HomePage, LoginPage, NotFoundPage, PasswordPage, WarningPage } from "./pages/VisitorPages.tsx";

// 后台（含图表）单独分包，访客页面不用下载
const AdminPage = lazy(() => import("./admin/AdminPage.tsx").then((m) => ({ default: m.AdminPage })));

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader size={24} />
  </div>
);

export function App({ page }: { page: PageData }) {
  switch (page.kind) {
    case "admin":
      return (
        <Suspense fallback={<PageLoader />}>
          <AdminPage user={page.user} origin={page.origin} stats={page.stats} />
        </Suspense>
      );
    case "login":
      return <LoginPage error={page.error} />;
    case "password":
      return <PasswordPage code={page.code} wrong={page.wrong} />;
    case "warning":
      return <WarningPage target={page.target} />;
    case "expired":
      return <ExpiredPage />;
    case "notfound":
      return <NotFoundPage />;
    default:
      return <HomePage />;
  }
}
