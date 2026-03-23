import { Model } from '@nozbe/watermelondb';
import { children, date, field, readonly, text } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import type ClientPriceOverrideModel from './ClientPriceOverrideModel';
import type TimeEntryModel from './TimeEntryModel';

export default class PriceListItemModel extends Model {
  static table = 'price_list_item';

  static associations: Associations = {
    client_price_overrides: { type: 'has_many', foreignKey: 'price_list_item_id' },
    time_entries: { type: 'has_many', foreignKey: 'price_list_item_id' },
  };

  @text('name') name: string;
  @text('description') description?: string;
  @field('default_price') defaultPrice: number;
  @text('default_price_currency') defaultPriceCurrency?: string;
  @text('unit') unit: string;
  @field('vat_code_id') vatCodeId?: string;
  @text('vat_name') vatName?: string;
  @field('is_active') isActive: boolean;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @children('client_price_override') clientPriceOverrides: ClientPriceOverrideModel[];
  @children('time_entry') timeEntries: TimeEntryModel[];
}
