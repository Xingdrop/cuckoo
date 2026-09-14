/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3BhZ2VzL01lZGljaW5lRWRpdFBhZ2UudHN4fDIwMjYtMDl8NjJjMjE5MTM2Zg== */
import { ChevronLeft, ImagePlus, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../services/http';
import { RImg } from '../components/remoteMedia';
import { medicinesApi, MedicineInput } from '../services/api/api.medicines';
import { filesApi } from '../services/api/api.files';
import { useLocal } from '../guest/localMode';
import { compressMediaFile } from '../utils/media';

/**
 * P-07b 添加/编辑药品（FR-301）
 */
export function MedicineEditPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState<MedicineInput>({
    name: '',
    dosage: '',
    administration: '',
    stock: 0,
    threshold: 3,
    expiryDate: '',
    instructions: '',
    deductionPerUse: 1,
    notifyOnLowStock: true,
  });
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** #25：多张药品照片 */
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!id) return;
    medicinesApi
      .list()
      .then((items) => {
        const m = items.find((x) => x.id === id);
        if (m) {
          setForm({
            name: m.name,
            dosage: m.dosage ?? '',
            administration: m.administration ?? '',
            stock: m.stock,
            threshold: m.threshold,
            expiryDate: m.expiryDate ?? '',
            instructions: m.instructions ?? '',
            deductionPerUse: m.deductionPerUse,
            notifyOnLowStock: m.notifyOnLowStock,
          });
          setPhotoUrls(m.photoUrls?.length ? m.photoUrls : m.photoUrl ? [m.photoUrl] : []);
        }
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [id]);

  /** #25：照片——离线保存到本地（dataURL），联网编辑保存时自动上传换取 URL；在线直接上传 */
  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, Math.max(0, 9 - photoUrls.length));
    if (!list.length) return;
    if (useLocal()) {
      // #26：离线先压缩（与社交一致），再存 base64 到本地；联网后编辑保存自动上传
      setUploading(true);
      setError(null);
      const thumbs: string[] = [];
      for (const f of list) {
        let dataUrl = '';
        try {
          const compressed = await compressMediaFile(f);
          dataUrl = await new Promise<string>((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result ?? ''));
            fr.onerror = () => resolve('');
            fr.readAsDataURL(compressed);
          });
        } catch {
          dataUrl = '';
        }
        if (dataUrl) thumbs.push(dataUrl);
      }
      setPhotoUrls((prev) => [...prev, ...thumbs].slice(0, 9));
      setUploading(false);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const f of list) {
        const r = await filesApi.upload(f);
        urls.push(r.url);
      }
      setPhotoUrls((prev) => [...prev, ...urls].slice(0, 9));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const set = (k: keyof MedicineInput, v: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError('请输入药品名称');
      return;
    }
    setSubmitting(true);
    try {
      // 空字符串字段不提交（后端 DTO 校验要求）
      const payload: MedicineInput = {
        ...form,
        expiryDate: form.expiryDate || undefined,
        dosage: form.dosage || undefined,
        administration: form.administration || undefined,
        instructions: form.instructions || undefined,
        photoUrls: photoUrls.length ? photoUrls : undefined,
        photoUrl: photoUrls[0],
      };
      // #25：在线保存时自动上传离线暂存的 base64 照片（换成可访问 URL）
      const hasLocalData = photoUrls.some((u) => u.startsWith('data:'));
      if (hasLocalData && !useLocal()) {
        const uploaded: string[] = [];
        for (const u of photoUrls) {
          if (!u.startsWith('data:')) {
            uploaded.push(u);
            continue;
          }
          const blob = await fetch(u).then((r) => r.blob());
          const r = await filesApi.upload(new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }));
          uploaded.push(r.url);
        }
        payload.photoUrls = uploaded;
        payload.photoUrl = uploaded[0];
      }
      if (isEdit && id) {
        await medicinesApi.update(id, payload);
      } else {
        await medicinesApi.create(payload);
      }
      navigate('/medicines');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-ink-500">加载中…</div>;
  }

  const inputCls =
    'mt-1 w-full rounded-btn border border-ink-100 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary-400';

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
        <h1 className="flex-1 text-lg font-semibold">{isEdit ? '编辑药品' : '添加药品'}</h1>
        <button
          type="submit"
          form="medicine-form"
          disabled={submitting}
          className="rounded-btn bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? '保存中…' : '保存'}
        </button>
      </header>

      <form id="medicine-form" onSubmit={submit} className="space-y-4 px-4 pt-4">
        {error && (
          <p className="rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}

        <div>
          <label className="text-sm font-medium text-ink-700">药品名称 *</label>
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={50}
            placeholder="如：降压药"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-ink-700">剂量</label>
            <input
              value={form.dosage ?? ''}
              onChange={(e) => set('dosage', e.target.value)}
              maxLength={20}
              placeholder="如：10mg"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700">服用方式</label>
            <select
              value={form.administration ?? ''}
              onChange={(e) => set('administration', e.target.value)}
              className={inputCls}
            >
              <option value="">选择</option>
              <option>口服</option>
              <option>含服</option>
              <option>外用</option>
              <option>注射</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-ink-700">剩余库存</label>
            <input
              type="number"
              min={0}
              value={form.stock ?? 0}
              onChange={(e) => set('stock', Number(e.target.value))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700">预警阈值</label>
            <input
              type="number"
              min={0}
              value={form.threshold ?? 0}
              onChange={(e) => set('threshold', Number(e.target.value))}
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-ink-700">每次扣减量</label>
            <input
              type="number"
              min={1}
              max={100}
              value={form.deductionPerUse ?? 1}
              onChange={(e) => set('deductionPerUse', Number(e.target.value))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700">有效期</label>
            <input
              type="date"
              value={form.expiryDate ?? ''}
              onChange={(e) => set('expiryDate', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-ink-700">服用说明</label>
          <textarea
            value={form.instructions ?? ''}
            onChange={(e) => set('instructions', e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="如：饭前服用、每日一次"
            className={`${inputCls} resize-none`}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ink-700">药品照片（最多 9 张，帮助识别/核对）</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {photoUrls.map((u, i) => (
              <span key={u} className="relative h-20 w-20 overflow-hidden rounded-card bg-ink-100">
                <RImg src={u} alt={`药品照片 ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrls((prev) => prev.filter((x) => x !== u))}
                  aria-label={`移除照片 ${i + 1}`}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            {photoUrls.length < 9 && (
              <label
                className={`flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-card border border-dashed border-ink-200 text-ink-400 ${
                  uploading ? 'opacity-50' : ''
                }`}
              >
                <ImagePlus size={20} />
                <span className="text-[10px]">{uploading ? '上传中…' : '添加照片'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void uploadPhotos(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
          <p className="mt-1 text-[10px] text-ink-400">离线时可压缩保存到本地，联网后编辑保存自动上传</p>
        </div>

        <label className="flex items-center gap-2 rounded-card bg-surface px-4 py-3 text-sm shadow-sm">
          <input
            type="checkbox"
            checked={form.notifyOnLowStock ?? true}
            onChange={(e) => set('notifyOnLowStock', e.target.checked)}
            className="h-5 w-5 accent-primary-500"
          />
          库存低于阈值时提醒我
        </label>

        {isEdit && (
          <button
            type="button"
            onClick={async () => {
              if (!id) return;
              if (!window.confirm('删除该药品？关联的提醒会保留但解除关联')) return;
              await medicinesApi.remove(id);
              navigate('/medicines');
            }}
            className="flex w-full items-center justify-center gap-1 rounded-card border border-danger-500/30 py-3 text-sm text-danger-500"
          >
            <Trash2 size={15} /> 删除药品
          </button>
        )}
      </form>
    </div>
  );
}
