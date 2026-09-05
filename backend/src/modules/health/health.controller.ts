/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9oZWFsdGgvaGVhbHRoLmNvbnRyb2xsZXIudHN8MjAyNi0wOXwwZDI5OThlYzVh */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('系统')
@Public()
@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  /** API 根路径：返回服务元信息（避免裸路径 404，便于联调探测） */
  @Get('/')
  @ApiOperation({ summary: 'API 元信息' })
  info() {
    return {
      name: '布谷 Cuckoo API',
      version: '1.0.0',
      docs: '/api',
      endpoints: ['/api/v1/health'],
    };
  }

  @Get('health')
  @ApiOperation({ summary: '健康检查（含数据库连通性）' })
  async check() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok', time: new Date().toISOString() };
  }
}
