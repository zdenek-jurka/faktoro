import { ClientTimeEntriesContent } from '@/components/time-tracking/client-time-entries-content';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function ClientTimeEntriesInClientsTab() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClientTimeEntriesContent clientId={id} />;
}
