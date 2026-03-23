import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import migrations from './migrations';
import modelClasses from './modelClasses';
import schema from './schema';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
  onSetUpError: (_error) => {
    // Database failed to load; app can show a recoverable error UI if needed.
  },
});

const database = new Database({
  adapter,
  modelClasses,
});

export default database;
