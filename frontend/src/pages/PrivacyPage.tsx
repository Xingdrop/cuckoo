import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * 隐私政策与健康免责声明（FR-105 / NFR-06 隐私合规；技术方案 §8.2）。
 * 公开页面：登录页底部与设置页均提供入口。
 */
export function PrivacyPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center text-ink-700"
          aria-label="返回"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold">隐私政策</h1>
      </header>

      <main className="space-y-5 px-5 pt-3 text-sm leading-relaxed text-ink-700">
        <p className="text-xs text-ink-500">生效日期：2026-08-29 ｜ 适用范围：布谷（Cuckoo）App（Web PWA）</p>

        <section>
          <h2 className="mb-1.5 text-base font-semibold">一、我们收集的信息</h2>
          <ul className="list-disc space-y-1 pl-5 marker:text-primary-500">
            <li><b>账号基础信息</b>：用户名与加密存储的密码（bcrypt 哈希，我们无法读取你的明文密码）。</li>
            <li><b>健康管理数据</b>：提醒计划、执行记录（完成/延迟/跳过/漏服）、药品与库存、喝水记录、微运动参与记录、统计与成就数据。</li>
            <li><b>健康目标与偏好</b>：你填写的健康目标、时区、通知偏好等设置。</li>
            <li><b>媒体文件</b>：拍照打卡/头像/帖子图片（经压缩处理，默认仅你本人或你主动发布的社区内容可见）。</li>
            <li><b>设备与推送</b>：Web Push 订阅端点（用于发送提醒通知，不包含通讯录）。</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1.5 text-base font-semibold">二、我们如何使用这些信息</h2>
          <ul className="list-disc space-y-1 pl-5 marker:text-primary-500">
            <li>提供提醒、统计、报告与成就等核心功能；</li>
            <li>在你授权后发送浏览器通知（页内提醒、漏服提醒、亲友漏服通知仅在你主动添加亲友并开启开关时触发）；</li>
            <li>社区功能（帖子/评论）仅在你有意发布时公开可见，并经过敏感词过滤。</li>
          </ul>
          <p className="mt-2 text-xs text-ink-500">我们不会将你的健康数据出售给任何第三方，也不会用于广告定向。</p>
        </section>

        <section>
          <h2 className="mb-1.5 text-base font-semibold">三、信息存储与安全</h2>
          <p>
            数据存储于本服务部署的服务器（当前为 SQLite 数据库，每日备份）。我们采取密码哈希、接口鉴权与限流、
            传输加密（生产 HTTPS）、上传文件类型校验等措施保护你的数据；但任何互联网传输都无法保证 100% 安全。
          </p>
        </section>

        <section>
          <h2 className="mb-1.5 text-base font-semibold">四、你的权利</h2>
          <ul className="list-disc space-y-1 pl-5 marker:text-primary-500">
            <li><b>查看与导出</b>：设置 → 我的数据 →「导出我的数据」，可下载你的全量 JSON 数据；</li>
            <li><b>更正</b>：在设置与各管理页中随时修改资料、提醒与偏好；</li>
            <li><b>删除</b>：设置 →「注销账号」将删除你的全部数据（仅保留不含个人身份信息的审计记录）；</li>
            <li><b>撤回通知授权</b>：可在浏览器站点设置中随时撤回通知权限。</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1.5 text-base font-semibold">五、健康免责声明</h2>
          <div className="rounded-card bg-accent-100 px-4 py-3 text-accent-700">
            布谷提供的提醒、微运动、统计与建议内容仅用于<b>日常健康管理辅助</b>，不构成医疗建议、诊断或治疗方案。
            如有用药疑问、身体不适或急症，请及时咨询执业医师或前往医疗机构就诊。长期用药请严格遵医嘱。
          </div>
        </section>

        <section>
          <h2 className="mb-1.5 text-base font-semibold">六、政策更新</h2>
          <p>本政策更新时将在 App 内提示；重大变更会以通知形式告知。继续使用即表示你同意更新后的政策。</p>
        </section>

        <p className="pt-2 text-center text-xs text-ink-300">© 2026 布谷（Cuckoo）</p>
      </main>
    </div>
  );
}
