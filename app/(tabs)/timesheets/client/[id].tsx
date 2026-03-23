import { ClientTimesheetsList } from '@/components/timesheets/client-timesheets-list';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function ClientTimesheetsScreen() {
  const { id, backToClientId } = useLocalSearchParams<{ id: string; backToClientId?: string }>();
  return <ClientTimesheetsList clientId={id} backToClientId={backToClientId} />;
}
