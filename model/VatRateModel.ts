import { Model } from '@nozbe/watermelondb';
import { date, field, readonly } from '@nozbe/watermelondb/decorators';

export default class VatRateModel extends Model {
  static table = 'vat_rate';

  @field('vat_code_id') vatCodeId?: string;
  @field('rate_percent') ratePercent: number;
  @field('valid_from') validFrom: number;
  @field('valid_to') validTo?: number;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
