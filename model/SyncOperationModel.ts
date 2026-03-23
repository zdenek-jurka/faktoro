import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, text } from '@nozbe/watermelondb/decorators';

export default class SyncOperationModel extends Model {
  static table = 'sync_operation';

  @text('op_id') opId: string;
  @text('table_name') tableName: string;
  @text('record_id') recordId: string;
  @text('operation_type') operationType: string;
  @text('payload_json') payloadJson?: string;
  @field('base_version') baseVersion?: number;
  @field('is_synced') isSynced: boolean;
  @field('retry_count') retryCount: number;
  @field('synced_at') syncedAt?: number;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
