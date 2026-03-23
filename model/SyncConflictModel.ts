import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, text } from '@nozbe/watermelondb/decorators';

export default class SyncConflictModel extends Model {
  static table = 'sync_conflict';

  @text('table_name') tableName: string;
  @text('record_id') recordId: string;
  @text('conflict_type') conflictType: string;
  @text('base_payload_json') basePayloadJson?: string;
  @text('local_payload_json') localPayloadJson?: string;
  @text('remote_payload_json') remotePayloadJson?: string;
  @text('conflicting_fields_json') conflictingFieldsJson?: string;
  @text('resolution_json') resolutionJson?: string;
  @text('status') status: string;
  @field('resolved_at') resolvedAt?: number;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
