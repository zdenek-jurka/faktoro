import { escapeHtml, formatDate } from './shared';
import type { BuildDefaultInvoicePdfHtmlInput } from './types';
import { formatPrice } from '@/utils/price-utils';

export function buildDefaultInvoicePdfHtml(input: BuildDefaultInvoicePdfHtmlInput): string {
  const formatMoney = (value: number) => formatPrice(value, input.currency, input.locale);
  const documentTitle = input.labels.title;
  const watermarkHtml = input.watermarkText?.trim()
    ? `<div class="watermark">${escapeHtml(input.watermarkText.trim())}</div>`
    : '';
  const buildMultilinePartyHtml = (value?: string) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';
    return `<div class="party-line">${escapeHtml(trimmed).replace(/\n/g, '<br />')}</div>`;
  };
  const buildLabeledPartyValueHtml = (label: string, value?: string) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';
    return `<div class="party-line"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(trimmed)}</div>`;
  };
  const buildPartyAddressHtml = (party: BuildDefaultInvoicePdfHtmlInput['seller']) => {
    const cityLine = [party.postalCode, party.city].filter(Boolean).join(', ');
    return [party.address, party.street2, cityLine, party.country]
      .filter(Boolean)
      .map((line) => `<div class="party-line">${escapeHtml(line || '')}</div>`)
      .join('');
  };

  const rowHtml = input.items
    .map((item) => {
      const vatRate = item.vatRate ?? 0;
      const lineVat = item.totalPrice * (vatRate / 100);
      const lineGross = item.totalPrice + lineVat;
      const quantityWithUnit = item.unit
        ? `${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}`
        : escapeHtml(item.quantity);
      const unitPriceLine = item.unit
        ? `${escapeHtml(input.labels.unitPrice)}: ${formatMoney(item.unitPrice)} / ${escapeHtml(item.unit)}`
        : `${escapeHtml(input.labels.unitPrice)}: ${formatMoney(item.unitPrice)}`;
      if (!input.includeVat) {
        return `
          <tr>
            <td>
              <div class="item-description">${escapeHtml(item.description)}</div>
              <div class="item-secondary">${unitPriceLine}</div>
            </td>
            <td style="text-align:right">${quantityWithUnit}</td>
            <td style="text-align:right">${formatMoney(item.totalPrice)}</td>
          </tr>
        `;
      }

      return `
        <tr>
          <td>
            <div class="item-description">${escapeHtml(item.description)}</div>
            <div class="item-secondary">${unitPriceLine}</div>
          </td>
          <td style="text-align:right">${quantityWithUnit}</td>
          <td style="text-align:right">${escapeHtml(vatRate)}%</td>
          <td style="text-align:right">${formatMoney(item.totalPrice)}</td>
          <td style="text-align:right">${formatMoney(lineVat)}</td>
          <td style="text-align:right">${formatMoney(lineGross)}</td>
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
  const buyerReference = input.buyerReference?.trim();
  const buyerReferenceHtml = buyerReference
    ? buildLabeledPartyValueHtml(input.labels.buyerReference, buyerReference)
    : '';

  const invoiceMetaHtml = input.includeVat
    ? `
          <div class="meta-card">
            <div class="meta-label">${escapeHtml(input.labels.taxableSupplyDate)}</div>
            <div class="meta-value">${formatDate(input.taxableAt || input.issueAt, input.locale)}</div>
          </div>
      `
    : '';

  const itemsTableHeadHtml = input.includeVat
    ? `
            <tr>
              <th>${escapeHtml(input.labels.itemDescription)}</th>
              <th style="text-align:right">${escapeHtml(input.labels.quantity)} / ${escapeHtml(input.labels.unit)}</th>
              <th style="text-align:right">${escapeHtml(input.labels.vat)}</th>
              <th style="text-align:right">${escapeHtml(input.labels.withoutVat)}</th>
              <th style="text-align:right">${escapeHtml(input.labels.vatAmount)}</th>
              <th style="text-align:right">${escapeHtml(input.labels.withVat)}</th>
            </tr>
      `
    : `
            <tr>
              <th>${escapeHtml(input.labels.itemDescription)}</th>
              <th style="text-align:right">${escapeHtml(input.labels.quantity)} / ${escapeHtml(input.labels.unit)}</th>
              <th style="text-align:right">${escapeHtml(input.labels.total)}</th>
            </tr>
      `;

  const totalsHtml = input.includeVat
    ? `
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
      `
    : `
          <div class="totals-table">
            <table>
              <tbody>
                <tr>
                  <td style="text-align:right">${escapeHtml(input.labels.subtotal)}</td>
                  <td style="text-align:right">${formatMoney(input.subtotal)}</td>
                </tr>
                <tr>
                  <td style="text-align:right">${escapeHtml(input.labels.total)}</td>
                  <td style="text-align:right">${formatMoney(input.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
      `;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; color: #111111; background: #ffffff; }
          .page-shell { position: relative; padding: 30px; box-sizing: border-box; overflow: hidden; }
          .page-content { position: relative; z-index: 1; }
          .watermark-layer { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; overflow: hidden; pointer-events: none; }
          .watermark { width: 160%; text-align: center; transform: rotate(-24deg); font-size: 96px; font-weight: 900; letter-spacing: 8px; color: rgba(185, 28, 28, 0.14); white-space: nowrap; text-transform: uppercase; }
          .header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: 18px; }
          .title-wrap { flex:1; min-width:0; text-align:right; padding-left: 16px; }
          .title { font-size: 30px; font-weight: 800; letter-spacing: .4px; margin: 0; }
          .title-sub { font-size: 12px; color: #1f2937; margin-top: 4px; }
          .logo-box { text-align:left; flex: 0 0 5cm; max-width: 5cm; min-width: 0; }
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
          .item-description { font-weight: 600; }
          .item-secondary { font-size: 10px; color:#374151; margin-top: 4px; }
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
          .footer-note { margin-top: 14px; font-size: 12px; color:#111111; white-space: pre-line; border-top:1px solid #444444; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="page-shell">
        ${watermarkHtml ? `<div class="watermark-layer">${watermarkHtml}</div>` : ''}
        <div class="page-content">
        <div class="header">
          <div class="logo-box">${input.logoHtml}</div>
          <div class="title-wrap">
            <h1 class="title">${escapeHtml(documentTitle)}</h1>
            <div class="title-sub">${escapeHtml(input.labels.invoiceNumber)}: ${escapeHtml(input.invoiceNumber)}</div>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-card">
            <div class="meta-label">${escapeHtml(input.labels.issueDate)}</div>
            <div class="meta-value">${formatDate(input.issueAt, input.locale)}</div>
          </div>
          ${invoiceMetaHtml}
          <div class="meta-card">
            <div class="meta-label">${escapeHtml(input.labels.dueDate)}</div>
            <div class="meta-value">${formatDate(input.dueAt, input.locale)}</div>
          </div>
        </div>

        <div class="parties">
          <div class="party">
            <div class="party-title">${escapeHtml(input.labels.supplier)}</div>
            <div class="party-name">${escapeHtml(input.seller.name || '-')}</div>
            ${buildPartyAddressHtml(input.seller) || '<div class="party-line">-</div>'}
            ${buildLabeledPartyValueHtml(input.labels.companyId, input.seller.companyId)}
            ${buildLabeledPartyValueHtml(input.labels.vatNumber, input.seller.vatNumber)}
            ${buildMultilinePartyHtml(input.seller.registrationNote)}
            ${input.seller.email ? `<div class="party-line">${escapeHtml(input.seller.email)}</div>` : ''}
          </div>
          <div class="party">
            <div class="party-title">${escapeHtml(input.labels.buyer)}</div>
            <div class="party-name">${escapeHtml(input.buyer.name || '-')}</div>
            ${buildPartyAddressHtml(input.buyer) || '<div class="party-line">-</div>'}
            ${buyerReferenceHtml}
            ${buildLabeledPartyValueHtml(input.labels.companyId, input.buyer.companyId)}
            ${buildLabeledPartyValueHtml(input.labels.vatNumber, input.buyer.vatNumber)}
            ${input.buyer.email ? `<div class="party-line">${escapeHtml(input.buyer.email)}</div>` : ''}
            ${input.buyer.phone ? `<div class="party-line">${escapeHtml(input.buyer.phone)}</div>` : ''}
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
            ${itemsTableHeadHtml}
          </thead>
          <tbody>${rowHtml}</tbody>
        </table>

        <div class="totals-wrap">
          ${input.paymentQrHtml ? `<div class="qr-slot">${input.paymentQrHtml}</div>` : ''}
          ${totalsHtml}
        </div>

        <div class="footer-note">${escapeHtml(input.footerNote || '')}</div>
        </div>
        </div>
      </body>
    </html>
  `;
}
