import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, relation } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import ClientModel from './ClientModel';
import PriceListItemModel from './PriceListItemModel';

export default class ClientPriceOverrideModel extends Model {
  static table = 'client_price_override';

  static associations: Associations = {
    client: { type: 'belongs_to', key: 'client_id' },
    price_list_item: { type: 'belongs_to', key: 'price_list_item_id' },
  };

  @field('client_id') clientId: string;
  @field('price_list_item_id') priceListItemId: string;
  @field('custom_price') customPrice: number;
  @field('custom_price_currency') customPriceCurrency?: string;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('client', 'client_id') client: ClientModel;
  @relation('price_list_item', 'price_list_item_id') priceListItem: PriceListItemModel;
}
