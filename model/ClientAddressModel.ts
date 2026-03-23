import { AddressType } from '@/db/schema';
import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, relation, text } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import ClientModel from './ClientModel';

export default class ClientAddressModel extends Model {
  static table = 'client_address';

  static associations: Associations = {
    client: { type: 'belongs_to', key: 'client_id' },
  };

  @field('client_id') clientId: string;
  @field('type') type: AddressType;
  @text('street') street: string;
  @text('street2') street2: string;
  @text('city') city: string;
  @text('postal_code') postalCode: string;
  @text('country') country: string;
  @field('is_default') isDefault: boolean;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('client', 'client_id') client: ClientModel;
}
