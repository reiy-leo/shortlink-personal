import type { PageData } from "../../src/shared/types.ts";
import { AdminPage } from "./admin/AdminPage.tsx";
import { ExpiredPage, HomePage, LoginPage, NotFoundPage, PasswordPage, WarningPage } from "./pages/VisitorPages.tsx";

export function App({ page }: { page: PageData }) {
  switch (page.kind) {
    case "admin":
      return <AdminPage user={page.user} origin={page.origin} stats={page.stats} />;
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
