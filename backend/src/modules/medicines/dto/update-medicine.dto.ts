/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9tZWRpY2luZXMvZHRvL3VwZGF0ZS1tZWRpY2luZS5kdG8udHN8MjAyNi0wOXwyODIzOGExYTUy */ */
import { PartialType } from '@nestjs/swagger';
import { CreateMedicineDto } from './create-medicine.dto';

export class UpdateMedicineDto extends PartialType(CreateMedicineDto) {}
