import {
  addColumns,
  createTable,
  schemaMigrations,
  unsafeExecuteSql,
} from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'time_entry',
          columns: [
            { name: 'client_id', type: 'string', isIndexed: true },
            { name: 'description', type: 'string' },
            { name: 'start_time', type: 'number' },
            { name: 'end_time', type: 'number', isOptional: true },
            { name: 'duration', type: 'number', isOptional: true },
            { name: 'is_running', type: 'boolean' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'client',
          columns: [
            { name: 'billing_interval_enabled', type: 'boolean' },
            { name: 'billing_interval_minutes', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        createTable({
          name: 'app_settings',
          columns: [
            { name: 'language', type: 'string' },
            { name: 'default_billing_interval', type: 'number', isOptional: true },
            { name: 'invoice_company_name', type: 'string', isOptional: true },
            { name: 'invoice_address', type: 'string', isOptional: true },
            { name: 'invoice_city', type: 'string', isOptional: true },
            { name: 'invoice_postal_code', type: 'string', isOptional: true },
            { name: 'invoice_country', type: 'string', isOptional: true },
            { name: 'invoice_company_id', type: 'string', isOptional: true },
            { name: 'invoice_vat_number', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: 'time_entry',
          columns: [
            { name: 'is_paused', type: 'boolean' },
            { name: 'paused_at', type: 'number', isOptional: true },
            { name: 'total_paused_duration', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [
            { name: 'invoice_email', type: 'string', isOptional: true },
            { name: 'invoice_phone', type: 'string', isOptional: true },
            { name: 'invoice_website', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 7,
      steps: [
        createTable({
          name: 'price_list_item',
          columns: [
            { name: 'name', type: 'string' },
            { name: 'description', type: 'string', isOptional: true },
            { name: 'default_price', type: 'number' },
            { name: 'unit', type: 'string' },
            { name: 'is_active', type: 'boolean' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'client_price_override',
          columns: [
            { name: 'client_id', type: 'string', isIndexed: true },
            { name: 'price_list_item_id', type: 'string', isIndexed: true },
            { name: 'custom_price', type: 'number' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'time_entry',
          columns: [
            { name: 'price_list_item_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'rate', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: 'client',
          columns: [{ name: 'is_vat_payer', type: 'boolean' }],
        }),
      ],
    },
    {
      toVersion: 9,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [{ name: 'is_vat_payer', type: 'boolean' }],
        }),
      ],
    },
    {
      toVersion: 10,
      steps: [
        addColumns({
          table: 'client_address',
          columns: [{ name: 'street2', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 11,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [
            { name: 'sync_server_url', type: 'string', isOptional: true },
            { name: 'sync_device_id', type: 'string', isOptional: true },
            { name: 'sync_device_name', type: 'string', isOptional: true },
            { name: 'sync_pairing_token', type: 'string', isOptional: true },
            { name: 'sync_auth_token', type: 'string', isOptional: true },
            { name: 'sync_is_registered', type: 'boolean', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 12,
      steps: [
        createTable({
          name: 'sync_operation',
          columns: [
            { name: 'op_id', type: 'string', isIndexed: true },
            { name: 'table_name', type: 'string', isIndexed: true },
            { name: 'record_id', type: 'string', isIndexed: true },
            { name: 'operation_type', type: 'string' },
            { name: 'payload_json', type: 'string', isOptional: true },
            { name: 'base_version', type: 'number', isOptional: true },
            { name: 'is_synced', type: 'boolean' },
            { name: 'retry_count', type: 'number' },
            { name: 'synced_at', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'sync_conflict',
          columns: [
            { name: 'table_name', type: 'string', isIndexed: true },
            { name: 'record_id', type: 'string', isIndexed: true },
            { name: 'conflict_type', type: 'string' },
            { name: 'base_payload_json', type: 'string', isOptional: true },
            { name: 'local_payload_json', type: 'string', isOptional: true },
            { name: 'remote_payload_json', type: 'string', isOptional: true },
            { name: 'conflicting_fields_json', type: 'string', isOptional: true },
            { name: 'resolution_json', type: 'string', isOptional: true },
            { name: 'status', type: 'string', isIndexed: true },
            { name: 'resolved_at', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 13,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [{ name: 'sync_instance_id', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 14,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [{ name: 'sync_instance_key', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 15,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [{ name: 'sync_allow_plaintext', type: 'boolean', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 16,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [{ name: 'sync_auto_enabled', type: 'boolean', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 17,
      steps: [
        createTable({
          name: 'vat_rate',
          columns: [
            { name: 'rate_percent', type: 'number' },
            { name: 'valid_from', type: 'number', isIndexed: true },
            { name: 'valid_to', type: 'number', isOptional: true, isIndexed: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 18,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [{ name: 'invoice_street2', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 19,
      steps: [
        addColumns({
          table: 'vat_rate',
          columns: [{ name: 'name', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 20,
      steps: [
        createTable({
          name: 'vat_code',
          columns: [
            { name: 'name', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'vat_rate',
          columns: [{ name: 'vat_code_id', type: 'string', isOptional: true, isIndexed: true }],
        }),
      ],
    },
    {
      toVersion: 21,
      steps: [
        addColumns({
          table: 'price_list_item',
          columns: [{ name: 'vat_name', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 22,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [
            { name: 'app_lock_enabled', type: 'boolean', isOptional: true },
            { name: 'app_lock_biometric_enabled', type: 'boolean', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 23,
      steps: [
        addColumns({
          table: 'time_entry',
          columns: [
            { name: 'running_device_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'running_device_name', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 24,
      steps: [
        addColumns({
          table: 'time_entry',
          columns: [{ name: 'timesheet_id', type: 'string', isOptional: true, isIndexed: true }],
        }),
        createTable({
          name: 'timesheet',
          columns: [
            { name: 'client_id', type: 'string', isIndexed: true },
            { name: 'period_type', type: 'string' },
            { name: 'period_from', type: 'number', isIndexed: true },
            { name: 'period_to', type: 'number', isIndexed: true },
            { name: 'label', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 25,
      steps: [
        addColumns({
          table: 'time_entry',
          columns: [{ name: 'timesheet_duration', type: 'number', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 26,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [
            { name: 'invoice_bank_account', type: 'string', isOptional: true },
            { name: 'invoice_iban', type: 'string', isOptional: true },
            { name: 'invoice_swift', type: 'string', isOptional: true },
            { name: 'invoice_logo_uri', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'invoice',
          columns: [
            { name: 'client_id', type: 'string', isIndexed: true },
            { name: 'invoice_number', type: 'string', isIndexed: true },
            { name: 'issued_at', type: 'number', isIndexed: true },
            { name: 'due_at', type: 'number', isOptional: true },
            { name: 'currency', type: 'string' },
            { name: 'status', type: 'string', isIndexed: true },
            { name: 'header_note', type: 'string', isOptional: true },
            { name: 'footer_note', type: 'string', isOptional: true },
            { name: 'seller_snapshot_json', type: 'string', isOptional: true },
            { name: 'subtotal', type: 'number' },
            { name: 'total', type: 'number' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'invoice_item',
          columns: [
            { name: 'invoice_id', type: 'string', isIndexed: true },
            { name: 'source_kind', type: 'string' },
            { name: 'source_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'description', type: 'string' },
            { name: 'quantity', type: 'number' },
            { name: 'unit', type: 'string', isOptional: true },
            { name: 'unit_price', type: 'number' },
            { name: 'total_price', type: 'number' },
            { name: 'vat_rate', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 27,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [
            { name: 'invoice_series_prefix', type: 'string', isOptional: true },
            { name: 'invoice_series_next_number', type: 'number', isOptional: true },
            { name: 'invoice_series_padding', type: 'number', isOptional: true },
            { name: 'invoice_series_per_device', type: 'boolean', isOptional: true },
            { name: 'invoice_series_device_code', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 28,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [{ name: 'invoice_series_pattern', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 29,
      steps: [
        addColumns({
          table: 'invoice',
          columns: [{ name: 'taxable_at', type: 'number', isOptional: true, isIndexed: true }],
        }),
      ],
    },
    {
      toVersion: 30,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [{ name: 'invoice_qr_type', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 31,
      steps: [
        addColumns({
          table: 'client',
          columns: [{ name: 'export_language', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 32,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [{ name: 'invoice_default_export_format', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 33,
      steps: [
        addColumns({
          table: 'client',
          columns: [{ name: 'invoice_qr_type', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 34,
      steps: [
        addColumns({
          table: 'client',
          columns: [{ name: 'invoice_default_export_format', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 35,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [{ name: 'default_company_registry', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 36,
      steps: [
        addColumns({
          table: 'client',
          columns: [{ name: 'is_archived', type: 'boolean' }],
        }),
      ],
    },
    {
      toVersion: 37,
      steps: [
        createTable({
          name: 'config_storage',
          columns: [
            { name: 'config_key', type: 'string', isIndexed: true },
            { name: 'config_value', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 38,
      steps: [
        addColumns({
          table: 'invoice',
          columns: [{ name: 'payment_method', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 39,
      steps: [
        addColumns({
          table: 'price_list_item',
          columns: [{ name: 'vat_code_id', type: 'string', isOptional: true, isIndexed: true }],
        }),
        addColumns({
          table: 'invoice_item',
          columns: [{ name: 'vat_code_id', type: 'string', isOptional: true, isIndexed: true }],
        }),
      ],
    },
    {
      toVersion: 40,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [
            { name: 'timesheet_series_prefix', type: 'string', isOptional: true },
            { name: 'timesheet_series_pattern', type: 'string', isOptional: true },
            { name: 'timesheet_series_next_number', type: 'number', isOptional: true },
            { name: 'timesheet_series_padding', type: 'number', isOptional: true },
            { name: 'timesheet_series_per_device', type: 'boolean', isOptional: true },
            { name: 'timesheet_series_device_code', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'timesheet',
          columns: [
            { name: 'timesheet_number', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
    {
      toVersion: 41,
      steps: [
        unsafeExecuteSql(`
          insert into "config_storage" ("id", "_status", "_changed", "config_key", "config_value", "created_at", "updated_at")
          select 'device_sync.server_url', 'created', '', 'device_sync.server_url', trim(coalesce(legacy."sync_server_url", '')), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000)
          from (
            select * from "app_settings"
            order by case when "id" = 'app-settings-singleton' then 1 else 0 end desc, "updated_at" desc, "created_at" desc
            limit 1
          ) as legacy
          where trim(coalesce(legacy."sync_server_url", '')) != ''
            and not exists (select 1 from "config_storage" where "config_key" = 'device_sync.server_url');

          insert into "config_storage" ("id", "_status", "_changed", "config_key", "config_value", "created_at", "updated_at")
          select 'device_sync.instance_id', 'created', '', 'device_sync.instance_id', trim(coalesce(legacy."sync_instance_id", '')), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000)
          from (
            select * from "app_settings"
            order by case when "id" = 'app-settings-singleton' then 1 else 0 end desc, "updated_at" desc, "created_at" desc
            limit 1
          ) as legacy
          where trim(coalesce(legacy."sync_instance_id", '')) != ''
            and not exists (select 1 from "config_storage" where "config_key" = 'device_sync.instance_id');

          insert into "config_storage" ("id", "_status", "_changed", "config_key", "config_value", "created_at", "updated_at")
          select 'device_sync.device_id', 'created', '', 'device_sync.device_id', trim(coalesce(legacy."sync_device_id", '')), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000)
          from (
            select * from "app_settings"
            order by case when "id" = 'app-settings-singleton' then 1 else 0 end desc, "updated_at" desc, "created_at" desc
            limit 1
          ) as legacy
          where trim(coalesce(legacy."sync_device_id", '')) != ''
            and not exists (select 1 from "config_storage" where "config_key" = 'device_sync.device_id');

          insert into "config_storage" ("id", "_status", "_changed", "config_key", "config_value", "created_at", "updated_at")
          select 'device_sync.device_name', 'created', '', 'device_sync.device_name', trim(coalesce(legacy."sync_device_name", '')), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000)
          from (
            select * from "app_settings"
            order by case when "id" = 'app-settings-singleton' then 1 else 0 end desc, "updated_at" desc, "created_at" desc
            limit 1
          ) as legacy
          where trim(coalesce(legacy."sync_device_name", '')) != ''
            and not exists (select 1 from "config_storage" where "config_key" = 'device_sync.device_name');

          insert into "config_storage" ("id", "_status", "_changed", "config_key", "config_value", "created_at", "updated_at")
          select 'device_sync.pairing_token', 'created', '', 'device_sync.pairing_token', trim(coalesce(legacy."sync_pairing_token", '')), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000)
          from (
            select * from "app_settings"
            order by case when "id" = 'app-settings-singleton' then 1 else 0 end desc, "updated_at" desc, "created_at" desc
            limit 1
          ) as legacy
          where trim(coalesce(legacy."sync_pairing_token", '')) != ''
            and not exists (select 1 from "config_storage" where "config_key" = 'device_sync.pairing_token');

          insert into "config_storage" ("id", "_status", "_changed", "config_key", "config_value", "created_at", "updated_at")
          select 'device_sync.auth_token', 'created', '', 'device_sync.auth_token', trim(coalesce(legacy."sync_auth_token", '')), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000)
          from (
            select * from "app_settings"
            order by case when "id" = 'app-settings-singleton' then 1 else 0 end desc, "updated_at" desc, "created_at" desc
            limit 1
          ) as legacy
          where trim(coalesce(legacy."sync_auth_token", '')) != ''
            and not exists (select 1 from "config_storage" where "config_key" = 'device_sync.auth_token');

          insert into "config_storage" ("id", "_status", "_changed", "config_key", "config_value", "created_at", "updated_at")
          select 'device_sync.is_registered', 'created', '', 'device_sync.is_registered', case when legacy."sync_is_registered" = 1 then 'true' else 'false' end, coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000)
          from (
            select * from "app_settings"
            order by case when "id" = 'app-settings-singleton' then 1 else 0 end desc, "updated_at" desc, "created_at" desc
            limit 1
          ) as legacy
          where legacy."sync_is_registered" is not null
            and not exists (select 1 from "config_storage" where "config_key" = 'device_sync.is_registered');

          insert into "config_storage" ("id", "_status", "_changed", "config_key", "config_value", "created_at", "updated_at")
          select 'device_sync.auto_enabled', 'created', '', 'device_sync.auto_enabled', case when legacy."sync_auto_enabled" = 1 then 'true' else 'false' end, coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000)
          from (
            select * from "app_settings"
            order by case when "id" = 'app-settings-singleton' then 1 else 0 end desc, "updated_at" desc, "created_at" desc
            limit 1
          ) as legacy
          where legacy."sync_auto_enabled" is not null
            and not exists (select 1 from "config_storage" where "config_key" = 'device_sync.auto_enabled');

          insert into "config_storage" ("id", "_status", "_changed", "config_key", "config_value", "created_at", "updated_at")
          select 'device_sync.instance_key', 'created', '', 'device_sync.instance_key', trim(coalesce(legacy."sync_instance_key", '')), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000)
          from (
            select * from "app_settings"
            order by case when "id" = 'app-settings-singleton' then 1 else 0 end desc, "updated_at" desc, "created_at" desc
            limit 1
          ) as legacy
          where trim(coalesce(legacy."sync_instance_key", '')) != ''
            and not exists (select 1 from "config_storage" where "config_key" = 'device_sync.instance_key');

          insert into "config_storage" ("id", "_status", "_changed", "config_key", "config_value", "created_at", "updated_at")
          select 'device_sync.allow_plaintext', 'created', '', 'device_sync.allow_plaintext', case when legacy."sync_allow_plaintext" = 1 then 'true' else 'false' end, coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000), coalesce(legacy."updated_at", cast(strftime('%s','now') as integer) * 1000)
          from (
            select * from "app_settings"
            order by case when "id" = 'app-settings-singleton' then 1 else 0 end desc, "updated_at" desc, "created_at" desc
            limit 1
          ) as legacy
          where legacy."sync_allow_plaintext" is not null
            and not exists (select 1 from "config_storage" where "config_key" = 'device_sync.allow_plaintext');

          create table "app_settings_new" (
            "id" primary key,
            "_changed",
            "_status",
            "language",
            "default_billing_interval",
            "default_company_registry",
            "is_vat_payer",
            "invoice_company_name",
            "invoice_address",
            "invoice_street2",
            "invoice_city",
            "invoice_postal_code",
            "invoice_country",
            "invoice_company_id",
            "invoice_vat_number",
            "invoice_email",
            "invoice_phone",
            "invoice_website",
            "invoice_bank_account",
            "invoice_iban",
            "invoice_swift",
            "invoice_logo_uri",
            "invoice_qr_type",
            "invoice_default_export_format",
            "invoice_series_prefix",
            "invoice_series_pattern",
            "invoice_series_next_number",
            "invoice_series_padding",
            "invoice_series_per_device",
            "invoice_series_device_code",
            "timesheet_series_prefix",
            "timesheet_series_pattern",
            "timesheet_series_next_number",
            "timesheet_series_padding",
            "timesheet_series_per_device",
            "timesheet_series_device_code",
            "app_lock_enabled",
            "app_lock_biometric_enabled",
            "created_at",
            "updated_at"
          );

          insert into "app_settings_new" (
            "id",
            "_changed",
            "_status",
            "language",
            "default_billing_interval",
            "default_company_registry",
            "is_vat_payer",
            "invoice_company_name",
            "invoice_address",
            "invoice_street2",
            "invoice_city",
            "invoice_postal_code",
            "invoice_country",
            "invoice_company_id",
            "invoice_vat_number",
            "invoice_email",
            "invoice_phone",
            "invoice_website",
            "invoice_bank_account",
            "invoice_iban",
            "invoice_swift",
            "invoice_logo_uri",
            "invoice_qr_type",
            "invoice_default_export_format",
            "invoice_series_prefix",
            "invoice_series_pattern",
            "invoice_series_next_number",
            "invoice_series_padding",
            "invoice_series_per_device",
            "invoice_series_device_code",
            "timesheet_series_prefix",
            "timesheet_series_pattern",
            "timesheet_series_next_number",
            "timesheet_series_padding",
            "timesheet_series_per_device",
            "timesheet_series_device_code",
            "app_lock_enabled",
            "app_lock_biometric_enabled",
            "created_at",
            "updated_at"
          )
          select
            "id",
            "_changed",
            "_status",
            "language",
            "default_billing_interval",
            "default_company_registry",
            "is_vat_payer",
            "invoice_company_name",
            "invoice_address",
            "invoice_street2",
            "invoice_city",
            "invoice_postal_code",
            "invoice_country",
            "invoice_company_id",
            "invoice_vat_number",
            "invoice_email",
            "invoice_phone",
            "invoice_website",
            "invoice_bank_account",
            "invoice_iban",
            "invoice_swift",
            "invoice_logo_uri",
            "invoice_qr_type",
            "invoice_default_export_format",
            "invoice_series_prefix",
            "invoice_series_pattern",
            "invoice_series_next_number",
            "invoice_series_padding",
            "invoice_series_per_device",
            "invoice_series_device_code",
            "timesheet_series_prefix",
            "timesheet_series_pattern",
            "timesheet_series_next_number",
            "timesheet_series_padding",
            "timesheet_series_per_device",
            "timesheet_series_device_code",
            "app_lock_enabled",
            "app_lock_biometric_enabled",
            "created_at",
            "updated_at"
          from "app_settings";

          drop table "app_settings";
          alter table "app_settings_new" rename to "app_settings";
          create index if not exists "app_settings__status" on "app_settings" ("_status");
        `),
      ],
    },
    {
      toVersion: 42,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [{ name: 'default_invoice_currency', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 43,
      steps: [
        addColumns({
          table: 'price_list_item',
          columns: [{ name: 'default_price_currency', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'client_price_override',
          columns: [{ name: 'custom_price_currency', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'time_entry',
          columns: [{ name: 'rate_currency', type: 'string', isOptional: true }],
        }),
        unsafeExecuteSql(`
          update "price_list_item"
          set "default_price_currency" = coalesce(
            nullif((select "default_invoice_currency" from "app_settings" limit 1), ''),
            'CZK'
          )
          where "default_price_currency" is null;

          update "client_price_override"
          set "custom_price_currency" = coalesce(
            (
              select nullif("price_list_item"."default_price_currency", '')
              from "price_list_item"
              where "price_list_item"."id" = "client_price_override"."price_list_item_id"
              limit 1
            ),
            nullif((select "default_invoice_currency" from "app_settings" limit 1), ''),
            'CZK'
          )
          where "custom_price_currency" is null;

          update "time_entry"
          set "rate_currency" = coalesce(
            (
              select coalesce(
                nullif("client_price_override"."custom_price_currency", ''),
                nullif("price_list_item"."default_price_currency", '')
              )
              from "price_list_item"
              left join "client_price_override"
                on "client_price_override"."price_list_item_id" = "price_list_item"."id"
               and "client_price_override"."client_id" = "time_entry"."client_id"
              where "price_list_item"."id" = "time_entry"."price_list_item_id"
              limit 1
            ),
            nullif((select "default_invoice_currency" from "app_settings" limit 1), ''),
            'CZK'
          )
          where "rate" is not null and "rate_currency" is null;
        `),
      ],
    },
    {
      toVersion: 44,
      steps: [
        createTable({
          name: 'currency_setting',
          columns: [
            { name: 'code', type: 'string', isIndexed: true },
            { name: 'prefix', type: 'string', isOptional: true },
            { name: 'suffix', type: 'string', isOptional: true },
            { name: 'sort_order', type: 'number' },
            { name: 'is_active', type: 'boolean' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        unsafeExecuteSql(`
          insert into "currency_setting" (
            "id",
            "code",
            "prefix",
            "suffix",
            "sort_order",
            "is_active",
            "created_at",
            "updated_at"
          )
          select 'currency-eur', 'EUR', '€', '', 10, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000
          where not exists (select 1 from "currency_setting" where "code" = 'EUR');
        `),
        unsafeExecuteSql(`
          insert into "currency_setting" (
            "id",
            "code",
            "prefix",
            "suffix",
            "sort_order",
            "is_active",
            "created_at",
            "updated_at"
          )
          select 'currency-czk', 'CZK', '', ' Kč', 20, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000
          where not exists (select 1 from "currency_setting" where "code" = 'CZK');
        `),
        unsafeExecuteSql(`
          insert into "currency_setting" (
            "id",
            "code",
            "prefix",
            "suffix",
            "sort_order",
            "is_active",
            "created_at",
            "updated_at"
          )
          select 'currency-usd', 'USD', '$', '', 30, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000
          where not exists (select 1 from "currency_setting" where "code" = 'USD');
        `),
        unsafeExecuteSql(`
          insert into "currency_setting" (
            "id",
            "code",
            "prefix",
            "suffix",
            "sort_order",
            "is_active",
            "created_at",
            "updated_at"
          )
          select 'currency-chf', 'CHF', '', ' CHF', 40, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000
          where not exists (select 1 from "currency_setting" where "code" = 'CHF');
        `),
      ],
    },
    {
      toVersion: 45,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [
            { name: 'default_invoice_payment_method', type: 'string', isOptional: true },
            { name: 'default_invoice_due_days', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'client',
          columns: [
            { name: 'invoice_payment_method', type: 'string', isOptional: true },
            { name: 'invoice_due_days', type: 'number', isOptional: true },
          ],
        }),
        unsafeExecuteSql(`
          update "app_settings"
          set "default_invoice_payment_method" = coalesce(
            nullif("default_invoice_payment_method", ''),
            'bank_transfer'
          );

          update "app_settings"
          set "default_invoice_due_days" = coalesce(
            "default_invoice_due_days",
            14
          );
        `),
      ],
    },
    {
      toVersion: 46,
      steps: [
        addColumns({
          table: 'invoice',
          columns: [{ name: 'buyer_snapshot_json', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 47,
      steps: [
        addColumns({
          table: 'app_settings',
          columns: [
            { name: 'timer_soft_limit_enabled', type: 'boolean', isOptional: true },
            { name: 'timer_soft_limit_minutes', type: 'number', isOptional: true },
            { name: 'timer_hard_limit_enabled', type: 'boolean', isOptional: true },
            { name: 'timer_hard_limit_minutes', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'client',
          columns: [
            { name: 'timer_limit_mode', type: 'string', isOptional: true },
            { name: 'timer_soft_limit_minutes', type: 'number', isOptional: true },
            { name: 'timer_hard_limit_minutes', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'time_entry',
          columns: [
            { name: 'timer_soft_limit_minutes', type: 'number', isOptional: true },
            { name: 'timer_hard_limit_minutes', type: 'number', isOptional: true },
            { name: 'soft_limit_notified_at', type: 'number', isOptional: true },
          ],
        }),
        unsafeExecuteSql(`
          update "app_settings"
          set "timer_soft_limit_enabled" = coalesce("timer_soft_limit_enabled", 1),
              "timer_soft_limit_minutes" = coalesce("timer_soft_limit_minutes", 480),
              "timer_hard_limit_enabled" = coalesce("timer_hard_limit_enabled", 1),
              "timer_hard_limit_minutes" = coalesce("timer_hard_limit_minutes", 600);

          update "client"
          set "timer_limit_mode" = coalesce(nullif("timer_limit_mode", ''), 'default');
        `),
      ],
    },
    {
      toVersion: 48,
      steps: [
        unsafeExecuteSql(`
          create index if not exists "time_entry_is_running" on "time_entry" ("is_running");
          create index if not exists "time_entry_is_paused" on "time_entry" ("is_paused");
        `),
      ],
    },
    {
      toVersion: 49,
      steps: [
        addColumns({
          table: 'vat_code',
          columns: [{ name: 'country_code', type: 'string', isOptional: true }],
        }),
      ],
    },
  ],
});
