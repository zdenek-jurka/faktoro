import { ActionEmptyState } from '@/components/ui/action-empty-state';
import { Q } from '@nozbe/watermelondb';
import type Database from '@nozbe/watermelondb/Database';
import React, { useEffect, useState } from 'react';

import { ClientList } from '@/components/clients';
import { useI18nContext } from '@/i18n/i18n-react';
import AppSettingsModel from '@/model/AppSettingsModel';
import ClientModel from '@/model/ClientModel';
import TimeEntryModel from '@/model/TimeEntryModel';
import {
  getDeviceSyncSettings,
  observeDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { escapeLike } from '@/utils/escape-like';
import { useRouter } from 'expo-router';

type ClientListContainerProps = {
  database: Database;

  searchQuery: string;

  onClientPress: (id: string) => void;

  headerComponent?: React.ReactElement;
};

function buildClientsQuery(database: Database, searchQuery: string) {
  const collection = database.get<ClientModel>(ClientModel.table);
  const q = searchQuery.trim();

  if (!q) {
    return collection.query(Q.where('is_archived', false), Q.sortBy('name', Q.asc));
  }

  const like = `%${escapeLike(q)}%`;

  return collection.query(
    Q.where('is_archived', false),
    Q.or(
      Q.where('name', Q.like(like)),
      Q.where('email', Q.like(like)),
      Q.where('notes', Q.like(like)),
      Q.where('company_id', Q.like(like)),
    ),
    Q.sortBy('name', Q.asc),
  );
}

export function ClientListContainer(props: ClientListContainerProps) {
  const router = useRouter();
  const { LL } = useI18nContext();
  const [clients, setClients] = useState<ClientModel[]>([]);
  const [runningEntries, setRunningEntries] = useState<TimeEntryModel[]>([]);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [defaultBillingInterval, setDefaultBillingInterval] = useState<number | null>(null);

  useEffect(() => {
    const query = buildClientsQuery(props.database, props.searchQuery);
    const subscription = query.observe().subscribe((newClients) => {
      setClients(newClients);
    });

    return () => subscription.unsubscribe();
  }, [props.database, props.searchQuery]);

  useEffect(() => {
    const subscription = props.database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('is_running', true))
      .observe()
      .subscribe(setRunningEntries);

    return () => subscription.unsubscribe();
  }, [props.database]);

  useEffect(() => {
    const loadDeviceSettings = async () => {
      const deviceSettings = await getDeviceSyncSettings();
      setLocalDeviceId(deviceSettings.syncDeviceId || null);
    };
    void loadDeviceSettings();

    const settingsSubscription = props.database
      .get<AppSettingsModel>(AppSettingsModel.table)
      .query()
      .observe()
      .subscribe((allSettings) => {
        if (allSettings.length === 0) {
          setDefaultBillingInterval(null);
          return;
        }
        setDefaultBillingInterval(allSettings[0].defaultBillingInterval ?? null);
      });

    const deviceSubscription = observeDeviceSyncSettings((deviceSettings) => {
      setLocalDeviceId(deviceSettings.syncDeviceId || null);
    });

    return () => {
      settingsSubscription.unsubscribe();
      deviceSubscription();
    };
  }, [props.database]);

  return (
    <ClientList
      clients={clients}
      runningEntries={runningEntries}
      localDeviceId={localDeviceId}
      defaultBillingInterval={defaultBillingInterval}
      searchQuery={props.searchQuery}
      onClientPress={props.onClientPress}
      headerComponent={props.headerComponent}
      emptyState={
        <ActionEmptyState
          iconName={props.searchQuery.trim().length === 0 ? 'person.badge.plus' : 'magnifyingglass'}
          title={
            props.searchQuery.trim().length === 0
              ? LL.clients.emptyTitle()
              : LL.common.noResultsTitle()
          }
          description={
            props.searchQuery.trim().length === 0
              ? LL.clients.emptyDescription()
              : LL.clients.noClientsSearch()
          }
          actionLabel={props.searchQuery.trim().length === 0 ? LL.clients.addNew() : undefined}
          onActionPress={
            props.searchQuery.trim().length === 0 ? () => router.push('/clients/add') : undefined
          }
        />
      }
    />
  );
}
