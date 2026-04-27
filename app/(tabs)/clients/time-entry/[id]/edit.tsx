import { TimeEntryEditScreenContent } from '@/components/time-tracking/time-entry-edit-screen-content';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function ClientTimeEntryEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TimeEntryEditScreenContent entryId={id} />;
}
