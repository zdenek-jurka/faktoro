import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, text } from '@nozbe/watermelondb/decorators';

export default class CurrencySettingModel extends Model {
  static table = 'currency_setting';

  @text('code') code: string;
  @text('prefix') prefix?: string;
  @text('suffix') suffix?: string;
  @field('sort_order') sortOrder: number;
  @field('is_active') isActive: boolean;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
