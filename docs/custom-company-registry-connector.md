# Custom Company Registry Connector

The `custom_connector` company registry integration lets Faktoro look up
companies through an external service controlled by the user or organization.

This document describes the current application contract as implemented in
`repositories/company-registry/custom-company-registry.ts` and the related
settings screens. It is not a general registry standard.

## Overview

The custom connector is used wherever the app supports company lookup:

- client creation and client editing,
- one-off invoice buyer lookup,
- business profile lookup,
- onboarding profile lookup.

The app sends a `GET` request to the configured endpoint with the requested
company ID. The connector returns normalized JSON with the company legal name,
optional VAT number, and optional importable addresses.

The integration key is:

```text
custom_connector
```

## Configuration

The connector is configured in the app under company registry settings.

Required setting:

- `url`

Optional settings:

- `auth_type`
- `api_key_header`
- `basic_username`
- `oauth2_token_url`
- `oauth2_client_id`
- `oauth2_scope`

Secret settings stored outside `config_storage`:

- bearer token
- API key value
- basic password
- OAuth2 client secret

The values are stored in `config_storage` under:

```text
registry.custom_connector.url
registry.custom_connector.auth_type
registry.custom_connector.api_key_header
registry.custom_connector.basic_username
registry.custom_connector.oauth2_token_url
registry.custom_connector.oauth2_client_id
registry.custom_connector.oauth2_scope
```

Legacy `header_key` and `header_value` settings are still read as an API-key
configuration for backward compatibility. Saving the connector through the
current UI writes the new auth settings and removes the legacy header fields.

The application also uses the global default registry setting from app settings.
When `custom_connector` is selected as the default registry, company lookup uses
this connector unless the user explicitly chooses another registry.

## Storage and Sync Behavior

Registry settings use the same `registry.*` configuration namespace as the
built-in registry integrations.

Current snapshot sync includes the `registry.*` configuration prefix. This means
custom connector settings can be included in shared backup/sync snapshots.

Important security implication:

- non-secret auth settings are regular `registry.*` configuration and can sync,
- secret auth values are stored in `expo-secure-store` under the custom registry
  secret key,
- legacy `header_value` values may still exist in old local configuration until
  the connector settings are saved again.
- Prefer a connector-side token that can be rotated and scoped only to company
  lookup.

## Request Contract

For the company lookup itself, the app performs this HTTP request:

```text
GET <lookup-url>
Accept: application/json
```

If both `header_key` and `header_value` are configured, the app also sends:

```text
<header_key>: <header_value>
```

For current auth settings, the app can also send one of the supported auth
headers described in [Authentication Pattern](#authentication-pattern). OAuth2
client credentials may perform a separate token request before the lookup.

## URL Resolution

The configured `url` must be an absolute HTTPS URL. Plain HTTP is accepted only
for localhost development endpoints.

If the URL contains the literal placeholder `{companyId}`, the app replaces all
occurrences with the URL-encoded company ID:

```text
Configured URL:
https://api.example.com/company/{companyId}

Requested company ID:
00006947

Final URL:
https://api.example.com/company/00006947
```

If the URL does not contain `{companyId}`, the app appends the URL-encoded
company ID as the last path segment:

```text
Configured URL:
https://api.example.com/company

Requested company ID:
00006947

Final URL:
https://api.example.com/company/00006947
```

Trailing slashes are removed before the company ID is appended.

Although `http://` is accepted by the current implementation, production
connectors should use `https://`.

## Request Validation in the App

Before sending the request, the app validates:

- the requested company ID is not empty after trimming,
- the configured URL is not empty,
- the configured URL starts with `http://` or `https://`,
- the selected auth mode has all required fields,
- the connector URL and OAuth2 token URL use HTTPS or local HTTP.

If validation fails, the app reports a configuration or input error before
calling the connector.

## Response Contract

The connector must return JSON.

Required field:

- `legalName` or `legal_name`

Optional fields:

- `companyId` or `company_id`
- `vatNumber` or `vat_number`
- `importAddresses`

If `companyId` is missing, the app uses the requested company ID.

The connector currently does not read a top-level `countryCode` field. The
custom registry service has an internal fallback country code `ZZ`; importable
addresses should therefore include their own `country` value.

## Response Example

```json
{
  "companyId": "00006947",
  "legalName": "Ministerstvo financi",
  "vatNumber": "CZ00006947",
  "importAddresses": [
    {
      "type": "billing",
      "street": "Letenska 525/15",
      "city": "Praha 1",
      "postalCode": "11800",
      "country": "CZ"
    }
  ]
}
```

The equivalent snake_case variant is also accepted for selected top-level and
address fields:

```json
{
  "company_id": "00006947",
  "legal_name": "Ministerstvo financi",
  "vat_number": "CZ00006947",
  "importAddresses": [
    {
      "type": "billing",
      "street": "Letenska 525/15",
      "city": "Praha 1",
      "postal_code": "11800",
      "country": "CZ"
    }
  ]
}
```

## Import Addresses

`importAddresses` is an optional array. Each complete address can be imported
into the client, invoice buyer, or business profile flows depending on where the
lookup was started.

Address fields:

- `type`: `billing`, `shipping`, or `other`
- `street`
- `city`
- `postalCode` or `postal_code`
- `country`

If `type` is missing, the app defaults it to `billing`.

The app keeps only complete addresses. An address is ignored unless all of these
fields are non-empty after normalization:

- `street`
- `city`
- `postalCode`
- `country`

For best compatibility, send ISO 3166-1 alpha-2 country codes such as `CZ`,
`DE`, `FR`, or `NO`.

## Status Code Mapping

The app maps connector HTTP responses to user-facing registry lookup errors:

| Connector response                 | App error code           | Meaning                                              |
| ---------------------------------- | ------------------------ | ---------------------------------------------------- |
| Network failure                    | `service_unavailable`    | The connector could not be reached.                  |
| `400`                              | `invalid_company_id`     | The supplied company ID is invalid.                  |
| `401` or `403`                     | `configuration_required` | The configured credentials are invalid or missing.   |
| `404`                              | `company_not_found`      | No company was found for the supplied ID.            |
| `5xx`                              | `service_unavailable`    | The connector service is temporarily unavailable.    |
| Any other non-2xx status           | `unknown`                | The request failed for an unsupported reason.        |
| Invalid JSON                       | `unknown`                | The response is not parseable JSON.                  |
| Missing `legalName` / `legal_name` | `unknown`                | The response does not contain required company data. |

The app does not parse an error body from the connector. Use the status code to
communicate the intended failure class.

## Minimal Connector Example

This example shows the expected behavior. It is intentionally minimal and omits
production concerns such as authentication storage, logging, rate limiting, and
input normalization.

```ts
import express from 'express';

const app = express();

app.get('/company/:companyId', (req, res) => {
  const companyId = String(req.params.companyId || '').trim();

  if (!/^\d{8}$/.test(companyId)) {
    res.status(400).json({ error: 'invalid_company_id' });
    return;
  }

  if (companyId !== '00006947') {
    res.status(404).json({ error: 'company_not_found' });
    return;
  }

  res.json({
    companyId,
    legalName: 'Ministerstvo financi',
    vatNumber: 'CZ00006947',
    importAddresses: [
      {
        type: 'billing',
        street: 'Letenska 525/15',
        city: 'Praha 1',
        postalCode: '11800',
        country: 'CZ',
      },
    ],
  });
});

app.listen(3000);
```

Configured URL in the app:

```text
https://registry.example.com/company/{companyId}
```

## Authentication Pattern

The current integration uses the same HTTP auth modes as custom export webhooks:

- `none`
- `bearer`
- `api_key`
- `basic`
- `oauth2_cc`

Bearer token:

```text
Authorization: Bearer <token>
```

API key:

```text
<api_key_header>: <api_key_value>
```

Basic auth:

```text
Authorization: Basic base64(username:password)
```

OAuth2 client credentials:

- token request method: `POST`
- token request content type: `application/x-www-form-urlencoded`
- grant type: `client_credentials`
- required fields: token URL, client ID, client secret
- optional field: scope
- connector request header after token resolution:

```text
Authorization: Bearer <access_token>
```

OAuth2 access tokens are cached in secure storage and refreshed when they are
within 60 seconds of expiry. The token request uses a 15 second timeout and two
attempts for retryable network failures or retryable HTTP statuses.

Example API-key setup:

```text
auth_type: api_key
api_key_header: x-api-key
api_key_value: registry-lookup-token
```

Resulting request:

```text
GET https://registry.example.com/company/00006947
Accept: application/json
x-api-key: registry-lookup-token
```

Bearer setup:

```text
auth_type: bearer
bearer_token: registry-lookup-token
```

The current integration does not support multi-header auth, mTLS, per-request
signing, or custom OAuth grant types.

## Data Imported into the App

The app can use connector data for:

- company name from `legalName`,
- company ID from `companyId` or the requested ID,
- VAT number from `vatNumber`,
- importable addresses from `importAddresses`.

The connector does not directly set:

- e-mail,
- phone,
- invoice due days,
- billing settings,
- buyer reference,
- payment details,
- tax registration metadata beyond `vatNumber`.

Those fields remain managed by the user in the app.

## Testing Checklist

Use this checklist when implementing a custom connector:

1. Configure the connector URL in the app.
2. Leave auth set to `none` first, unless the endpoint requires authentication.
3. Look up a known valid company ID.
4. Verify that the app imports legal name, company ID, VAT number, and address.
5. Test an unknown company ID and confirm the connector returns `404`.
6. Test an invalid company ID and confirm the connector returns `400`.
7. If authentication is enabled, test invalid credentials and confirm `401` or
   `403`.
8. Verify that incomplete addresses are either fixed by the connector or safely
   ignored by the app.

## Current Limitations

- Only `GET` requests are supported.
- Only JSON responses are supported.
- Only the predefined auth modes are supported; arbitrary multiple custom
  headers are not supported.
- The app does not send a request body.
- The app does not parse connector-specific error payloads.
- The company lookup request itself does not have a custom timeout or retry
  policy; OAuth2 token requests do.
- There is no response schema validation beyond the runtime checks described in
  this document.
- New auth secret values are stored in secure storage, but legacy `header_value`
  may still exist in old local config until settings are saved again.
- Non-secret `registry.*` settings can be included in snapshot sync.
