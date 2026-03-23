import { date, field, text } from '@nozbe/watermelondb/decorators';
import { Model } from '@nozbe/watermelondb';

export default class ConfigStorageModel extends Model {
  static table = 'config_storage';

  @text('config_key') configKey: string;
  @text('config_value') configValue: string;

  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;

  @date('created_at') created!: Date;
  @date('updated_at') updated!: Date;
}
