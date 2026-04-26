import { Model } from '@nozbe/watermelondb';
import { children, date, field, readonly, text } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import type ClientAddressModel from './ClientAddressModel';
import type ClientPriceOverrideModel from './ClientPriceOverrideModel';

export default class ClientModel extends Model {
  static table = 'client';

  static associations: Associations = {
    client_address: { type: 'has_many', foreignKey: 'client_id' },
    client_price_override: { type: 'has_many', foreignKey: 'client_id' },
  };

  @text('name') name: string;
  @text('company_id') companyId?: string;
  @text('vat_number') vatNumber?: string;
  @field('is_company') isCompany: boolean;
  @field('is_vat_payer') isVatPayer: boolean;
  @text('email') email?: string;
  @text('phone') phone?: string;
  @text('notes') notes?: string;
  @text('export_language') exportLanguage?: string;
  @text('invoice_qr_type') invoiceQrType?: string;
  @text('invoice_default_export_format') invoiceDefaultExportFormat?: string;
  @text('invoice_payment_method') invoicePaymentMethod?: string;
  @field('invoice_due_days') invoiceDueDays?: number;
  @field('billing_interval_enabled') billingIntervalEnabled: boolean;
  @field('billing_interval_minutes') billingIntervalMinutes?: number;
  @text('timer_limit_mode') timerLimitMode?: string;
  @field('timer_soft_limit_minutes') timerSoftLimitMinutes?: number;
  @field('timer_hard_limit_minutes') timerHardLimitMinutes?: number;
  @field('is_archived') isArchived: boolean;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @children('client_address') clientAddresses: ClientAddressModel[];
  @children('client_price_override') clientPriceOverrides: ClientPriceOverrideModel[];
}
