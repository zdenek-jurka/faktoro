import { Model } from '@nozbe/watermelondb';
import { children, date, field, readonly, relation, text } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import type ClientModel from './ClientModel';
import type TimeEntryModel from './TimeEntryModel';

export default class TimesheetModel extends Model {
  static table = 'timesheet';

  static associations: Associations = {
    client: { type: 'belongs_to', key: 'client_id' },
    time_entry: { type: 'has_many', foreignKey: 'timesheet_id' },
  };

  @field('client_id') clientId: string;
  @text('period_type') periodType: string;
  @field('period_from') periodFrom: number;
  @field('period_to') periodTo: number;
  @text('timesheet_number') timesheetNumber?: string;
  @text('label') label?: string;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('client', 'client_id') client: ClientModel;
  @children('time_entry') timeEntries: TimeEntryModel[];
}
