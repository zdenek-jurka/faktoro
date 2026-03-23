import { isSyncEnabled } from '@/constants/features';
import database from '@/db';
import SyncConflictModel from '@/model/SyncConflictModel';
import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';

export function usePendingSyncConflictCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isSyncEnabled) {
      setCount(0);
      return;
    }

    const subscription = database
      .get<SyncConflictModel>(SyncConflictModel.table)
      .query(Q.where('status', 'pending'))
      .observeCount()
      .subscribe((nextCount) => {
        setCount(nextCount);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return count;
}
