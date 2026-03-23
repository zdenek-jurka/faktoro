import {
  renderInvoicePdfTemplate,
  type BuildDefaultInvoicePdfHtmlInput,
  type InvoicePdfTemplateId,
} from '@/templates/invoice/pdf';

export type InvoiceTemplateId = InvoicePdfTemplateId;

export type RenderInvoicePdfInput = BuildDefaultInvoicePdfHtmlInput & {
  templateId?: InvoiceTemplateId;
};

export function renderInvoicePdfHtml(input: RenderInvoicePdfInput): string {
  // Abstraction seam for future DB-backed template loading.
  // Repository can later resolve template metadata/content, then render.
  return renderInvoicePdfTemplate(input);
}
