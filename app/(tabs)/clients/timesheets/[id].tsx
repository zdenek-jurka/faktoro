import { ClientTimesheetsList } from '@/components/timesheets/client-timesheets-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';

export default function ClientTimesheetsInClientsTab() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return (
    <ClientTimesheetsList
      clientId={id}
      onTimesheetPress={(timesheetId) => router.push(`/clients/timesheets/detail/${timesheetId}`)}
    />
  );
}
