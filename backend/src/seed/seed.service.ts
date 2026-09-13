/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvc2VlZC9zZWVkLnNlcnZpY2UudHN8MjAyNi0wOXwwOTYzNWJkNTQ4 */
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Exercise, ExerciseCategory } from '../modules/exercises/exercise.entity';
import {
  PlanTemplate,
  PlanTemplateStatus,
} from '../modules/social/plan-template.entity';
import {
  SensitiveWord,
  SensitiveWordLevel,
} from '../modules/social/sensitive-word.entity';
import { ensureGuideMedia } from './seed-media';

/**
 * 种子数据框架：应用启动时写入官方计划 / 微运动库 / 敏感词，并生成引导插画（uploads/guide/）。
 * 开关：SEED_DEMO_DATA（默认 true）；幂等：按业务键存在则跳过，模板按 version 递增更新。
 */

interface TemplateReminderConfig {
  category: string;
  title: string;
  repeatRule: Record<string, unknown>;
  times?: string[];
  startTime?: string;
  content: {
    text?: string;
    imageUrls?: string[];
    waterAmountMl?: number;
  };
}

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(PlanTemplate)
    private readonly planTemplateRepo: Repository<PlanTemplate>,
    @InjectRepository(Exercise)
    private readonly exerciseRepo: Repository<Exercise>,
    @InjectRepository(SensitiveWord)
    private readonly sensitiveWordRepo: Repository<SensitiveWord>,
  ) {}

  async onApplicationBootstrap() {
    if (!this.config.get<boolean>('seed.demoData')) {
      this.logger.log('SEED_DEMO_DATA=false，跳过种子数据');
      return;
    }
    const media = await ensureGuideMedia(this.config.get<string>('upload.dir') ?? 'uploads');
    await this.seedPlanTemplates(media);
    await this.seedExercises(media);
    await this.seedSensitiveWords();
    this.logger.log('种子数据写入完成');
  }

  /** 插画媒体版本：重生成图片后 bump，URL 带参强制客户端绕过 WebView 图片缓存 */
  private static readonly MEDIA_V = '20260914a';

  /** 官方计划（PlanTemplate，用户可一键加入）；已存在时按 version 递增更新配置 */
  private async seedPlanTemplates(media: Record<string, string>) {
    const img = (name: string) => (media[name] ? `${media[name]}?v=${SeedService.MEDIA_V}` : '');
    const seq = (...names: string[]) => names.map(img).filter(Boolean);

    /** 喝水计划：3 个关键时点 × 200ml（用户决策：最少打扰）。
     *  时间依据中华医学会/各地卫健委科普：晨起空腹第一杯最重要；午后补水缓解困倦；
     *  晚饭后助消化。其余时点鼓励用户按「少量多次、不渴也喝」自主记录。 */
    const waterConfig: TemplateReminderConfig[] = [
      { category: 'water', title: '晨起第一杯温水', repeatRule: { type: 'daily' }, startTime: '07:30', content: { text: '起床后空腹喝 200ml 温水：补充一夜失水、降低血液黏度、唤醒肠胃（小口慢饮）。', imageUrls: seq('water-1', 'water-generic'), waterAmountMl: 200 } },
      { category: 'water', title: '午后补水', repeatRule: { type: 'daily' }, startTime: '13:30', content: { text: '午后 200ml，缓解饭后困倦、补充上午流失水分。', imageUrls: seq('water-5', 'water-generic'), waterAmountMl: 200 } },
      { category: 'water', title: '晚饭后一杯', repeatRule: { type: 'daily' }, startTime: '19:00', content: { text: '晚饭后半小时 200ml，助消化、稀释血液；睡前不宜大量饮水。', imageUrls: seq('water-7', 'water-generic'), waterAmountMl: 200 } },
    ];

    const officeConfig: TemplateReminderConfig[] = [
      { category: 'exercise', title: '久坐起身活动', repeatRule: { type: 'interval', intervalValue: 45, intervalUnit: 'minute' }, content: { text: '每坐 45 分钟起身活动 2~3 分钟：接水/走动，看看远处放松眼睛。', imageUrls: seq('standup-1', 'standup-2', 'eye-care-1') } },
      { category: 'exercise', title: '颈部放松', repeatRule: { type: 'interval', intervalValue: 2, intervalUnit: 'hour' }, content: { text: '颈部后缩（纠正头前倾）：下巴水平后收成"双下巴"，保持 5 秒 × 10 次；再左右侧倾拉伸各 15 秒。', imageUrls: seq('neck-ret-1', 'neck-ret-2') } },
      { category: 'eye', title: '眼部放松 20-20-20', repeatRule: { type: 'interval', intervalValue: 1, intervalUnit: 'hour' }, content: { text: '每用眼 20 分钟，看 20 英尺（约 6 米）外 20 秒——至少每小时完整做一组。', imageUrls: seq('eye-far', 'eye-close') } },
    ];

    const medicationConfig: TemplateReminderConfig[] = [
      { category: 'medication', title: '早间用药', repeatRule: { type: 'daily' }, startTime: '08:00', content: { text: '建议：先在「药品」页添加药品并设置库存，再把本提醒关联药品——完成后自动扣减库存。', imageUrls: seq('medication-1', 'medication-2') } },
      { category: 'medication', title: '晚间用药', repeatRule: { type: 'daily' }, startTime: '20:00', content: { text: '晚间剂量到点拍照打卡；漏服超时（默认 30 分钟）会通知你设置的紧急联系人。', imageUrls: seq('medication-1', 'medication-2') } },
    ];

    const templates: (Partial<PlanTemplate> & { version: number })[] = [
      {
        id: 'tpl-water-schedule',
        title: '科学喝水时间表',
        description: '每日 3 个关键时点 × 200ml：晨起空腹、午后补水、晚饭后——少而关键的补水节奏。',
        status: PlanTemplateStatus.PUBLISHED,
        version: 6,
        createdBy: 'system',
        mediaUrls: seq('water-1', 'water-5', 'water-8'),
        reminderConfig: waterConfig as never,
      },
      {
        id: 'tpl-office-health',
        title: '办公室健康操',
        description: '久坐族必备：每 45 分钟起身活动 + 每小时护眼 + 每日颈部放松（配跟练图解）。',
        status: PlanTemplateStatus.PUBLISHED,
        version: 3,
        createdBy: 'system',
        mediaUrls: seq('standup-1', 'neck-ret-1', 'eye-care-1'),
        reminderConfig: officeConfig as never,
      },
      {
        id: 'tpl-medication-routine',
        title: '规律用药示范',
        description: '早晚两次用药提醒（配图解）：配合「药品管理」自动扣库存、漏服通知亲友。',
        status: PlanTemplateStatus.PUBLISHED,
        version: 2,
        createdBy: 'system',
        mediaUrls: seq('medication-1'),
        reminderConfig: medicationConfig as never,
      },
    ];

    for (const t of templates) {
      const exists = await this.planTemplateRepo.findOne({ where: { id: t.id! } });
      if (!exists) {
        await this.planTemplateRepo.save(this.planTemplateRepo.create(t as PlanTemplate));
        this.logger.log(`官方计划种子: ${t.title}`);
      } else if (exists.version < t.version) {
        // 模板升级：仅刷新运营配置（不动用户已生成的计划）
        await this.planTemplateRepo.update(
          { id: t.id! },
          {
            title: t.title!,
            description: t.description!,
            mediaUrls: t.mediaUrls as never,
            reminderConfig: t.reminderConfig as never,
            version: t.version,
          },
        );
        this.logger.log(`官方计划升级 v${t.version}: ${t.title}`);
      }
    }
  }

  /** 微运动库：14 条（含配图；imageUrl 变更时同步更新既有行） */
  private async seedExercises(media: Record<string, string>) {
    const img = (name: string): string | null =>
      media[name] ? `${media[name]}?v=${SeedService.MEDIA_V}` : null;
    const seq2 = (...names: string[]): string[] =>
      names.map(img).filter((x): x is string => Boolean(x));
    const exercises: (Partial<Exercise> & { id: string })[] = [
      { id: 'ex-stretch-neck', name: '颈部左右拉伸', category: ExerciseCategory.STRETCH, durationSeconds: 30, imageUrl: img('neck-1'), imageUrls: seq2('neck-1', 'neck-2'), steps: '坐直，头向左倾至拉伸感，保持 15 秒；换右侧。' },
      { id: 'ex-stretch-shoulder', name: '肩部环绕', category: ExerciseCategory.STRETCH, durationSeconds: 30, imageUrl: img('shoulder-1'), imageUrls: seq2('shoulder-1', 'shoulder-2'), steps: '双肩向后画圈 10 次，再向前 10 次。' },
      { id: 'ex-stretch-wrist', name: '手腕放松', category: ExerciseCategory.STRETCH, durationSeconds: 30, imageUrl: img('wrist-1'), imageUrls: seq2('wrist-1'), steps: '双手前伸，手指交叉翻转，保持 15 秒。' },
      { id: 'ex-stretch-side', name: '体侧拉伸', category: ExerciseCategory.STRETCH, durationSeconds: 40, imageUrl: img('stretch-1'), imageUrls: seq2('stretch-1', 'stretch-2'), steps: '双臂上举，身体向左侧弯保持 15 秒，换右侧。' },
      { id: 'ex-kegel-basic', name: '提肛基础训练', category: ExerciseCategory.KEGEL, durationSeconds: 60, imageUrl: img('kegel-1'), imageUrls: seq2('kegel-1', 'kegel-2'), steps: '收缩盆底肌 3 秒放松 3 秒，重复 10 次。' },
      { id: 'ex-kegel-hold', name: '提肛保持训练', category: ExerciseCategory.KEGEL, durationSeconds: 90, imageUrl: img('kegel-1'), imageUrls: seq2('kegel-2', 'kegel-1'), steps: '收缩盆底肌保持 5 秒，放松 5 秒，重复 9 次。' },
      { id: 'ex-neck-retraction', name: '颈部后缩（头前倾纠正）', category: ExerciseCategory.NECK, durationSeconds: 60, imageUrl: img('neck-ret-1'), imageUrls: seq2('neck-ret-1', 'neck-ret-2'), steps: '下巴水平后收成双下巴状，保持 5 秒，重复 10 次。' },
      { id: 'ex-eye-2020', name: '20-20-20 眼部放松', category: ExerciseCategory.EYE, durationSeconds: 20, imageUrl: img('eye-2020-1'), imageUrls: seq2('eye-2020-1', 'eye-2020-2'), steps: '每 20 分钟看 20 英尺（约 6 米）外 20 秒。' },
      { id: 'ex-eye-blink', name: '眨眼润眼', category: ExerciseCategory.EYE, durationSeconds: 20, imageUrl: img('eye-blink-1'), imageUrls: seq2('eye-blink-1', 'eye-blink-2'), steps: '缓慢眨眼 10 次，闭眼转动眼球各方向。' },
      { id: 'ex-eye-focus', name: '远近聚焦', category: ExerciseCategory.EYE, durationSeconds: 60, imageUrl: img('eye-focus-1'), imageUrls: seq2('eye-focus-1', 'eye-focus-2'), steps: '指尖置于眼前 30cm 注视 5 秒，再看 6 米外 5 秒，交替 6 组。' },
      { id: 'ex-stand-squat', name: '靠墙静蹲', category: ExerciseCategory.STAND, durationSeconds: 60, imageUrl: img('squat-1'), imageUrls: seq2('squat-1', 'squat-2'), steps: '背靠墙下蹲至大腿与地面平行，保持 30-60 秒。' },
      // 2026-09-07（用户决策）：删除「提踵站立」，恢复「起身走动」——站立类保留静蹲+走动
      { id: 'ex-stand-walk', name: '起身走动', category: ExerciseCategory.STAND, durationSeconds: 90, imageUrl: img('walk-1'), imageUrls: seq2('walk-1', 'walk-2'), steps: '起身绕行 1~2 分钟，配合远眺放松眼睛。' },
      { id: 'ex-breathe', name: '深呼吸放松', category: ExerciseCategory.OTHER, durationSeconds: 120, imageUrl: img('breathe-1'), imageUrls: seq2('breathe-1', 'breathe-2', 'breathe-3'), steps: '吸气 4 秒→屏息 4 秒→呼气 6 秒，循环 8 次，缓解紧张。' },
    ];

    // 2026-09-07（用户决策）：删除「提踵站立」（含已入库数据）；「起身走动」恢复
    await this.exerciseRepo.delete({ id: 'ex-stand-heel' });

    for (const e of exercises) {
      const exists = await this.exerciseRepo.findOne({ where: { id: e.id } });
      if (!exists) {
        await this.exerciseRepo.save(this.exerciseRepo.create(e as Exercise));
      } else if (exists.imageUrl !== e.imageUrl || JSON.stringify(exists.imageUrls) !== JSON.stringify(e.imageUrls)) {
        // 插画升级时同步（steps/名称保持运营可改）
        await this.exerciseRepo.update({ id: e.id }, { imageUrl: e.imageUrl, imageUrls: e.imageUrls });
      }
    }
    this.logger.log(`微运动库种子: ${exercises.length} 条`);
  }

  /** 敏感词（示例，运营可扩展） */
  private async seedSensitiveWords() {
    const words: Partial<SensitiveWord>[] = [
      { id: randomUUID(), word: '代购处方药', level: SensitiveWordLevel.BLOCK },
      { id: randomUUID(), word: '偏方根治', level: SensitiveWordLevel.BLOCK },
      { id: randomUUID(), word: '百分百治愈', level: SensitiveWordLevel.BLOCK },
      { id: randomUUID(), word: '祖传秘方', level: SensitiveWordLevel.MASK },
    ];

    for (const w of words) {
      const exists = await this.sensitiveWordRepo.findOne({
        where: { word: w.word! },
      });
      if (!exists) {
        await this.sensitiveWordRepo.save(this.sensitiveWordRepo.create(w as SensitiveWord));
      }
    }
    this.logger.log(`敏感词种子: ${words.length} 条`);
  }
}
