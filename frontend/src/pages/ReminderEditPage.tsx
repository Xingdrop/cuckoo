/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3BhZ2VzL1JlbWluZGVyRWRpdFBhZ2UudHN4fDIwMjYtMDl8NTY2ZGUyZTUwYg== */
import { ChevronLeft, Clock, ImagePlus, Play, Plus, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../services/http';
import { filesApi } from '../services/api/api.files';
import { isVideoUrl } from '../components/MediaGrid';
import { compressMediaFile } from '../utils/media';
import { remindersApi } from '../services/api/api.reminders';
import { medicinesApi } from '../services/api/api.medicines';
import type { IntervalUnit, Medicine, ReminderCategory, RepeatType } from '../types';

const CATEGORIES: { value: ReminderCategory; label: string; emoji: string }[] = [
  { value: 'medication', label: '吃药', emoji: '💊' },
  { value: 'exercise', label: '锻炼', emoji: '🏃' },
  { value: 'water', label: '喝水', emoji: '💧' },
  { value: 'rest', label: '休息', emoji: '😴' },
  { value: 'work', label: '工作', emoji: '💼' },
  { value: 'custom', label: '自定义', emoji: '📌' },
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 自定义分类预设图标 */
const CUSTOM_ICONS = ['📌', '💊', '🏃', '💧', '😴', '💼', '👁️', '🧠', '🦷', '🍎', '📖', '🎯', '🌿', '💪', '❤️', '🧘'];

const REPEAT_OPTIONS: { value: RepeatType; label: string }[] = [
  { value: 'once', label: '单次' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'interval', label: '自定义间隔' },
];

/**
 * P-05 创建/编辑提醒（FR-201~203、FR-205~208）
 * 字段：分类/标题/时间/重复规则/内容/延迟设置/拍照挑战开关
 */
export function ReminderEditPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  /** 从"我的计划"进入时附带 planId（创建提醒归属计划） */
  const planId = searchParams.get('planId');
  const preset = (location.state as { preset?: { category?: ReminderCategory; title?: string; contentText?: string; contentImage?: string } } | null)?.preset;

  const pickMedia = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { url } = await filesApi.upload(await compressMediaFile(file));
      setReminderMedia((prev) => [...prev.slice(0, 3), url]);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const [category, setCategory] = useState<ReminderCategory>('water');
  const [categoryLabel, setCategoryLabel] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('📌');
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('08:00');
  /** 单次提醒日期（YYYY-MM-DD，once 适用） */
  const [onceDate, setOnceDate] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  });
  /** 每日多时间点（daily/weekly 适用），保留与单时间兼容 */
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [untimed, setUntimed] = useState(false);
  const [repeatType, setRepeatType] = useState<RepeatType>('daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [intervalValue, setIntervalValue] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('day');
  const [contentText, setContentText] = useState('');
  /** 提醒媒体（#3：图片/视频；上传后暂存 URL） */
  const [reminderMedia, setReminderMedia] = useState<string[]>([]);
  /** 外部链接（#2：跳转到其它视频 App 平台，如 B 站/优酷/抖音） */
  const [linkUrl, setLinkUrl] = useState('');
  const [challengeEnabled, setChallengeEnabled] = useState(false);
  /** 喝水设置（water 分类）：每次水量 / 每日目标 */
  const [waterAmount, setWaterAmount] = useState(200);
  const [waterGoal, setWaterGoal] = useState(2000);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [medicineId, setMedicineId] = useState<string>('');
  const [delayEnabled, setDelayEnabled] = useState(true);
  const [maxDelayCount, setMaxDelayCount] = useState(3);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 微运动/预设预填（从微运动库跳转）
  useEffect(() => {
    if (!preset) return;
    if (preset.category) setCategory(preset.category);
    if (preset.title) setTitle(preset.title);
    if (preset.contentText) setContentText(preset.contentText);
    if (preset.contentImage) setReminderMedia([preset.contentImage]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 加载药品列表（medication 分类关联用）
  useEffect(() => {
    medicinesApi
      .list()
      .then(setMedicines)
      .catch(() => undefined);
  }, []);

  // 编辑模式：加载已有数据
  useEffect(() => {
    if (!id) return;
    remindersApi
      .get(id)
      .then((r) => {
        setCategory(r.category);
        setCategoryLabel(r.categoryLabel ?? '');
        setCategoryIcon(r.categoryIcon ?? '📌');
        setTitle(r.title);
        // startDate 存 UTC，回填须用本地时间分量（否则跨时区显示错误）
        const d = new Date(r.startDate);
        setTime(
          `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        );
        if (r.times && r.times.length > 0) {
          setTimes(r.times);
        }
        setUntimed(r.repeatRule.type === 'daily' && (!r.times || r.times.length === 0));
        if (r.repeatRule.type === 'once') {
          setOnceDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        }
        setRepeatType(r.repeatRule.type);
        setDaysOfWeek(r.repeatRule.daysOfWeek ?? [1, 2, 3, 4, 5]);
        setDayOfMonth(r.repeatRule.dayOfMonth ?? 1);
        setIntervalValue(r.repeatRule.intervalValue ?? 1);
        setIntervalUnit(r.repeatRule.intervalUnit ?? 'day');
        setContentText(r.content.text ?? '');
        setReminderMedia([...(r.content.imageUrls ?? []), ...(r.content.videoUrl ? [r.content.videoUrl] : [])]);
        setLinkUrl(r.content.linkUrl ?? '');
        setChallengeEnabled(r.challenge.enabled ?? false);
        const wa = (r.content as { waterAmountMl?: number }).waterAmountMl;
        if (wa) setWaterAmount(wa);
        setMedicineId(r.medicineId ?? '');
        setDelayEnabled(Boolean(r.delaySettings.maxDelayCount));
        setMaxDelayCount(r.delaySettings.maxDelayCount ?? 3);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const toggleWeekday = (d: number) => {
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('请输入提醒标题');
      return;
    }
    if (repeatType === 'weekly' && daysOfWeek.length === 0) {
      setError('请至少选择一天');
      return;
    }

    // 本地时间 → ISO（用户时区由后端按用户配置处理）；once 用所选日期
    const [h, m] = time.split(':').map(Number);
    const now = new Date();
    const day = repeatType === 'once' ? onceDate.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1, now.getDate()];
    const startDate = new Date(day[0], day[1] - 1, day[2], h, m);

    // daily/weekly 支持多时间点；其余类型用单时间；daily 可勾选"不定时"（times 留空）
    const useTimes =
      (repeatType === 'daily' || repeatType === 'weekly') &&
      !untimed &&
      times.length > 0 &&
      times.some((t) => t !== '');
    const cleanTimes = useTimes
      ? [...new Set(times.map((t) => t.trim()).filter(Boolean))].sort()
      : undefined;

    const body = {
      category,
      ...(category === 'custom' && categoryLabel.trim()
        ? { categoryLabel: categoryLabel.trim(), categoryIcon: categoryIcon.trim() || '📌' }
        : {}),
      title: title.trim(),
      repeatRule: {
        type: repeatType,
        ...(repeatType === 'weekly' ? { daysOfWeek } : {}),
        ...(repeatType === 'monthly' ? { dayOfMonth } : {}),
        ...(repeatType === 'interval' ? { intervalValue, intervalUnit } : {}),
      },
      // #5：用本地日期串提交（ISO UTC 会偏移一天——"选今日却建到昨天/明天"）
      startDate: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`,
      ...(planId ? { planId } : {}),
      ...(cleanTimes ? { times: cleanTimes } : {}),
      content: {
        ...(contentText.trim() ? { text: contentText.trim() } : {}),
        ...(category === 'water' ? { waterAmountMl: waterAmount } : {}),
        ...(reminderMedia.length > 0
          ? { imageUrls: reminderMedia.filter((u) => !isVideoUrl(u)), videoUrl: reminderMedia.find((u) => isVideoUrl(u)) ?? undefined }
          : {}),
        ...(linkUrl.trim() ? { linkUrl: linkUrl.trim() } : {}),
      },
      ...(category === 'water'
        ? { waterGoalMl: waterGoal }
        : {}),
      challenge: { enabled: challengeEnabled, allowGallery: true },
      ...(category === 'medication' && medicineId ? { medicineId } : {}),
      delaySettings: delayEnabled ? { presetOptions: [5, 10, 15, 30], customEnabled: true, maxDelayCount } : {},
    };

    setSubmitting(true);
    try {
      let saved;
      if (isEdit && id) {
        saved = await remindersApi.update(id, body);
      } else {
        saved = await remindersApi.create(body);
      }
      window.dispatchEvent(new CustomEvent('cuckoo:reminders-changed'));
      navigate('/reminders', { state: { created: saved } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-ink-300">加载中…</div>;
  }

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
        <h1 className="flex-1 text-lg font-semibold">{isEdit ? '编辑提醒' : '新建提醒'}</h1>
        <button
          type="submit"
          form="reminder-form"
          disabled={submitting}
          className="rounded-btn bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? '保存中…' : '保存'}
        </button>
      </header>

      <form id="reminder-form" onSubmit={submit} className="space-y-5 px-4 pt-4">
        {error && (
          <p className="rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}

        {/* 分类 */}
        <section>
          <h2 className="text-sm font-medium text-ink-700">分类</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`flex items-center gap-1 rounded-full px-3 py-2 text-sm transition-colors ${
                  category === c.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface text-ink-700 shadow-sm'
                }`}
              >
                <span>{category === c.value && c.value === 'custom' && categoryIcon ? categoryIcon : c.emoji}</span>
                {category === c.value && c.value === 'custom' && categoryLabel.trim()
                  ? categoryLabel.trim()
                  : c.label}
              </button>
            ))}
          </div>
          {category === 'medication' && medicines.length > 0 && (
            <div className="mt-3">
              <label className="text-sm font-medium text-ink-700">关联药品</label>
              <select
                value={medicineId}
                onChange={(e) => setMedicineId(e.target.value)}
                className="mt-2 w-full rounded-btn border border-ink-100 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary-400"
              >
                <option value="">不关联</option>
                {medicines.map((m) => (
                  <option key={m.id} value={m.id}>
                    💊 {m.name}（余 {m.stock}）
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-500">确认服药后自动扣减库存</p>
            </div>
          )}
          {category === 'custom' && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={categoryLabel}
                onChange={(e) => setCategoryLabel(e.target.value)}
                maxLength={12}
                placeholder="分类名称，如：护眼"
                className="w-full rounded-btn border border-ink-100 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary-400"
              />
              <div className="w-full">
                <p className="text-xs text-ink-500">选择图标</p>
                <div className="mt-1.5 grid grid-cols-8 gap-1.5">
                  {CUSTOM_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setCategoryIcon(icon)}
                      className={`flex h-9 items-center justify-center rounded-lg text-base transition-colors ${
                        categoryIcon === icon ? 'bg-primary-500/15 ring-2 ring-primary-500' : 'bg-bg'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 标题 */}
        <section>
          <label htmlFor="title" className="text-sm font-medium text-ink-700">
            标题
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={50}
            placeholder="如：服用降压药"
            className="mt-2 w-full rounded-btn border border-ink-100 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary-400"
          />
        </section>

        {/* 时间（daily/weekly 支持多时间点） */}
        <section>
          {(repeatType === 'daily' || repeatType === 'weekly') ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1 text-sm font-medium text-ink-700">
                  <Clock size={14} /> 提醒时间（可多个）
                </h2>
                {!untimed && times.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setTimes((prev) => [...prev, '08:00'])}
                    className="flex items-center gap-1 rounded-full bg-primary-50 px-3 py-1.5 text-xs text-primary-600"
                  >
                    <Plus size={12} /> 添加时间点
                  </button>
                )}
              </div>
              {repeatType === 'daily' && (
                <label className="mt-2 flex cursor-pointer items-center justify-between rounded-btn bg-ink-100/50 px-3 py-2.5">
                  <span className="text-xs text-ink-700">
                    不定时：每天提醒一次，不在列表显示具体时间
                  </span>
                  <input
                    type="checkbox"
                    checked={untimed}
                    onChange={(e) => setUntimed(e.target.checked)}
                    className="h-4 w-4 accent-[#3E8E7E]"
                  />
                </label>
              )}
              {!untimed && (
                <>
                  <div className="mt-2 space-y-2">
                    {times.map((t, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={t}
                          onChange={(e) =>
                            setTimes((prev) => prev.map((x, i) => (i === idx ? e.target.value : x)))
                          }
                          className="w-full rounded-btn border border-ink-100 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary-400"
                        />
                        {times.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setTimes((prev) => prev.filter((_, i) => i !== idx))}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn text-ink-300 hover:text-danger-500"
                            aria-label="删除该时间点"
                          >
                            <X size={18} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-500">每个时间点都会单独提醒；同一提醒今日完成多次会自动折叠显示</p>
                </>
              )}
            </>
          ) : (
            <>
              {repeatType === 'once' && (
                <div className="mb-2">
                  <label htmlFor="onceDate" className="text-sm font-medium text-ink-700">
                    提醒日期
                  </label>
                  <input
                    id="onceDate"
                    type="date"
                    value={onceDate}
                    onChange={(e) => setOnceDate(e.target.value)}
                    className="mt-2 w-full rounded-btn border border-ink-100 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary-400"
                  />
                </div>
              )}
              <label htmlFor="time" className="text-sm font-medium text-ink-700">
                提醒时间
              </label>
              <input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-2 w-full rounded-btn border border-ink-100 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary-400"
              />
            </>
          )}
        </section>

        {/* 重复规则 */}
        <section>
          <h2 className="text-sm font-medium text-ink-700">重复</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {REPEAT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setRepeatType(o.value)}
                className={`rounded-full px-3 py-2 text-sm transition-colors ${
                  repeatType === o.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface text-ink-700 shadow-sm'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {repeatType === 'weekly' && (
            <div className="mt-3 flex gap-1.5">
              {WEEKDAYS.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => toggleWeekday(i)}
                  className={`flex h-10 flex-1 items-center justify-center rounded-full text-sm transition-colors ${
                    daysOfWeek.includes(i)
                      ? 'bg-primary-500 text-white'
                      : 'bg-surface text-ink-700 shadow-sm'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          )}

          {repeatType === 'monthly' && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm text-ink-500">每月</span>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="w-20 rounded-btn border border-ink-100 bg-surface px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
              <span className="text-sm text-ink-500">日（大于 28 日遇小月顺延月末）</span>
            </div>
          )}

          {repeatType === 'interval' && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm text-ink-500">每</span>
              <input
                type="number"
                min={1}
                value={intervalValue}
                onChange={(e) => setIntervalValue(Number(e.target.value))}
                className="w-20 rounded-btn border border-ink-100 bg-surface px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
              <select
                value={intervalUnit}
                onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                className="rounded-btn border border-ink-100 bg-surface px-3 py-2 text-sm outline-none"
              >
                <option value="day">天</option>
                <option value="hour">小时</option>
                <option value="week">周</option>
              </select>
            </div>
          )}
        </section>

        {/* 内容说明 */}
        <section>
          <label htmlFor="content" className="text-sm font-medium text-ink-700">
            内容说明（可选）
          </label>
          <textarea
            id="content"
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="提醒时展示的说明文字，如：喝 200ml 温水"
            className="mt-2 w-full resize-none rounded-btn border border-ink-100 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary-400"
          />
          {/* 媒体（#3/#25：图片/视频——直接显示缩略图，视频带封面+播放角标） */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex h-8 cursor-pointer items-center gap-1 rounded-full bg-primary-50 px-3 text-xs text-primary-600">
              <ImagePlus size={13} /> {reminderMedia.length ? '添加更多' : '添加图片/视频'}
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => void pickMedia(e.target.files?.[0])}
              />
            </label>
            {reminderMedia.length > 0 && (
              <button onClick={() => setReminderMedia([])} className="text-xs text-danger-500">
                清空
              </button>
            )}
          </div>
          {reminderMedia.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {reminderMedia.map((u, i) =>
                isVideoUrl(u) ? (
                  <div key={`${u}-${i}`} className="relative aspect-square w-full overflow-hidden rounded-btn bg-black">
                    <video src={u} className="h-full w-full object-cover" preload="metadata" muted playsInline />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
                        <Play size={14} fill="currentColor" />
                      </span>
                    </span>
                    <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                      视频
                    </span>
                  </div>
                ) : (
                  <span key={`${u}-${i}`} className="relative aspect-square w-full overflow-hidden rounded-btn bg-ink-100">
                    <img src={u} alt={`媒体 ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setReminderMedia((prev) => prev.filter((x) => x !== u))}
                      aria-label="移除媒体"
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ),
              )}
            </div>
          )}
          {/* 外部链接导入（#2：视频/文档/网页等，点击跳转外部应用） */}
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="🔗 粘贴外部链接（视频/B站/文档/网页等，提醒时点击跳转）"
            className="mt-2 w-full rounded-btn border border-ink-100 bg-surface px-3 py-2 text-xs outline-none focus:border-primary-400"
          />
        </section>

        {/* 喝水设置（water 分类） */}
        {category === 'water' && (
          <section className="rounded-card bg-surface p-4 shadow-sm">
            <p className="text-sm font-medium">喝水设置</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-ink-700">每次喝水量</label>
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={50}
                    max={1000}
                    step={50}
                    value={waterAmount}
                    onChange={(e) => setWaterAmount(Number(e.target.value) || 200)}
                    className="w-full rounded-btn border border-ink-100 px-3 py-2 text-sm outline-none focus:border-primary-400"
                  />
                  <span className="text-xs text-ink-500">ml</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-ink-700">每日目标</label>
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={500}
                    max={5000}
                    step={100}
                    value={waterGoal}
                    onChange={(e) => setWaterGoal(Number(e.target.value) || 2000)}
                    className="w-full rounded-btn border border-ink-100 px-3 py-2 text-sm outline-none focus:border-primary-400"
                  />
                  <span className="text-xs text-ink-500">ml</span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-500">确认喝水后自动累计到今日目标（看板实时更新）</p>
          </section>
        )}

        {/* 延迟设置 */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">允许延迟</p>
              <p className="text-xs text-ink-300">预设 5/10/15/30 分钟，可自定义</p>
            </div>
            <input
              type="checkbox"
              checked={delayEnabled}
              onChange={(e) => setDelayEnabled(e.target.checked)}
              className="h-5 w-5 accent-primary-500"
            />
          </div>
          {delayEnabled && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-ink-500">最多延迟</span>
              <input
                type="number"
                min={1}
                max={10}
                value={maxDelayCount}
                onChange={(e) => setMaxDelayCount(Number(e.target.value))}
                className="w-16 rounded-btn border border-ink-100 px-3 py-1.5 text-sm outline-none"
              />
              <span className="text-sm text-ink-500">次</span>
            </div>
          )}
        </section>

        {/* 拍照挑战（P1） */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">拍照打卡挑战</p>
              <p className="text-xs text-ink-300">提醒后需拍照确认完成（如药品/水杯）</p>
            </div>
            <input
              type="checkbox"
              checked={challengeEnabled}
              onChange={(e) => setChallengeEnabled(e.target.checked)}
              className="h-5 w-5 accent-primary-500"
            />
          </div>
        </section>

        {isEdit && (
          <button type="submit" className="hidden">
            提交
          </button>
        )}
      </form>
    </div>
  );
}
