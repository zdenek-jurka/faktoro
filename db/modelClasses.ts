import AppSettingsModel from '../model/AppSettingsModel';
import ClientAddressModel from '../model/ClientAddressModel';
import ClientModel from '../model/ClientModel';
import ClientPriceOverrideModel from '../model/ClientPriceOverrideModel';
import ConfigStorageModel from '../model/ConfigStorageModel';
import CurrencySettingModel from '../model/CurrencySettingModel';
import InvoiceItemModel from '../model/InvoiceItemModel';
import InvoiceModel from '../model/InvoiceModel';
import PriceListItemModel from '../model/PriceListItemModel';
import SyncConflictModel from '../model/SyncConflictModel';
import SyncOperationModel from '../model/SyncOperationModel';
import TimeEntryModel from '../model/TimeEntryModel';
import TimesheetModel from '../model/TimesheetModel';
import VatCodeModel from '../model/VatCodeModel';
import VatRateModel from '../model/VatRateModel';

const modelClasses = [
  AppSettingsModel,
  ClientModel,
  ClientAddressModel,
  ClientPriceOverrideModel,
  ConfigStorageModel,
  CurrencySettingModel,
  InvoiceModel,
  InvoiceItemModel,
  PriceListItemModel,
  SyncOperationModel,
  SyncConflictModel,
  TimeEntryModel,
  TimesheetModel,
  VatCodeModel,
  VatRateModel,
];

export default modelClasses;
