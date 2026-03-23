import { createLiveActivity } from 'expo-widgets';
// UI components are provided as globals in the widget JS context by ExpoWidgets.bundle.
// These imports are for TypeScript type-checking only; they are not bundled into the widget.
import { Button, HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  frame,
  padding,
} from '@expo/ui/swift-ui/modifiers';

import type { TimerWidgetAction, TimerWidgetProps } from './timer-widget-shared';

export const timerLiveActivity = createLiveActivity<TimerWidgetProps>(
  'TimerLiveActivity',
  (props, _env) => {
    'widget';

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

    const statusColor = props.isPaused ? '#FF9500' : '#34C759';
    const statusLabel = props.isPaused ? 'Pauza' : 'Probíhá';
    const compactClientLabel = props.clientName ? props.clientName.slice(0, 10) : 'Timer';
    const showInteractiveActions = props.interactiveActionsEnabled !== false;

    return {
      banner: (
        <VStack modifiers={[frame({ maxWidth: 9999, maxHeight: 9999 }), padding({ all: 14 })]}>
          <HStack modifiers={[frame({ maxWidth: 9999 })]}>
            <Text modifiers={[font({ weight: 'bold', size: 12 }), foregroundStyle('secondary')]}>
              {'FAKTORO'}
            </Text>
            <Spacer />
            <Text modifiers={[font({ size: 11 }), foregroundStyle(statusColor)]}>
              {statusLabel}
            </Text>
          </HStack>
          <Text modifiers={[font({ weight: 'semibold', size: 15 })]}>
            {props.clientName || 'Timer'}
          </Text>
          {props.description ? (
            <Text modifiers={[font({ size: 11 }), foregroundStyle('secondary')]}>
              {props.description}
            </Text>
          ) : null}
          <Text modifiers={[font({ weight: 'bold', size: 22 }), foregroundStyle(statusColor)]}>
            {statusLabel}
          </Text>
          {showInteractiveActions ? renderTimerActionButtons(props.isPaused) : null}
        </VStack>
      ),
      compactLeading: (
        <Text modifiers={[font({ weight: 'semibold', size: 12 })]}>{compactClientLabel}</Text>
      ),
      compactTrailing: (
        <Text modifiers={[font({ weight: 'semibold', size: 12 }), foregroundStyle(statusColor)]}>
          {props.isPaused ? '⏸' : '●'}
        </Text>
      ),
      minimal: (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(statusColor)]}>
          {props.isPaused ? '⏸' : '●'}
        </Text>
      ),
      expandedCenter: (
        <VStack modifiers={[frame({ maxWidth: 9999 })]}>
          <Text modifiers={[font({ weight: 'semibold', size: 14 })]}>
            {props.clientName || 'Timer'}
          </Text>
          {props.description ? (
            <Text modifiers={[font({ size: 11 }), foregroundStyle('secondary')]}>
              {props.description}
            </Text>
          ) : null}
        </VStack>
      ),
      expandedTrailing: (
        <Text modifiers={[font({ weight: 'bold', size: 16 }), foregroundStyle(statusColor)]}>
          {statusLabel}
        </Text>
      ),
      expandedBottom: showInteractiveActions ? renderTimerActionButtons(props.isPaused) : null,
    };
  },
);
