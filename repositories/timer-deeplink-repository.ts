import database from '@/db';
import { ClientModel } from '@/model';
import {
  createTimeEntry,
  emergencyStopLocalRunningEntries,
  getCurrentDeviceRunningTimeEntry,
  pauseTimeEntry,
  resumeTimeEntry,
  stopTimeEntry,
  TIME_ENTRY_LOCAL_RUNNING_EXISTS,
} from '@/repositories/time-entry-repository';
import { getStoredTranslationFunctions } from '@/utils/runtime-i18n';
import { Q } from '@nozbe/watermelondb';

export type TimerDeepLinkAction = 'start' | 'pause' | 'resume' | 'stop' | 'force-stop';

type ParsedAction = {
  action: TimerDeepLinkAction;
  clientId?: string;
};

const ACTIONS = new Set<TimerDeepLinkAction>(['start', 'pause', 'resume', 'stop', 'force-stop']);

function parseTimerActionFromUrl(url: string): ParsedAction | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const queryActionRaw = parsed.searchParams.get('action')?.trim().toLowerCase();
  const queryAction =
    queryActionRaw && ACTIONS.has(queryActionRaw as TimerDeepLinkAction)
      ? (queryActionRaw as TimerDeepLinkAction)
      : null;

  const pathSegments = parsed.pathname
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  const hostSegment = parsed.hostname?.trim().toLowerCase();
  const segments = hostSegment ? [hostSegment, ...pathSegments] : pathSegments;

  let pathAction: TimerDeepLinkAction | null = null;
  if (segments[0] === 'timer' && segments[1] && ACTIONS.has(segments[1] as TimerDeepLinkAction)) {
    pathAction = segments[1] as TimerDeepLinkAction;
  }

  const action = pathAction || queryAction;
  if (!action) return null;

  const clientId = parsed.searchParams.get('clientId')?.trim();
  return {
    action,
    clientId: clientId || undefined,
  };
}

async function getDefaultActiveClient(): Promise<ClientModel | null> {
  const clients = await database
    .get<ClientModel>(ClientModel.table)
    .query(Q.where('is_archived', false), Q.sortBy('name', Q.asc))
    .fetch();
  return clients[0] ?? null;
}

async function resolveClientForStart(clientId?: string): Promise<ClientModel | null> {
  if (clientId) {
    try {
      const client = await database.get<ClientModel>(ClientModel.table).find(clientId);
      if (!client.isArchived) return client;
    } catch {
      // Fallback to default active client.
    }
  }
  return getDefaultActiveClient();
}

export async function handleTimerActionUrl(url: string): Promise<boolean> {
  const parsed = parseTimerActionFromUrl(url);
  if (!parsed) return false;

  if (parsed.action === 'force-stop') {
    await emergencyStopLocalRunningEntries();
    return true;
  }

  const runningEntry = await getCurrentDeviceRunningTimeEntry();

  if (parsed.action === 'start') {
    if (runningEntry) return true;
    const client = await resolveClientForStart(parsed.clientId);
    if (!client) return true;

    try {
      const LL = await getStoredTranslationFunctions();
      await createTimeEntry({
        clientId: client.id,
        startTime: Date.now(),
        description: LL.timeTracking.startedFromQuickAction(),
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== TIME_ENTRY_LOCAL_RUNNING_EXISTS) {
        throw error;
      }
    }
    return true;
  }

  if (!runningEntry) return true;

  if (parsed.action === 'pause') {
    if (!runningEntry.isPaused) {
      await pauseTimeEntry(runningEntry.id);
    }
    return true;
  }

  if (parsed.action === 'resume') {
    if (runningEntry.isPaused) {
      await resumeTimeEntry(runningEntry.id);
    }
    return true;
  }

  await stopTimeEntry(runningEntry.id);
  return true;
}
