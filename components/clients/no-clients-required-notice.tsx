import { ActionEmptyState } from '@/components/ui/action-empty-state';
import { useI18nContext } from '@/i18n/i18n-react';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';

type NoClientsRequiredNoticeProps = {
  message: string;
  style?: StyleProp<ViewStyle>;
};

export function NoClientsRequiredNotice({ message, style }: NoClientsRequiredNoticeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { LL } = useI18nContext();

  return (
    <ActionEmptyState
      iconName="person.badge.plus"
      title={LL.clients.emptyTitle()}
      description={message}
      actionLabel={LL.clients.addNew()}
      onActionPress={() =>
        router.push({
          pathname: '/clients/add',
          params: { returnTo: pathname },
        })
      }
      style={style}
    />
  );
}
