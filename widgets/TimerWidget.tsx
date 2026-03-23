// Keep widget implementations in dedicated files, but expose a stable module surface
// for the app-side sync layer. Render helpers intentionally stay local to each widget
// callback because Expo Widgets serializes those functions into the widget bundle.
export { timerWidget } from './TimerHomeWidget';
export { timerLiveActivity } from './TimerLiveActivity';
export type { TimerWidgetAction, TimerWidgetProps } from './timer-widget-shared';
export { TIMER_WIDGET_TARGETS } from './timer-widget-shared';
