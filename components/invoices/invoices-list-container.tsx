import database from '@/db';
import { ActionEmptyState } from '@/components/ui/action-empty-state';
import { ClientModel, InvoiceModel } from '@/model';
import { getInvoices } from '@/repositories/invoice-repository';
import { getBuyerDisplayName, parseBuyerSnapshotJson } from '@/utils/invoice-buyer';
import { Q } from '@nozbe/watermelondb';
import { useI18nContext } from '@/i18n/i18n-react';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { InvoicesList } from './invoices-list';

type InvoicesListContainerProps = {
  clientId?: string;
  searchQuery: string;
  onInvoicePress: (id: string) => void;
};

export function InvoicesListContainer({
  clientId,
  searchQuery,
  onInvoicePress,
}: InvoicesListContainerProps) {
  const router = useRouter();
  const { LL } = useI18nContext();
  const [invoices, setInvoices] = useState<InvoiceModel[]>([]);
  const [clients, setClients] = useState<ClientModel[]>([]);

  useEffect(() => {
    const invoicesQuery = clientId
      ? database
          .get<InvoiceModel>(InvoiceModel.table)
          .query(Q.where('client_id', clientId), Q.sortBy('issued_at', Q.desc))
      : getInvoices();

    const invoicesSubscription = invoicesQuery
      .observeWithColumns([
        'client_id',
        'invoice_number',
        'buyer_snapshot_json',
        'issued_at',
        'currency',
        'total',
        'status',
        'correction_kind',
        'seller_snapshot_json',
      ])
      .subscribe(setInvoices);

    return () => {
      invoicesSubscription.unsubscribe();
    };
  }, [clientId]);

  const invoiceClientIds = useMemo(
    () => Array.from(new Set(invoices.map((invoice) => invoice.clientId).filter(Boolean))),
    [invoices],
  );

  useEffect(() => {
    if (invoiceClientIds.length === 0) {
      setClients([]);
      return;
    }

    const clientsSubscription = database
      .get<ClientModel>(ClientModel.table)
      .query(Q.where('id', Q.oneOf(invoiceClientIds)))
      .observeWithColumns(['name'])
      .subscribe(setClients);

    return () => {
      clientsSubscription.unsubscribe();
    };
  }, [invoiceClientIds]);

  const clientNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const client of clients) map.set(client.id, client.name);
    return map;
  }, [clients]);
  const invoiceBuyerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const invoice of invoices) {
      const buyerName = getBuyerDisplayName(parseBuyerSnapshotJson(invoice.buyerSnapshotJson));
      if (buyerName) {
        map.set(invoice.id, buyerName);
      }
    }
    return map;
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return invoices;

    return invoices.filter((invoice) => {
      const invoiceNumber = invoice.invoiceNumber?.toLocaleLowerCase() || '';
      const buyerName = (
        clientNameById.get(invoice.clientId) ||
        invoiceBuyerNameById.get(invoice.id) ||
        ''
      ).toLocaleLowerCase();
      return invoiceNumber.includes(query) || buyerName.includes(query);
    });
  }, [clientNameById, invoiceBuyerNameById, invoices, searchQuery]);

  return (
    <InvoicesList
      invoices={filteredInvoices}
      clientNameById={clientNameById}
      invoiceBuyerNameById={invoiceBuyerNameById}
      onInvoicePress={onInvoicePress}
      emptyState={
        <ActionEmptyState
          iconName={searchQuery.trim().length === 0 ? 'doc.badge.plus' : 'magnifyingglass'}
          title={
            searchQuery.trim().length === 0 ? LL.invoices.emptyTitle() : LL.common.noResultsTitle()
          }
          description={
            searchQuery.trim().length === 0 ? LL.invoices.emptyDescription() : LL.invoices.empty()
          }
          actionLabel={searchQuery.trim().length === 0 ? LL.invoices.createInvoice() : undefined}
          onActionPress={
            searchQuery.trim().length === 0 ? () => router.push('/invoices/new') : undefined
          }
        />
      }
    />
  );
}
