import { createWidget } from 'expo-widgets';
// UI components are provided as globals in the widget JS context by ExpoWidgets.bundle.
// These imports are for TypeScript type-checking only; they are not bundled into the widget.
import { Button, HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';

import type { TimerWidgetAction, TimerWidgetProps } from './timer-widget-shared';

export const timerWidget = createWidget<TimerWidgetProps>('TimerWidget', (props, env) => {
  'widget';

  function padTwo(n: number) {
    return n < 10 ? '0' + n : '' + n;
  }

  function formatDuration(totalSeconds: number) {
    const s = Math.max(0, Math.floor(totalSeconds));
    return (
      padTwo(Math.floor(s / 3600)) +
      ':' +
      padTwo(Math.floor((s % 3600) / 60)) +
      ':' +
      padTwo(s % 60)
    );
  }

  function getElapsedSeconds(timestampMs: number) {
    if (props.isPaused && props.pausedAt != null) {
      return Math.max(
        0,
        Math.floor((props.pausedAt - props.startTime) / 1000 - props.totalPausedDuration),
      );
    }

    return Math.max(
      0,
      Math.floor((timestampMs - props.startTime) / 1000 - props.totalPausedDuration),
    );
  }

  function getButtonPayload(action: TimerWidgetAction) {
    return {
      pendingAction: action,
      pendingActionTime: Date.now(),
    };
  }

  function renderTimerActionButtons(isPaused: boolean) {
    return (
      <HStack modifiers={[frame({ maxWidth: 9999 })]}>
        {isPaused ? (
          <Button
            systemImage="play.fill"
            label="Pokračovat"
            target="timer.resume"
            {...({ onButtonPress: () => getButtonPayload('resume') } as any)}
            modifiers={[buttonStyle('bordered'), controlSize('small')]}
          />
        ) : (
          <Button
            systemImage="pause.fill"
            label="Pauza"
            target="timer.pause"
            {...({ onButtonPress: () => getButtonPayload('pause') } as any)}
            modifiers={[buttonStyle('bordered'), controlSize('small')]}
          />
        )}
        <Spacer />
        <Button
          systemImage="stop.fill"
          label="Stop"
          role="destructive"
          target="timer.stop"
          {...({ onButtonPress: () => getButtonPayload('stop') } as any)}
          modifiers={[buttonStyle('bordered'), controlSize('small')]}
        />
      </HStack>
    );
  }

  const isSmall = env.widgetFamily === 'systemSmall';

  if (!props.isRunning) {
    return (
      <VStack
        modifiers={[
          frame({ maxWidth: 9999, maxHeight: 9999 }),
          padding({ all: isSmall ? 14 : 16 }),
        ]}
      >
        <HStack modifiers={[frame({ maxWidth: 9999 })]}>
          <Text modifiers={[font({ weight: 'bold', size: 12 }), foregroundStyle('secondary')]}>
            {'FAKTORO'}
          </Text>
          <Spacer />
        </HStack>
        <Spacer />
        <Text modifiers={[font({ weight: 'semibold', size: 15 })]}>{'Žádný timer'}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle('secondary')]}>
          {'Otevři appku a spusť timer'}
        </Text>
      </VStack>
    );
  }

  const elapsedSeconds = getElapsedSeconds(env.date.getTime());
  const statusColor = props.isPaused ? '#FF9500' : '#34C759';
  const statusLabel = props.isPaused ? '⏸ Pauza' : '● Probíhá';
  const openAppUrl = 'faktoro://time-tracking';

  return (
    <VStack
      modifiers={[
        frame({ maxWidth: 9999, maxHeight: 9999 }),
        padding({ all: isSmall ? 14 : 16 }),
        ...(!props.interactiveActionsEnabled ? [widgetURL(openAppUrl)] : []),
      ]}
    >
      <HStack modifiers={[frame({ maxWidth: 9999 })]}>
        <Text modifiers={[font({ weight: 'bold', size: 12 }), foregroundStyle('secondary')]}>
          {'FAKTORO'}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 11 }), foregroundStyle(statusColor)]}>{statusLabel}</Text>
      </HStack>

      <Text modifiers={[font({ weight: 'semibold', size: isSmall ? 13 : 15 })]}>
        {props.clientName || 'Timer'}
      </Text>

      {!isSmall && props.description ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle('secondary')]}>
          {props.description}
        </Text>
      ) : null}

      <Spacer />

      <Text
        modifiers={[
          font({ weight: 'bold', size: isSmall ? 26 : 30 }),
          monospacedDigit(),
          foregroundStyle(statusColor),
        ]}
      >
        {formatDuration(elapsedSeconds)}
      </Text>

      {!isSmall && props.interactiveActionsEnabled
        ? renderTimerActionButtons(props.isPaused)
        : null}
      {!props.interactiveActionsEnabled ? (
        <HStack modifiers={[frame({ maxWidth: 9999 })]}>
          <Text modifiers={[font({ size: 11 }), foregroundStyle('secondary')]}>{'↗'}</Text>
          <Text modifiers={[font({ size: 11 }), foregroundStyle('secondary')]}>
            {' Otevři appku pro pauzu nebo stop'}
          </Text>
        </HStack>
      ) : null}
    </VStack>
  );
});
