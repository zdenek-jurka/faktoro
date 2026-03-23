import { ActionEmptyState } from '@/components/ui/action-empty-state';
import database from '@/db';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { ClientModel, InvoiceItemModel, TimeEntryModel, TimesheetModel } from '@/model';
import { getTimesheets } from '@/repositories/timesheet-repository';
import { Q } from '@nozbe/watermelondb';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { TimesheetsClientList } from './timesheets-client-list';

export type ClientTimesheetGroup = {
  client: ClientModel;
  timesheetCount: number;
  entriesCount: number;
  remainingDuration: number;
};

type TimesheetsClientsListContainerProps = {
  searchQuery: string;
  onClientPress: (clientId: string) => void;
};

export function TimesheetsClientsListContainer({
  searchQuery,
  onClientPress,
}: TimesheetsClientsListContainerProps) {
  const router = useRouter();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const [clients, setClients] = useState<ClientModel[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetModel[]>([]);
  const [timesheetEntries, setTimesheetEntries] = useState<TimeEntryModel[]>([]);
  const [linkedTimesheetIds, setLinkedTimesheetIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timesheetsSubscription = getTimesheets().observe().subscribe(setTimesheets);

    return () => {
      timesheetsSubscription.unsubscribe();
    };
  }, []);

  const timesheetIds = useMemo(() => timesheets.map((timesheet) => timesheet.id), [timesheets]);
  const clientIds = useMemo(
    () => Array.from(new Set(timesheets.map((timesheet) => timesheet.clientId).filter(Boolean))),
    [timesheets],
  );

  useEffect(() => {
    if (clientIds.length === 0) {
      setClients([]);
      return;
    }

    const clientsSubscription = database
      .get<ClientModel>(ClientModel.table)
      .query(Q.where('id', Q.oneOf(clientIds)), Q.sortBy('name', Q.asc))
      .observe()
      .subscribe(setClients);

    return () => {
      clientsSubscription.unsubscribe();
    };
  }, [clientIds]);

  useEffect(() => {
    if (timesheetIds.length === 0) {
      setTimesheetEntries([]);
      return;
    }

    const entriesSubscription = database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('timesheet_id', Q.oneOf(timesheetIds)))
      .observe()
      .subscribe(setTimesheetEntries);

    return () => {
      entriesSubscription.unsubscribe();
    };
  }, [timesheetIds]);

  useEffect(() => {
    if (timesheetIds.length === 0) {
      setLinkedTimesheetIds(new Set());
      return;
    }

    const linkedTimesheetsSubscription = database
      .get<InvoiceItemModel>(InvoiceItemModel.table)
      .query(Q.where('source_kind', 'timesheet'), Q.where('source_id', Q.oneOf(timesheetIds)))
      .observe()
      .subscribe((items) => {
        const ids = new Set(
          items.map((item) => item.sourceId).filter((id): id is string => !!id?.trim()),
        );
        setLinkedTimesheetIds(ids);
      });

    return () => {
      linkedTimesheetsSubscription.unsubscribe();
    };
  }, [timesheetIds]);

  const groupedClients = useMemo<ClientTimesheetGroup[]>(() => {
    const statsByTimesheet = new Map<string, { duration: number; entries: number }>();

    for (const entry of timesheetEntries) {
      if (!entry.timesheetId) continue;
      const current = statsByTimesheet.get(entry.timesheetId) ?? { duration: 0, entries: 0 };
      current.duration += entry.timesheetDuration ?? entry.duration ?? 0;
      current.entries += 1;
      statsByTimesheet.set(entry.timesheetId, current);
    }

    const groupMap = new Map<string, ClientTimesheetGroup>();
    const clientsById = new Map(clients.map((client) => [client.id, client]));

    for (const timesheet of timesheets) {
      const client = clientsById.get(timesheet.clientId);
      if (!client) continue;

      if (!groupMap.has(client.id)) {
        groupMap.set(client.id, {
          client,
          timesheetCount: 0,
          entriesCount: 0,
          remainingDuration: 0,
        });
      }

      const group = groupMap.get(client.id)!;
      const stats = statsByTimesheet.get(timesheet.id) ?? { duration: 0, entries: 0 };
      group.timesheetCount += 1;
      group.entriesCount += stats.entries;
      if (!linkedTimesheetIds.has(timesheet.id)) {
        group.remainingDuration += stats.duration;
      }
    }

    return Array.from(groupMap.values()).sort((a, b) =>
      a.client.name.localeCompare(b.client.name, intlLocale),
    );
  }, [clients, intlLocale, linkedTimesheetIds, timesheetEntries, timesheets]);

  const filteredClients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return groupedClients;

    return groupedClients.filter(({ client }) => {
      const name = client.name.toLowerCase();
      const companyId = (client.companyId ?? '').toLowerCase();
      const email = (client.email ?? '').toLowerCase();
      return name.includes(query) || companyId.includes(query) || email.includes(query);
    });
  }, [groupedClients, searchQuery]);

  return (
    <TimesheetsClientList
      clients={filteredClients}
      searchQuery={searchQuery}
      onClientPress={onClientPress}
      emptyState={
        <ActionEmptyState
          iconName={searchQuery.trim().length === 0 ? 'clock.fill' : 'magnifyingglass'}
          title={
            searchQuery.trim().length === 0
              ? LL.timesheets.emptyTitle()
              : LL.common.noResultsTitle()
          }
          description={
            searchQuery.trim().length === 0
              ? LL.timesheets.emptyDescription()
              : LL.timesheets.noClientsSearch()
          }
          actionLabel={searchQuery.trim().length === 0 ? LL.timeTracking.title() : undefined}
          onActionPress={
            searchQuery.trim().length === 0 ? () => router.push('/time-tracking') : undefined
          }
        />
      }
    />
  );
}
