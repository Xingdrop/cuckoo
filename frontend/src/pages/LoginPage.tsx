/**
 * P-02 登录（骨架）
 * M1 接入：注册/登录 API、JWT 存储、回跳路径
 */
export function LoginPage() {
  return (
    <div className="mx-auto flex max-w-md min-h-dvh flex-col items-center justify-center px-6">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-500 text-2xl text-white">
          🐦
        </div>
        <h1 className="mt-4 text-2xl font-bold">布谷</h1>
        <p className="mt-2 text-sm text-ink-500">准时提醒，温柔守护</p>
      </div>
      <div className="mt-8 w-full rounded-card bg-surface p-8 text-center text-sm text-ink-300 shadow-sm">
        登录表单（M1 接入）
      </div>
    </div>
  );
}
