import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

@ApiTags('系统')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: '健康检查（含数据库连通性）' })
  async check() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok', time: new Date().toISOString() };
  }
}
