import { ClientTimeEntriesContent } from '@/components/time-tracking/client-time-entries-content';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function TimeEntriesByClientScreen() {
  const { id, backToClientId } = useLocalSearchParams<{ id: string; backToClientId?: string }>();
  return <ClientTimeEntriesContent clientId={id} backToClientId={backToClientId} />;
}
