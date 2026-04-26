import type { Href } from 'expo-router';

const CLIENT_ADD_RETURN_TARGETS = ['timeTracking', 'invoiceNew', 'priceListItem'] as const;

export type ClientAddReturnTarget = (typeof CLIENT_ADD_RETURN_TARGETS)[number];

type RouteParamValue = string | string[] | undefined;

type ClientAddHrefOptions = {
  returnTo?: ClientAddReturnTarget;
  returnToId?: string;
};

function firstRouteParam(value: RouteParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isClientAddReturnTarget(value: string): value is ClientAddReturnTarget {
  return CLIENT_ADD_RETURN_TARGETS.includes(value as ClientAddReturnTarget);
}

export function getClientAddHref(options?: ClientAddHrefOptions): Href {
  if (!options?.returnTo) {
    return '/clients/add';
  }

  return {
    pathname: '/clients/add',
    params: {
      returnTo: options.returnTo,
      ...(options.returnToId ? { returnToId: options.returnToId } : {}),
    },
  };
}

export function resolveClientAddReturnHref(
  returnToParam: RouteParamValue,
  returnToIdParam?: RouteParamValue,
): Href | null {
  const returnTo = firstRouteParam(returnToParam);
  if (!returnTo || !isClientAddReturnTarget(returnTo)) {
    return null;
  }

  switch (returnTo) {
    case 'timeTracking':
      return '/time-tracking';
    case 'invoiceNew':
      return '/invoices/new';
    case 'priceListItem': {
      const id = firstRouteParam(returnToIdParam);
      return id ? { pathname: '/price-list/item/[id]', params: { id } } : null;
    }
  }
}
