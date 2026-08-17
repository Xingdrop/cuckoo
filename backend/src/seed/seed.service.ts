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

/**
 * 种子数据框架：应用启动时写入官方计划 / 微运动库 / 敏感词。
 * 开关：SEED_DEMO_DATA（默认 true）；幂等：按业务键存在则跳过。
 */
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
    await this.seedPlanTemplates();
    await this.seedExercises();
    await this.seedSensitiveWords();
    this.logger.log('种子数据写入完成');
  }

  /** 官方计划（PlanTemplate，用户可一键加入） */
  private async seedPlanTemplates() {
    const templates: Partial<PlanTemplate>[] = [
      {
        id: 'tpl-water-schedule',
        title: '科学喝水时间表',
        description: '8 杯水计划：从早到晚均匀补水，唤醒身体代谢。',
        status: PlanTemplateStatus.PUBLISHED,
        version: 1,
        createdBy: 'system',
        mediaUrls: [],
        reminderConfig: [
          {
            category: 'water',
            title: '喝水 · 上午',
            repeatRule: { type: 'daily' },
            startTime: '09:00',
            content: { text: '起床后第一杯温水（200ml）' },
          },
          {
            category: 'water',
            title: '喝水 · 下午',
            repeatRule: { type: 'daily' },
            startTime: '14:00',
            content: { text: '下午补充水分（200ml）' },
          },
          {
            category: 'water',
            title: '喝水 · 傍晚',
            repeatRule: { type: 'daily' },
            startTime: '18:00',
            content: { text: '晚饭前一杯水（200ml）' },
          },
        ],
      },
      {
        id: 'tpl-office-health',
        title: '办公室健康操',
        description: '久坐族必备：每 45 分钟起身活动 + 每日颈部放松。',
        status: PlanTemplateStatus.PUBLISHED,
        version: 1,
        createdBy: 'system',
        mediaUrls: [],
        reminderConfig: [
          {
            category: 'exercise',
            title: '久坐起身活动',
            repeatRule: { type: 'interval', intervalValue: 45, intervalUnit: 'minute' },
            content: { text: '起身活动一下，看看远方，做 30 秒拉伸' },
          },
          {
            category: 'exercise',
            title: '颈部放松',
            repeatRule: { type: 'interval', intervalValue: 2, intervalUnit: 'hour' },
            content: { text: '颈部后缩动作：下巴后收，保持 5 秒 × 5 次' },
          },
        ],
      },
    ];

    for (const t of templates) {
      const exists = await this.planTemplateRepo.findOne({
        where: { id: t.id! },
      });
      if (!exists) {
        await this.planTemplateRepo.save(
          this.planTemplateRepo.create(t as PlanTemplate),
        );
        this.logger.log(`官方计划种子: ${t.title}`);
      }
    }
  }

  /** 微运动库（≥10 条起步，50+ 为运营目标） */
  private async seedExercises() {
    const exercises: Partial<Exercise>[] = [
      { id: 'ex-stretch-neck', name: '颈部左右拉伸', category: ExerciseCategory.STRETCH, durationSeconds: 30, steps: '坐直，头向左倾至拉伸感，保持 15 秒；换右侧。', sortOrder: 1 },
      { id: 'ex-stretch-shoulder', name: '肩部环绕', category: ExerciseCategory.STRETCH, durationSeconds: 30, steps: '双肩向后画圈 10 次，再向前 10 次。', sortOrder: 2 },
      { id: 'ex-stretch-wrist', name: '手腕放松', category: ExerciseCategory.STRETCH, durationSeconds: 30, steps: '双手前伸，手指交叉翻转，保持 15 秒。', sortOrder: 3 },
      { id: 'ex-kegel-basic', name: '提肛基础训练', category: ExerciseCategory.KEGEL, durationSeconds: 60, steps: '收缩盆底肌 3 秒放松 3 秒，重复 10 次。', sortOrder: 4 },
      { id: 'ex-kegel-hold', name: '提肛保持训练', category: ExerciseCategory.KEGEL, durationSeconds: 90, steps: '收缩盆底肌保持 5 秒，放松 5 秒，重复 9 次。', sortOrder: 5 },
      { id: 'ex-neck-retraction', name: '颈部后缩（头前倾纠正）', category: ExerciseCategory.NECK, durationSeconds: 60, steps: '下巴水平后收成双下巴状，保持 5 秒，重复 10 次。', sortOrder: 6 },
      { id: 'ex-eye-2020', name: '20-20-20 眼部放松', category: ExerciseCategory.EYE, durationSeconds: 20, steps: '每 20 分钟看 20 英尺（约 6 米）外 20 秒。', sortOrder: 7 },
      { id: 'ex-eye-blink', name: '眨眼润眼', category: ExerciseCategory.EYE, durationSeconds: 20, steps: '缓慢眨眼 10 次，闭眼转动眼球各方向。', sortOrder: 8 },
      { id: 'ex-stand-squat', name: '靠墙静蹲', category: ExerciseCategory.STAND, durationSeconds: 60, steps: '背靠墙下蹲至大腿与地面平行，保持 30-60 秒。', sortOrder: 9 },
      { id: 'ex-stand-heel', name: '提踵站立', category: ExerciseCategory.STAND, durationSeconds: 60, steps: '站立提踵 10 次，激活小腿与核心。', sortOrder: 10 },
    ];

    for (const e of exercises) {
      const exists = await this.exerciseRepo.findOne({ where: { id: e.id! } });
      if (!exists) {
        await this.exerciseRepo.save(this.exerciseRepo.create(e as Exercise));
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
