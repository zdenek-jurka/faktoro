import { escapeHtml, formatDate } from './shared';
import type { BuildDefaultInvoicePdfHtmlInput } from './types';
import { formatPrice } from '@/utils/price-utils';

export function buildDefaultInvoicePdfHtml(input: BuildDefaultInvoicePdfHtmlInput): string {
  const formatMoney = (value: number) => formatPrice(value, input.currency, input.locale);

  const rowHtml = input.items
    .map((item) => {
      const vatRate = item.vatRate ?? 0;
      return `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td style="text-align:right">${escapeHtml(item.quantity)}</td>
          <td style="text-align:right">${escapeHtml(vatRate)}%</td>
          <td style="text-align:right">${formatMoney(item.unitPrice)}</td>
          <td style="text-align:right">${formatMoney(item.totalPrice)}</td>
        </tr>
      `;
    })
    .join('');

  const vatSummary = new Map<number, { base: number; vat: number; total: number }>();
  for (const item of input.items) {
    const rate = item.vatRate ?? 0;
    const base = item.totalPrice;
    const vat = base * (rate / 100);
    const current = vatSummary.get(rate) ?? { base: 0, vat: 0, total: 0 };
    current.base += base;
    current.vat += vat;
    current.total += base + vat;
    vatSummary.set(rate, current);
  }

  const vatSummaryHtml = Array.from(vatSummary.entries())
    .sort((a, b) => a[0] - b[0])
    .map(
      ([rate, values]) => `
        <tr>
          <td style="text-align:right">${rate}%</td>
          <td style="text-align:right">${formatMoney(values.base)}</td>
          <td style="text-align:right">${formatMoney(values.vat)}</td>
          <td style="text-align:right">${formatMoney(values.total)}</td>
        </tr>
      `,
    )
    .join('');

  const variableSymbol =
    input.variableSymbol || input.invoiceNumber.replace(/\D/g, '').slice(0, 10) || '-';

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 30px; color: #111111; }
          .header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: 18px; }
          .title-wrap { flex:1; min-width:0; text-align:right; padding-left: 16px; }
          .title { font-size: 30px; font-weight: 800; letter-spacing: .4px; margin: 0; }
          .title-sub { font-size: 12px; color: #1f2937; margin-top: 4px; }
          .logo-box { text-align:left; min-width: 180px; max-width: 220px; }
          .meta-grid { display:flex; gap: 10px; margin-bottom: 16px; }
          .meta-card { flex: 1; border:1px solid #444444; border-radius: 10px; padding: 10px 12px; }
          .meta-label { font-size: 10px; text-transform: uppercase; color:#1f2937; margin-bottom: 4px; }
          .meta-value { font-size: 13px; font-weight: 700; color:#111111; }
          .pay-card { border:1px solid #111111; background:#e5e7eb; border-radius: 10px; padding: 12px; margin-top: 6px; margin-bottom: 14px; display:flex; justify-content:space-between; align-items:flex-start; }
          .pay-amount { font-size: 26px; font-weight: 800; color:#111111; }
          .pay-total { text-align:right; }
          .pay-right { width: 280px; font-size:11px; color:#111111; line-height:1.45; }
          .bank-row { display:flex; justify-content:space-between; gap:10px; }
          .bank-label { color:#1f2937; }
          .bank-value { text-align:right; font-weight:600; min-width:140px; }
          table { width:100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border-bottom:1px solid #4b5563; padding: 8px 6px; font-size: 12px; color:#111111; }
          th { text-align:left; color:#111111; background:#d1d5db; }
          .totals-wrap { display:flex; justify-content:space-between; align-items:flex-end; gap: 16px; margin-top: 10px; }
          .qr-slot { min-width: 120px; }
          .totals-table { width: 340px; border:1px solid #111111; border-radius: 10px; overflow:hidden; margin-left:auto; }
          .totals-table table { margin:0; }
          .totals-table td { padding:7px 10px; font-size:12px; }
          .totals-table tr:last-child td { font-weight: 800; font-size: 14px; color:#111111; background:#e5e7eb; }
          .parties { display:flex; gap: 12px; margin-top: 18px; margin-bottom: 16px; }
          .party { flex:1; border:1px solid #444444; border-radius:10px; padding:10px 12px; }
          .party-title { font-size:10px; text-transform: uppercase; color:#1f2937; margin-bottom: 6px; }
          .party-name { font-size:13px; font-weight:700; margin-bottom:4px; }
          .party-line { font-size:11px; color:#111111; line-height:1.45; }
          .party-bank { border-top:1px solid #444444; margin-top:8px; padding-top:6px; }
          .party-bank .bank-value { min-width:110px; }
          .footer-note { margin-top: 14px; font-size: 11px; color:#111111; white-space: pre-line; border-top:1px solid #444444; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-box">${input.logoHtml}</div>
          <div class="title-wrap">
            <h1 class="title">${escapeHtml(input.labels.invoiceNumber)}: ${escapeHtml(input.invoiceNumber)}</h1>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-card">
            <div class="meta-label">${escapeHtml(input.labels.issueDate)}</div>
            <div class="meta-value">${formatDate(input.issueAt, input.locale)}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">${escapeHtml(input.labels.taxableSupplyDate)}</div>
            <div class="meta-value">${formatDate(input.taxableAt || input.issueAt, input.locale)}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">${escapeHtml(input.labels.dueDate)}</div>
            <div class="meta-value">${formatDate(input.dueAt, input.locale)}</div>
          </div>
        </div>

        <div class="parties">
          <div class="party">
            <div class="party-title">${escapeHtml(input.labels.supplier)}</div>
            <div class="party-name">${escapeHtml(input.seller.name || '-')}</div>
            <div class="party-line">${escapeHtml(input.seller.addressLine || '-')}</div>
            <div class="party-line">${escapeHtml(input.seller.companyId || '')}</div>
            <div class="party-line">${escapeHtml(input.seller.vatNumber || '')}</div>
            <div class="party-line">${escapeHtml(input.seller.email || '')}</div>
          </div>
          <div class="party">
            <div class="party-title">${escapeHtml(input.labels.buyer)}</div>
            <div class="party-name">${escapeHtml(input.buyer.name || '-')}</div>
            <div class="party-line">${escapeHtml(input.buyer.addressLine || '-')}</div>
            <div class="party-line">${escapeHtml(input.buyer.companyId || '')}</div>
            <div class="party-line">${escapeHtml(input.buyer.vatNumber || '')}</div>
            <div class="party-line">${escapeHtml(input.buyer.email || '')}</div>
            <div class="party-line">${escapeHtml(input.buyer.phone || '')}</div>
          </div>
        </div>

        <div class="pay-card">
          <div class="pay-right">
            <div class="bank-row"><span class="bank-label">${escapeHtml(input.labels.reference)}</span><span class="bank-value">${escapeHtml(variableSymbol)}</span></div>
            <div class="bank-row"><span class="bank-label">${escapeHtml(input.labels.account)}</span><span class="bank-value">${escapeHtml(input.bankAccount || '')}</span></div>
            <div class="bank-row"><span class="bank-label">${escapeHtml(input.labels.iban)}</span><span class="bank-value">${escapeHtml(input.iban || '')}</span></div>
            <div class="bank-row"><span class="bank-label">${escapeHtml(input.labels.swift)}</span><span class="bank-value">${escapeHtml(input.swift || '')}</span></div>
          </div>
          <div class="pay-total">
            <div class="meta-label">${escapeHtml(input.labels.total)}</div>
            <div class="pay-amount">${formatMoney(input.total)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>${escapeHtml(input.labels.itemDescription)}</th>
              <th style="text-align:right">${escapeHtml(input.labels.quantity)}</th>
              <th style="text-align:right">${escapeHtml(input.labels.vat)}</th>
              <th style="text-align:right">${escapeHtml(input.labels.unitPrice)}</th>
              <th style="text-align:right">${escapeHtml(input.labels.lineTotal)}</th>
            </tr>
          </thead>
          <tbody>${rowHtml}</tbody>
        </table>

        <div class="totals-wrap">
          ${input.paymentQrHtml ? `<div class="qr-slot">${input.paymentQrHtml}</div>` : ''}
          <div class="totals-table">
            <table>
              <thead>
                <tr>
                  <th style="text-align:right">${escapeHtml(input.labels.vatPercent)}</th>
                  <th style="text-align:right">${escapeHtml(input.labels.taxBase)}</th>
                  <th style="text-align:right">${escapeHtml(input.labels.vat)}</th>
                  <th style="text-align:right">${escapeHtml(input.labels.total)}</th>
                </tr>
              </thead>
              <tbody>
                ${
                  vatSummaryHtml ||
                  `<tr><td style="text-align:right">0%</td><td style="text-align:right">${formatMoney(input.subtotal)}</td><td style="text-align:right">${formatMoney(0)}</td><td style="text-align:right">${formatMoney(input.total)}</td></tr>`
                }
                <tr>
                  <td colspan="3" style="text-align:right">${escapeHtml(input.labels.total)}</td>
                  <td style="text-align:right">${formatMoney(input.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="footer-note">${escapeHtml(input.footerNote || '')}</div>
      </body>
    </html>
  `;
}
