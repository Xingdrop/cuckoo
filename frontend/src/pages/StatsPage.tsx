/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3BhZ2VzL1N0YXRzUGFnZS50c3h8MjAyNi0wOXw0OWJiMjhhNDdm */ */
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, Camera, ChevronLeft, Download, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { statsApi, DashboardStats, DayStat } from '../services/api/api.stats';
import { remindersApi } from '../services/api/api.reminders';
import { filesApi } from '../services/api/api.files';
import { absoluteUrl, errorMessage } from '../services/http';
import { RImg } from '../components/remoteMedia';
import { compressMediaFile } from '../utils/media';
import { shortHash } from '../services/photoExport';

/** 热力图 4 档颜色映射（M5 完善：0 / 1-49 / 50-99 / 100%） */
const HEAT_COLORS = ['bg-ink-100', 'bg-primary-200', 'bg-primary-400', 'bg-primary-600'];

function heatColor(rate: number): string {
  if (rate <= 0) return HEAT_COLORS[0];
  if (rate < 50) return HEAT_COLORS[1];
  if (rate < 100) return HEAT_COLORS[2];
  return HEAT_COLORS[3];
}

/** #26：每个提醒的照片记录（完成/挑战/拍照记录 + 上传时间；可替换） */
interface PhotoGroup {
  reminderId: string;
  title: string;
  photos: { logId: string; url: string; at: string }[];
}

/**
 * P-15 统计页（FR-703/705/706/707）
 * 连续天数 / 月热力图 / 7 日趋势 / 分类统计
 */
export function StatsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [heatmap, setHeatmap] = useState<DayStat[]>([]);
  const [trend, setTrend] = useState<DayStat[]>([]);
  const [water, setWater] = useState<{ waterMl: number; waterGoalMl: number; rate: number; reached: boolean } | null>(null);
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  /** #26：照片记录 */
  const [photoGroups, setPhotoGroups] = useState<PhotoGroup[]>([]);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [photoView, setPhotoView] = useState<{ group: PhotoGroup; photo: { logId: string; url: string; at: string } } | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);

  const loadPhotos = useCallback(async () => {
    try {
      const list = await remindersApi.list();
      const groups: PhotoGroup[] = [];
      for (const r of list) {
        try {
          // 后端 pageSize 上限 100：分页拉全量（照片记录需要跨天历史）
          const items: { id: string; photoUrl?: string | null; createdAt?: string }[] = [];
          for (let page = 1; ; page++) {
            const p = await remindersApi.logs(r.id, page, 100);
            items.push(...p.items);
            if (items.length >= p.total || p.items.length === 0) break;
          }
          const photos = items
            .filter((l) => Boolean((l as { photoUrl?: string }).photoUrl))
            .map((l) => ({
              logId: l.id,
              url: (l as { photoUrl?: string }).photoUrl as string,
              at: (l as { createdAt?: string }).createdAt ?? '',
            }));
          if (photos.length) groups.push({ reminderId: r.id, title: r.title, photos });
        } catch {
          /* 单个提醒失败跳过 */
        }
      }
      setPhotoGroups(groups);
    } catch {
      /* 无权限/离线忽略 */
    }
  }, []);

  useEffect(() => {
    statsApi.dashboard().then(setStats).catch(() => undefined);
    statsApi.trend(7).then(setTrend).catch(() => undefined);
    statsApi.waterInfo().then(setWater).catch(() => undefined);
    void loadPhotos();
  }, [loadPhotos]);

  /** 2026-09-13：单张照片导出（APK 写公共目录；浏览器触发下载） */
  const exportSinglePhoto = async (p: { url: string; at: string }, title: string) => {
    const name = `${title.slice(0, 12).replace(/[\\/:*?"<>|]/g, '_')}-${new Date(p.at).toISOString().slice(0, 10)}-${shortHash(p.url)}.jpg`;
    const native = Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    if (native) {
      try {
        const { exportPhotoListToPhone } = await import('../services/photoExport');
        const r = await exportPhotoListToPhone([{ name, url: p.url }]);
        setPhotoMsg(r && r.saved ? `已导出到：${r.dir}` : r ? '照片已存在（此前导出过）' : '导出失败');
      } catch (e) {
        setPhotoMsg(`导出失败：${errorMessage(e)}`);
      }
    } else {
      try {
        const url = absoluteUrl(p.url);
        const blob = await fetch(url).then((r) => r.blob());
        const o = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = o;
        a.download = name;
        a.click();
        URL.revokeObjectURL(o);
        setPhotoMsg(`已开始下载：${name}`);
      } catch (e) {
        setPhotoMsg(`下载失败：${errorMessage(e)}`);
      }
    }
    setTimeout(() => setPhotoMsg(null), 3200);
  };

  /** 2026-09-13：单张照片删除（photoUrl 清空，记录保留；二次确认） */
  const [delSingle, setDelSingle] = useState(false);
  const [delSingleBusy, setDelSingleBusy] = useState(false);
  const deleteSinglePhoto = async () => {
    const view = photoView;
    if (!view || delSingleBusy) return;
    if (!delSingle) {
      setDelSingle(true);
      return;
    }
    setDelSingleBusy(true);
    try {
      await remindersApi.updateLogPhoto(view.photo.logId, '');
      setPhotoView(null);
      setDelSingle(false);
      await loadPhotos();
      setPhotoMsg('🗑 照片已删除');
      setTimeout(() => setPhotoMsg(null), 2600);
    } catch (e) {
      setPhotoMsg(`删除失败：${errorMessage(e)}`);
      setTimeout(() => setPhotoMsg(null), 3200);
    } finally {
      setDelSingleBusy(false);
    }
  };

  /** #26：详情页「再次拍照替换」→ 压缩上传 → 原记录保留、更新照片 */
  const replacePhoto = async (file: File | undefined) => {
    const view = photoView;
    if (!file || !view) return;
    setReplaceBusy(true);
    try {
      const compressed = await compressMediaFile(file);
      let url: string;
      try {
        url = (await filesApi.upload(compressed)).url;
      } catch {
        url = await new Promise<string>((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result ?? ''));
          fr.onerror = () => resolve('');
          fr.readAsDataURL(compressed);
        });
        if (!url) throw new Error('encode');
      }
      await remindersApi.updateLogPhoto(view.photo.logId, url);
      setPhotoView(null);
      await loadPhotos();
      setPhotoMsg('✅ 照片已替换');
      setTimeout(() => setPhotoMsg(null), 2600);
    } catch {
      setPhotoMsg('替换失败，请重试');
      setTimeout(() => setPhotoMsg(null), 2600);
    } finally {
      setReplaceBusy(false);
    }
  };

  /** #26：一键导出某提醒的全部照片（APK 写入公共 Download/布谷照片；浏览器逐个下载）
   *  2026-09-10：Directory.Documents 是应用私有目录（Android/data，文件管理器不可见）
   *  → 与设置页统一改走 NativePhotoSaver 公共目录 */
  const exportPhotoGroup = async (g: PhotoGroup) => {
    try {
      setPhotoMsg(`正在导出「${g.title}」${g.photos.length} 张照片…`);
      const native = Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
      if (native) {
        const { exportPhotoListToPhone } = await import('../services/photoExport');
        const items = g.photos.map((p, i) => ({
          // 文件名带 URL 短哈希：补拍替换（新 URL）→ 新文件名，重导出不再被同名「已存在」跳过
          name: `${g.title.slice(0, 12).replace(/[\\/:*?"<>|]/g, '_')}-${new Date(p.at).toISOString().slice(0, 10)}-${i + 1}-${shortHash(p.url)}.jpg`,
          url: p.url,
        }));
        const r = await exportPhotoListToPhone(items);
        if (!r || !r.dir) {
          setPhotoMsg('没有可导出的照片');
        } else {
          const extra = [r.skipped ? `已存在 ${r.skipped} 张` : '', r.failed ? `失败 ${r.failed} 张` : '']
            .filter(Boolean)
            .join('，');
          setPhotoMsg(`照片已导出到手机目录：${r.dir}（新增 ${r.saved} 张${extra ? `，${extra}` : ''}）`);
        }
        setTimeout(() => setPhotoMsg(null), 4200);
        return;
      }
      let saved = 0;
      for (let i = 0; i < g.photos.length; i++) {
        const p = g.photos[i];
        const name = `${g.title.slice(0, 12).replace(/[\\/:*?"<>|]/g, '_')}-${new Date(p.at).toISOString().slice(0, 10)}-${i + 1}-${shortHash(p.url)}.jpg`;
        const url = absoluteUrl(p.url);
        if (/^https?:\/\//i.test(url)) {
          const blob = await fetch(url).then((r) => r.blob());
          const o = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = o;
          a.download = name;
          a.click();
          URL.revokeObjectURL(o);
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
          a.click();
        }
        saved += 1;
      }
      setPhotoMsg(`已开始下载：「${g.title}」共 ${saved} 张`);
      setTimeout(() => setPhotoMsg(null), 3200);
    } catch (e) {
      setPhotoMsg(`导出失败：${errorMessage(e)}`);
      setTimeout(() => setPhotoMsg(null), 3200);
    }
  };

  useEffect(() => {
    statsApi.heatmap(month).then(setHeatmap).catch(() => undefined);
  }, [month]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const firstWeekday = heatmap.length > 0 ? new Date(heatmap[0].date + 'T00:00:00').getDay() : 0;

  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center text-ink-700"
          aria-label="返回"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="flex-1 text-lg font-semibold">统计</h1>
      </header>

      <main className="space-y-4 px-4 pt-3">
        {/* 连续天数 + 今日 + 喝水（#2 重构：指标三卡合一） */}
        <section className="rounded-card bg-primary-500 p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">连续坚持</p>
              <p className="mt-1 text-4xl font-bold">
                {stats?.streakDays ?? 0}
                <span className="ml-1 text-lg font-normal text-white/70">天</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-white/70">今日完成率</p>
              <p className="mt-1 text-2xl font-bold">{stats?.rate ?? 0}%</p>
              <p className="text-xs text-white/60">
                {stats?.done ?? 0}/{stats?.planned ?? 0}
                <span className="ml-1 opacity-80">（按提醒勾选计入）</span>
              </p>
            </div>
          </div>
          {water && (
            <div className="mt-4 border-t border-white/20 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-white/70">💧 今日喝水</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold">{water.waterMl}ml</span>
                  <span className="text-[10px] text-white/60">/ {water.waterGoalMl}ml</span>
                  {water.reached && (
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium text-primary-600">
                      ✓ 达标
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white transition-all" style={{ width: `${water.rate}%` }} />
              </div>
            </div>
          )}
        </section>

        {/* 月热力图 */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1 text-sm font-medium">
              <CalendarDays size={14} /> 热力图
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => shiftMonth(-1)} className="px-2 text-ink-500">
                ‹
              </button>
              <span className="text-sm">{month}</span>
              <button onClick={() => shiftMonth(1)} className="px-2 text-ink-500">
                ›
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1.5 text-center">
            {weekDays.map((w) => (
              <span key={w} className="text-[10px] text-ink-300">
                {w}
              </span>
            ))}
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <span key={`e${i}`} />
            ))}
            {heatmap.map((d) => (
              <div key={d.date} className="flex flex-col items-center">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-md text-[10px] ${heatColor(d.rate)} ${
                    d.rate > 0 ? 'font-medium' : ''
                  }`}
                  title={`${d.date}: ${d.rate}%（${d.done}/${d.planned}）`}
                >
                  {d.planned > 0 ? d.rate : ''}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-ink-300">
            低
            {HEAT_COLORS.map((c) => (
              <span key={c} className={`h-3 w-3 rounded-sm ${c}`} />
            ))}
            高
          </div>
        </section>

        {/* 7 日趋势 */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-medium">近 7 天趋势</h2>
          <div className="mt-3 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={trend}
                margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                accessibilityLayer={false}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => `${Number(d.slice(8))}日`}
                  tick={{ fontSize: 10, fill: '#6b7f79' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 10, fill: '#6b7f79' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'transparent', stroke: 'transparent' }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="rate" fill="#3e8e7e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 分类统计：#26 中文标签；喝水独立展示（无论是否计入完成率） */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-medium">分类统计（今日）</h2>
          {stats && Object.keys(stats.categoryStats).length > 0 ? (
            <ul className="mt-3 space-y-2.5">
              {Object.entries(stats.categoryStats).map(([name, c]) => {
                const label =
                  name === 'water'
                    ? '喝水'
                    : (
                        {
                          exercise: '运动',
                          medication: '用药',
                          rest: '休息',
                          work: '工作',
                          eye: '护眼',
                          posture: '体态',
                          custom: '自定义',
                        } as Record<string, string>
                      )[name] ?? name;
                const right =
                  name === 'water'
                    ? `${((c as { waterMl?: number }).waterMl ?? 0)} / ${((c as { waterGoalMl?: number }).waterGoalMl ?? 2000)}ml · ${c.rate}%`
                    : `${c.done}/${c.planned} · ${c.rate}%`;
                return (
                  <li key={name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink-700">{label}</span>
                      <span className="text-xs text-ink-500">{right}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-primary-500"
                        style={{ width: `${c.rate}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-500">今日暂无统计数据</p>
          )}
        </section>

        {/* #26：照片记录（每个提醒 完成/打卡 上传的照片 + 时间；可一键导出） */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-medium">照片记录（打卡）</h2>
          {photoMsg && <p className="mt-2 text-xs text-primary-600">{photoMsg}</p>}
          {photoGroups.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">暂无照片记录（完成提醒时可拍照记录）</p>
          ) : (
            <div className="mt-3 space-y-4">
              {photoGroups.map((g) => (
                <div key={g.reminderId}>
                  <div className="flex items-center justify-between">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{g.title}</p>
                    <button
                      onClick={() => void exportPhotoGroup(g)}
                      className="flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-600"
                    >
                      <Download size={12} /> 导出 {g.photos.length} 张
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {g.photos.map((p, i) => (
                      <button
                        key={`${p.url}-${i}`}
                        onClick={() => setPhotoView({ group: g, photo: p })}
                        className="relative aspect-square overflow-hidden rounded-btn bg-ink-100"
                        aria-label={`查看 ${g.title} 照片详情`}
                      >
                        <RImg src={p.url} alt={`${g.title} 照片`} className="h-full w-full object-cover" />
                        <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/55 px-1 py-0.5 text-[8px] text-white">
                          {new Date(p.at).toISOString().slice(0, 10)} {new Date(p.at).toISOString().slice(11, 16)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* #26：照片详情——大图 + 时间 + 再次拍照替换 */}
        {photoView && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setPhotoView(null)}>
            <div className="w-full max-w-sm rounded-card bg-surface p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{photoView.group.title}</p>
                <button onClick={() => setPhotoView(null)} aria-label="关闭" className="rounded-full bg-ink-100 p-1.5 text-ink-500">
                  <X size={16} />
                </button>
              </div>
              <RImg
                src={photoView.photo.url}
                alt="照片详情"
                className="mt-3 max-h-[55dvh] w-full rounded-btn object-contain"
              />
              <p className="mt-2 text-center text-[11px] text-ink-500">
                拍照/上传时间：{new Date(photoView.photo.at).toLocaleString()}
              </p>
              <input
                ref={replaceRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  void replacePhoto(f);
                }}
              />
              <button
                onClick={() => replaceRef.current?.click()}
                disabled={replaceBusy}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-btn bg-primary-500 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                <Camera size={15} /> {replaceBusy ? '替换中…' : '再次拍照替换'}
              </button>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => void exportSinglePhoto(photoView.photo, photoView.group.title)}
                  className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-btn bg-ink-100 text-sm font-medium text-ink-700"
                >
                  <Download size={15} /> 导出这张
                </button>
                <button
                  onClick={() => void deleteSinglePhoto()}
                  disabled={delSingleBusy}
                  className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-btn text-sm font-medium disabled:opacity-50 ${
                    delSingle ? 'bg-danger-500 text-white' : 'bg-danger-50 text-danger-700'
                  }`}
                >
                  <Trash2 size={15} /> {delSingleBusy ? '删除中…' : delSingle ? '确认删除' : '删除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
