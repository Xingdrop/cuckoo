import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { UserSetting } from './user-setting.entity';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    private readonly authService: AuthService,
  ) {}

  async getMe(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '用户不存在' });
    }
    return this.authService.toPublic(user);
  }

  async updateMe(
    userId: string,
    patch: Partial<Pick<User, 'avatarUrl' | 'healthGoals' | 'timezone'>>,
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '用户不存在' });
    }
    if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl;
    if (patch.healthGoals !== undefined) user.healthGoals = patch.healthGoals;
    if (patch.timezone !== undefined) user.timezone = patch.timezone;
    await this.userRepo.save(user);
    return this.authService.toPublic(user);
  }

  async getSettings(userId: string): Promise<UserSetting> {
    let setting = await this.settingRepo.findOne({ where: { userId } });
    if (!setting) {
      setting = await this.settingRepo.save(this.settingRepo.create({ userId }));
    }
    return setting;
  }

  async updateSettings(
    userId: string,
    patch: Partial<UserSetting>,
  ): Promise<UserSetting> {
    const setting = await this.getSettings(userId);
    Object.assign(setting, patch);
    return this.settingRepo.save(setting);
  }
}
