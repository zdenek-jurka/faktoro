import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';

import modelClasses from './modelClasses';
import migrations from './migrations';
import schema from './schema';

const adapter = new LokiJSAdapter({
  schema,
  migrations,
  dbName: 'faktoro-web',
  useWebWorker: false,
  useIncrementalIndexedDB: true,
  onSetUpError: (_error) => {
    // Database failed to load; app can show a recoverable error UI if needed.
  },
});

const database = new Database({
  adapter,
  modelClasses,
});

export default database;
