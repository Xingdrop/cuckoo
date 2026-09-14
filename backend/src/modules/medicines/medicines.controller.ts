/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9tZWRpY2luZXMvbWVkaWNpbmVzLmNvbnRyb2xsZXIudHN8MjAyNi0wOXxkMzcyNTg3ZTA1 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateMedicineDto } from './dto/create-medicine.dto';
import { DeductStockDto } from './dto/deduct-stock.dto';
import { UpdateMedicineDto } from './dto/update-medicine.dto';
import { MedicinesService } from './medicines.service';

class AdjustDto {
  @IsInt()
  @Min(-10000)
  @Max(10000)
  delta: number;
}

class LogsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

@ApiTags('药品')
@Controller('medicines')
export class MedicinesController {
  constructor(private readonly medicinesService: MedicinesService) {}

  @Get()
  @ApiOperation({ summary: '药品列表（FR-301）' })
  list(@CurrentUser('sub') userId: string) {
    return this.medicinesService.list(userId);
  }

  @Post()
  @ApiOperation({ summary: '添加药品（FR-301）' })
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateMedicineDto) {
    return this.medicinesService.create(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '药品详情' })
  findOne(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.medicinesService.findOne(userId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '编辑药品（FR-301）' })
  update(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMedicineDto,
  ) {
    return this.medicinesService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除药品（软删除）' })
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.medicinesService.remove(userId, id);
  }

  @Patch(':id/stock')
  @ApiOperation({ summary: '调整库存（补充/增减）' })
  adjust(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: AdjustDto,
  ) {
    return this.medicinesService.adjustStock(userId, id, dto.delta);
  }

  @Post(':id/deduct')
  @ApiOperation({ summary: '手动扣减库存' })
  deduct(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: DeductStockDto,
  ) {
    return this.medicinesService.manualRecord(userId, id, dto);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: '服药历史（FR-308）' })
  logs(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Query() query: LogsQueryDto,
  ) {
    return this.medicinesService.logs(userId, id, query.page ?? 1, query.pageSize ?? 20);
  }
}
