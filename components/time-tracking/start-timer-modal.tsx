import { useI18nContext } from '@/i18n/i18n-react';
import { ClientModel, PriceListItemModel, TimeEntryModel } from '@/model';
import { getEffectivePriceDetails } from '@/repositories/client-price-override-repository';
import {
  createTimeEntry,
  TIME_ENTRY_LOCAL_RUNNING_EXISTS,
} from '@/repositories/time-entry-repository';
import type { ClientAddReturnTarget } from '@/utils/client-add-navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { TimeEntryFormModal } from './time-entry-form-modal';

type StartTimerModalProps = {
  visible: boolean;
  onClose: () => void;
  clients: ClientModel[];
  priceListItems: PriceListItemModel[];
  fixedClientId?: string;
  fixedClientName?: string;
  addClientReturnTo?: ClientAddReturnTarget;
  addClientReturnToId?: string;
  onStarted?: (entry: TimeEntryModel) => void;
};

export function StartTimerModal({
  visible,
  onClose,
  clients,
  priceListItems,
  fixedClientId,
  fixedClientName,
  addClientReturnTo,
  addClientReturnToId,
  onStarted,
}: StartTimerModalProps) {
  const { LL } = useI18nContext();
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedPriceListItemId, setSelectedPriceListItemId] = useState('');
  const [description, setDescription] = useState('');

  const hasFixedClient = !!fixedClientId;

  useEffect(() => {
    if (!visible) return;

    if (hasFixedClient && fixedClientId) {
      setSelectedClientId(fixedClientId);
      return;
    }

    setSelectedClientId('');
    setSelectedPriceListItemId('');
    setDescription('');
  }, [visible, hasFixedClient, fixedClientId]);

  const resolvedFixedClientName = useMemo(() => {
    if (!hasFixedClient) return undefined;
    if (fixedClientName) return fixedClientName;
    return clients.find((client) => client.id === fixedClientId)?.name ?? '';
  }, [hasFixedClient, fixedClientId, fixedClientName, clients]);

  const handleStart = async () => {
    if (!hasFixedClient && clients.length === 0) {
      Alert.alert(LL.common.error(), LL.timeTracking.addClientFirst());
      onClose();
      return;
    }

    if (!selectedClientId) {
      Alert.alert(LL.common.error(), LL.timeTracking.errorSelectClient());
      return;
    }

    try {
      let rate: number | undefined;
      let rateCurrency: string | undefined;
      if (selectedPriceListItemId) {
        const effectiveRate = await getEffectivePriceDetails(
          selectedClientId,
          selectedPriceListItemId,
        );
        rate = effectiveRate.price;
        rateCurrency = effectiveRate.currency;
      }

      const entry = await createTimeEntry({
        clientId: selectedClientId,
        description: description.trim() || undefined,
        startTime: Date.now(),
        priceListItemId: selectedPriceListItemId || undefined,
        rate,
        rateCurrency,
      });

      setDescription('');
      setSelectedPriceListItemId('');
      onStarted?.(entry);
      onClose();
    } catch (error) {
      console.error('Error starting timer:', error);
      if (error instanceof Error && error.message === TIME_ENTRY_LOCAL_RUNNING_EXISTS) {
        Alert.alert(LL.common.error(), LL.timeTracking.errorRunningTimerAlreadyExists());
        return;
      }
      Alert.alert(LL.common.error(), LL.timeTracking.errorStartTimer());
    }
  };

  return (
    <TimeEntryFormModal
      visible={visible}
      mode="create"
      title={LL.timeTracking.startTimer()}
      submitLabel={LL.timeTracking.start()}
      onClose={onClose}
      onSubmit={handleStart}
      clients={clients}
      selectedClientId={selectedClientId}
      onClientChange={setSelectedClientId}
      fixedClientName={resolvedFixedClientName}
      description={description}
      onDescriptionChange={setDescription}
      priceListItems={priceListItems}
      selectedPriceListItemId={selectedPriceListItemId}
      onPriceListItemChange={setSelectedPriceListItemId}
      addClientReturnTo={addClientReturnTo}
      addClientReturnToId={addClientReturnToId}
      disableSubmit={!selectedClientId && clients.length > 0}
    />
  );
}
