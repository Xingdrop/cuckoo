/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9yZW1pbmRlcnMvZHRvL3VwZGF0ZS1yZW1pbmRlci5kdG8udHN8MjAyNi0wOXw0Y2Y2Mjk0NzEy */ */
import { PartialType } from '@nestjs/swagger';
import { CreateReminderDto } from './create-reminder.dto';

export class UpdateReminderDto extends PartialType(CreateReminderDto) {}
