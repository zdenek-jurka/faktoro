import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, relation, text } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import ClientModel from './ClientModel';
import type PriceListItemModel from './PriceListItemModel';

export default class TimeEntryModel extends Model {
  static table = 'time_entry';

  static associations: Associations = {
    client: { type: 'belongs_to', key: 'client_id' },
    price_list_item: { type: 'belongs_to', key: 'price_list_item_id' },
    timesheet: { type: 'belongs_to', key: 'timesheet_id' },
  };

  @field('client_id') clientId: string;
  @text('description') description?: string;
  @field('start_time') startTime: number;
  @field('end_time') endTime?: number;
  @field('duration') duration?: number; // in seconds
  @field('is_running') isRunning: boolean;
  @field('is_paused') isPaused: boolean;
  @field('paused_at') pausedAt?: number;
  @field('total_paused_duration') totalPausedDuration?: number; // in seconds
  @field('running_device_id') runningDeviceId?: string;
  @text('running_device_name') runningDeviceName?: string;
  @field('source_device_id') sourceDeviceId?: string;
  @text('source_device_name') sourceDeviceName?: string;
  @field('timesheet_id') timesheetId?: string;
  @field('timesheet_duration') timesheetDuration?: number; // frozen rounded seconds for timesheet exports/views
  @field('price_list_item_id') priceListItemId?: string;
  @field('rate') rate?: number;
  @text('rate_currency') rateCurrency?: string;
  @field('timer_soft_limit_minutes') timerSoftLimitMinutes?: number;
  @field('timer_hard_limit_minutes') timerHardLimitMinutes?: number;
  @field('soft_limit_notified_at') softLimitNotifiedAt?: number;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('client', 'client_id') client: ClientModel;
  @relation('price_list_item', 'price_list_item_id') priceListItem?: PriceListItemModel;
}
