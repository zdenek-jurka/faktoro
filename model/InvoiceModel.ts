import { Model } from '@nozbe/watermelondb';
import { Associations } from '@nozbe/watermelondb/Model';
import { children, date, field, readonly, relation, text } from '@nozbe/watermelondb/decorators';
import type ClientModel from './ClientModel';
import type InvoiceItemModel from './InvoiceItemModel';

export default class InvoiceModel extends Model {
  static table = 'invoice';

  static associations: Associations = {
    client: { type: 'belongs_to', key: 'client_id' },
    invoice_item: { type: 'has_many', foreignKey: 'invoice_id' },
  };

  @field('client_id') clientId: string;
  @text('invoice_number') invoiceNumber: string;
  @field('issued_at') issuedAt: number;
  @field('taxable_at') taxableAt?: number;
  @field('due_at') dueAt?: number;
  @text('currency') currency: string;
  @text('payment_method') paymentMethod?: string;
  @text('status') status: string;
  @text('header_note') headerNote?: string;
  @text('footer_note') footerNote?: string;
  @text('seller_snapshot_json') sellerSnapshotJson?: string;
  @text('buyer_snapshot_json') buyerSnapshotJson?: string;
  @field('last_exported_at') lastExportedAt?: number;
  @field('subtotal') subtotal: number;
  @field('total') total: number;
  @readonly @date('created_at') createdAt: Date;
  @readonly @date('updated_at') updatedAt: Date;

  @relation('client', 'client_id') client: ClientModel;
  @children('invoice_item') items: InvoiceItemModel[];
}
