import { Model } from '@nozbe/watermelondb';
import { Associations } from '@nozbe/watermelondb/Model';
import { date, field, readonly, relation, text } from '@nozbe/watermelondb/decorators';
import type InvoiceModel from './InvoiceModel';

export default class InvoiceItemModel extends Model {
  static table = 'invoice_item';

  static associations: Associations = {
    invoice: { type: 'belongs_to', key: 'invoice_id' },
  };

  @field('invoice_id') invoiceId: string;
  @text('source_kind') sourceKind: string;
  @text('source_id') sourceId?: string;
  @text('description') description: string;
  @field('quantity') quantity: number;
  @text('unit') unit?: string;
  @field('unit_price') unitPrice: number;
  @field('total_price') totalPrice: number;
  @field('vat_code_id') vatCodeId?: string;
  @field('vat_rate') vatRate?: number;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('invoice', 'invoice_id') invoice: InvoiceModel;
}
