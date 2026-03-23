import { buildDefaultInvoicePdfHtml } from './default';
import type { BuildDefaultInvoicePdfHtmlInput } from './types';

export type InvoicePdfTemplateId = 'default';
export type { BuildDefaultInvoicePdfHtmlInput };

export type RenderInvoicePdfTemplateInput = BuildDefaultInvoicePdfHtmlInput & {
  templateId?: InvoicePdfTemplateId;
};

export function renderInvoicePdfTemplate(input: RenderInvoicePdfTemplateInput): string {
  const templateId = input.templateId || 'default';

  if (templateId === 'default') {
    return buildDefaultInvoicePdfHtml(input);
  }

  return buildDefaultInvoicePdfHtml(input);
}
