// 访客 / 登录侧页面：统一用 Kumo 的 Empty 作为居中状态页。
import type { ReactNode } from "react";
import { Banner, Button, ClipboardText, Empty, LinkButton, SensitiveInput, Text } from "@cloudflare/kumo";
import {
  ClockCountdownIcon,
  GoogleLogoIcon,
  LinkBreakIcon,
  LinkSimpleIcon,
  LockKeyIcon,
  ShieldWarningIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { LoginError } from "../../../src/shared/types.ts";

function StatusLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-kumo-canvas px-5 py-4">
      <div className="w-full max-w-md">{children}</div>
      <Text variant="secondary" size="xs" as="p">
        <span className="mt-8 block">s.rei8t.dev</span>
      </Text>
    </main>
  );
}

const icon = (node: ReactNode) => <span className="text-kumo-inactive">{node}</span>;

export function HomePage() {
  return (
    <StatusLayout>
      <Empty icon={icon(<LinkSimpleIcon size={48} />)} title="s.rei8t.dev" description="Rei 的个人短链服务。" />
    </StatusLayout>
  );
}

export function NotFoundPage() {
  return (
    <StatusLayout>
      <Empty icon={icon(<LinkBreakIcon size={48} />)} title="链接不存在" description="这个短链接不存在，或者已经被删除。" />
    </StatusLayout>
  );
}

export function ExpiredPage() {
  return (
    <StatusLayout>
      <Empty icon={icon(<ClockCountdownIcon size={48} />)} title="链接已过期" description="这个短链接已经过了有效期。" />
    </StatusLayout>
  );
}

export function PasswordPage({ code, wrong }: { code: string; wrong: boolean }) {
  return (
    <StatusLayout>
      <Empty
        icon={icon(<LockKeyIcon size={48} />)}
        title="需要密码"
        description="这个链接设置了访问密码，输入后继续。"
        contents={
          <form method="post" action={`/${encodeURIComponent(code)}`} className="grid w-full max-w-xs gap-3 text-left">
            <SensitiveInput
              name="password"
              label="访问密码"
              autoComplete="current-password"
              required
              autoFocus
              variant={wrong ? "error" : "default"}
              error={wrong ? "密码不对，再试一次" : undefined}
            />
            <Button type="submit" variant="primary" className="w-full justify-center">
              继续访问
            </Button>
          </form>
        }
      />
    </StatusLayout>
  );
}

export function WarningPage({ target }: { target: string }) {
  let host = target;
  try {
    host = new URL(target).hostname;
  } catch {
    /* keep raw */
  }
  return (
    <StatusLayout>
      <Empty
        icon={<span className="text-kumo-warning"><ShieldWarningIcon size={48} /></span>}
        title="安全提示"
        description={`你即将前往 ${host}，这个链接被标记为可能不安全。确认来源可信再继续。`}
        contents={
          <div className="grid w-full gap-3">
            <ClipboardText text={target} size="base" />
            <div className="flex justify-center gap-2">
              <Button variant="secondary" onClick={() => history.back()}>
                返回
              </Button>
              <LinkButton href={target} rel="noopener noreferrer" variant="primary">
                我了解风险，继续访问
              </LinkButton>
            </div>
          </div>
        }
      />
    </StatusLayout>
  );
}

const LOGIN_ERRORS: Record<LoginError, string> = {
  unconfigured: "Google 登录尚未配置：缺少 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET 或 SESSION_SECRET。",
  denied: "你取消了 Google 授权。",
  state: "登录状态已过期，请重新登录。",
  token: "向 Google 换取凭证失败，请重试。",
  id_token: "Google 返回的身份信息无效，请重试。",
  unverified: "这个 Google 账号的邮箱尚未验证。",
  forbidden: "这个 Google 账号没有后台权限。",
};

export function LoginPage({ error }: { error: LoginError | null }) {
  return (
    <StatusLayout>
      <div className="grid gap-6">
        {error && <Banner variant="error" icon={<WarningCircleIcon weight="fill" />} title="登录失败" description={LOGIN_ERRORS[error]} />}
        <Empty
          icon={icon(<LinkSimpleIcon size={48} />)}
          title="短链后台"
          description="仅限管理员，使用 Google 账号登录。"
          contents={
            <LinkButton href="/auth/login?returnTo=/admin" variant="primary" icon={GoogleLogoIcon}>
              使用 Google 登录
            </LinkButton>
          }
        />
      </div>
    </StatusLayout>
  );
}
