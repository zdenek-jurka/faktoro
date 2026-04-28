# Custom XSLT Export Integrations

This document describes the current custom XML export integration mechanism in
Faktoro. It is based on the implementation in
`repositories/export-integration-repository.ts` and the invoice/timesheet export
screens.

## Overview

Custom export integrations transform Faktoro's internal XML export with an XSLT
stylesheet and then deliver the transformed XML through one of the supported
delivery channels.

Supported document types:

- `invoice`
- `timesheet`

Supported delivery channels:

- system share sheet
- clipboard
- webhook

The feature is exposed as an advanced/beta integration area in the app settings.
Once enabled, integrations are available from invoice and timesheet export flows.

## Runtime Flow

1. The app builds the base Faktoro XML for the current invoice or timesheet.
2. The app validates that the generated source XML has the expected Faktoro root
   element and required child elements.
3. The app runs the configured XSLT stylesheet against the source XML.
4. The transformed result must be non-empty and well-formed XML.
5. The result is delivered via the selected delivery channel.

For invoice exports, the custom file name is currently:

```text
invoice-<safe-invoice-number>-custom.xml
```

For timesheet exports, the custom integration receives the same `.xml` file name
base as the default timesheet XML export.

## Configuration Model

Each integration contains:

```ts
type ExportIntegration = {
  id: string;
  name: string;
  description: string;
  documentType: 'timesheet' | 'invoice';
  delivery: ExportIntegrationDelivery;
  xslt: string;
  createdAt: number;
};
```

Integration definitions are stored in `config_storage` under:

```text
export_integrations.list
```

This key is included in sync snapshots, so integration definitions can move
between paired devices. Sensitive auth values are stripped from the stored JSON
and saved separately in `expo-secure-store`.

Important detail: custom extra webhook headers are stored as regular integration
metadata. Do not put secrets into extra headers unless you are comfortable with
those values being stored and synced as plain configuration. Use the dedicated
auth fields for secrets.

## XSLT Requirements

The stylesheet must:

- be non-empty,
- use `xsl:stylesheet` or `xsl:transform` as the root element,
- be parseable as XML,
- produce a non-empty XML result,
- produce XML that can be parsed back by the app.

The current runtime uses:

- `xslt-processor` for transformation,
- `@xmldom/xmldom` for XML parsing and validation.

Write stylesheets as portable XSLT compatible with the current JavaScript
runtime. Avoid relying on external document loading, vendor-specific extension
functions, file-system access, or network access from XSLT.

If the XSLT output method is XML and the result does not already start with an
XML declaration, the app prepends one unless the stylesheet declares:

```xml
<xsl:output method="xml" omit-xml-declaration="yes"/>
```

The encoding defaults to `UTF-8` unless specified through `xsl:output`.

## Source XML Namespaces

Both source documents use a default namespace. XPath expressions in XSLT must
bind and use a prefix; unprefixed XPath names will not match these elements.

Invoice namespace:

```text
https://faktoro.app/xml/invoice/1.0
```

Timesheet namespace:

```text
https://faktoro.app/xml/timesheet/1.0
```

The source XML schemas are available in the repository:

- [Invoice XML schema](../assets/schemas/invoice.xsd)
- [Timesheet XML schema](../assets/schemas/timesheet.xsd)

Recommended XSLT namespace declarations:

```xml
<xsl:stylesheet
  version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:inv="https://faktoro.app/xml/invoice/1.0"
  xmlns:ts="https://faktoro.app/xml/timesheet/1.0">
```

Use only the namespace that matches the selected document type.

## Invoice Source XML

Root element:

```xml
<Invoice xmlns="https://faktoro.app/xml/invoice/1.0">
```

The app validates these required top-level children before running XSLT:

- `Id`
- `Number`
- `ClientId`
- `IssueDate`
- `Currency`
- `DocumentType`
- `Seller`
- `Buyer`
- `Summary`
- `Items`

`Summary` must contain:

- `Subtotal`
- `Total`

Common optional invoice fields include:

- `BuyerReference`
- `TaxableSupplyDate`
- `DueDate`
- `PaymentMethod`
- `CorrectedInvoiceId`
- `CorrectionKind`
- `CancellationReason`
- `HeaderNote`
- `FooterNote`

Seller fields can include:

- `Name`
- `CompanyId`
- `VatNumber`
- `Address`
- `Street2`
- `City`
- `PostalCode`
- `Country`
- `RegistrationNote`
- `Email`
- `Phone`
- `Website`
- `BankAccount`
- `Iban`
- `Swift`

Buyer fields can include:

- `Id`
- `Name`
- `CompanyId`
- `VatNumber`
- `Address`
- `Street2`
- `City`
- `PostalCode`
- `Country`
- `Email`
- `Phone`

Each invoice item contains:

- `Id`
- `SourceKind`
- `SourceId`
- `Description`
- `Quantity`
- `Unit`
- `UnitPrice`
- `TotalPrice`
- `VatCodeId`
- `VatRate`

### Minimal Invoice XSLT Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet
  version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:inv="https://faktoro.app/xml/invoice/1.0">
  <xsl:output method="xml" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/inv:Invoice">
    <ExternalInvoice>
      <InvoiceNumber>
        <xsl:value-of select="inv:Number"/>
      </InvoiceNumber>
      <BuyerReference>
        <xsl:value-of select="inv:BuyerReference"/>
      </BuyerReference>
      <Currency>
        <xsl:value-of select="inv:Currency"/>
      </Currency>
      <Total>
        <xsl:value-of select="inv:Summary/inv:Total"/>
      </Total>
      <Lines>
        <xsl:for-each select="inv:Items/inv:Item">
          <Line>
            <Description>
              <xsl:value-of select="inv:Description"/>
            </Description>
            <Quantity>
              <xsl:value-of select="inv:Quantity"/>
            </Quantity>
            <Amount>
              <xsl:value-of select="inv:TotalPrice"/>
            </Amount>
          </Line>
        </xsl:for-each>
      </Lines>
    </ExternalInvoice>
  </xsl:template>
</xsl:stylesheet>
```

## Timesheet Source XML

Root element:

```xml
<Timesheet xmlns="https://faktoro.app/xml/timesheet/1.0">
```

The app validates these required top-level children before running XSLT:

- `Id`
- `Client`
- `Period`
- `Summary`
- `Entries`

`Period` must contain:

- `Type`
- `From`
- `To`

`Summary` must contain:

- `TotalEntries`
- `TotalDurationSeconds`
- `TotalDurationHours`

Common timesheet fields:

- `Id`
- `Number`
- `Label`
- `Client/Id`
- `Client/Name`
- `Period/Type`
- `Period/From`
- `Period/To`
- `Summary/TotalEntries`
- `Summary/TotalDurationSeconds`
- `Summary/TotalDurationHours`

Optional billing summary fields:

- `Summary/BillingSummary/UnpricedEntries`
- `Summary/BillingSummary/Totals/Total/Currency`
- `Summary/BillingSummary/Totals/Total/Amount`

Each time entry contains:

- `Id`
- `Description`
- `StartTime`
- `EndTime`
- `DurationSeconds`
- `DurationHours`

Optional entry source-device fields:

- `SourceDevice/Id`
- `SourceDevice/Name`

Optional entry billing fields:

- `Rate`
- `RateCurrency`
- `Amount`

### Timesheet XSLT Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet
  version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:ts="https://faktoro.app/xml/timesheet/1.0">
  <xsl:output method="xml" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/ts:Timesheet">
    <ExternalTimesheet>
      <Number>
        <xsl:value-of select="ts:Number"/>
      </Number>
      <ClientName>
        <xsl:value-of select="ts:Client/ts:Name"/>
      </ClientName>
      <TotalHours>
        <xsl:value-of select="ts:Summary/ts:TotalDurationHours"/>
      </TotalHours>
      <BillableTotals>
        <xsl:for-each select="ts:Summary/ts:BillingSummary/ts:Totals/ts:Total">
          <Total>
            <Currency>
              <xsl:value-of select="ts:Currency"/>
            </Currency>
            <Amount>
              <xsl:value-of select="ts:Amount"/>
            </Amount>
          </Total>
        </xsl:for-each>
      </BillableTotals>
      <Entries>
        <xsl:for-each select="ts:Entries/ts:Entry">
          <Entry>
            <Description>
              <xsl:value-of select="ts:Description"/>
            </Description>
            <Start>
              <xsl:value-of select="ts:StartTime"/>
            </Start>
            <End>
              <xsl:value-of select="ts:EndTime"/>
            </End>
            <Hours>
              <xsl:value-of select="ts:DurationHours"/>
            </Hours>
            <SourceDevice>
              <xsl:value-of select="ts:SourceDevice/ts:Name"/>
            </SourceDevice>
            <Amount>
              <xsl:value-of select="ts:Amount"/>
            </Amount>
          </Entry>
        </xsl:for-each>
      </Entries>
    </ExternalTimesheet>
  </xsl:template>
</xsl:stylesheet>
```

## Delivery: Share

The transformed XML is written to a temporary file and passed to the system share
sheet with MIME type:

```text
application/xml
```

The app requires a cache directory and platform sharing support. If sharing is
not available, delivery fails.

## Delivery: Clipboard

The transformed XML string is copied to the system clipboard through
`expo-clipboard`.

This delivery requires the Clipboard native module to be present in the installed
app build.

## Delivery: Webhook

Webhook delivery sends the transformed XML as the request body.

Supported methods:

- `POST`
- `PUT`
- `PATCH`

The webhook URL must be HTTPS. Plain HTTP is allowed only for local development
hosts:

- `localhost`
- `127.0.0.1`
- `::1`

Default content type:

```text
application/xml
```

You can override the content type in the integration form.

### Webhook Auth

Supported auth modes:

- none
- bearer token
- API key header
- HTTP Basic
- OAuth2 client credentials

Auth-generated headers are merged with custom headers. If a custom header uses
the same header name as an auth header, the custom header can override it because
custom headers are applied last.

### OAuth2 Client Credentials

For OAuth2 client credentials, the app:

1. Sends a token request to the configured token URL.
2. Uses `application/x-www-form-urlencoded`.
3. Sends:
   - `grant_type=client_credentials`
   - `client_id`
   - `client_secret`
   - optional `scope`
4. Reads `access_token` and optional `expires_in`.
5. Caches the access token in `expo-secure-store`.
6. Refreshes the token when it is within 60 seconds of expiry.

The token request timeout is 15 seconds.

### Webhook Retry and Timeout

Webhook timeout:

```text
20 seconds
```

The app attempts HTTP delivery up to 2 times.

Retryable HTTP statuses:

- `408`
- `429`
- any `5xx`

Retryable network errors:

- timeout
- abort
- generic network request failure

The webhook response body is not used on success. On HTTP failure, the error
message can include the first part of the response body for diagnostics.

## Validation and Testing in the App

The integration form provides two test actions:

- Transform test
- Delivery test

Transform test:

- runs the XSLT against built-in sample XML for the selected document type,
- validates that the result is non-empty and parseable XML.

Delivery test:

- transforms the same sample XML,
- sends or shares it through the configured delivery channel,
- for webhook delivery, reports the HTTP status on success.

Saving an integration validates the XSLT before it is persisted.

The form also supports loading an XSLT stylesheet from a local file.

## Storage and Sync Behavior

Integration definitions are stored in app configuration and are included in sync
snapshots through `export_integrations.list`.

These values are stored separately in `expo-secure-store`:

- bearer token
- API key value
- Basic password
- OAuth2 client secret
- OAuth2 cached access token

Because secure-store values are device-local, a synced integration definition may
arrive on another device without its secrets. The user may need to re-enter
secret values on that device.

## Error Handling

Common XSLT errors are normalized in the UI:

- empty stylesheet
- missing `xsl:stylesheet` or `xsl:transform` root
- XML parser errors in the stylesheet
- empty transformation result
- malformed output XML

Common delivery errors include:

- invalid URL
- HTTPS requirement failure
- missing native clipboard or sharing support
- webhook timeout
- retryable network failure
- non-2xx webhook response

## Current Limitations

- The transformed output must be XML. Text, JSON, CSV, or binary output is not
  accepted by the current validation path.
- There is no per-integration custom output file extension.
- There is no runtime XSD validation for the transformed result beyond XML
  parsing. If an integration must conform to a target schema, validate the
  exported XML outside the app.
- Webhook delivery has no persistent retry queue.
- Webhook success does not persist a delivery receipt.
- Extra webhook headers are not secret-managed.
- XSLT integrations are advanced/beta functionality and are not part of the
  default basic export flow.
