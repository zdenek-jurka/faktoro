import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FontSizes, Spacing } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  type ExportIntegration,
  deleteExportIntegration,
  getExportIntegrations,
} from '@/repositories/export-integration-repository';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

export default function ExportIntegrationsScreen() {
  const palette = usePalette();
  const { LL } = useI18nContext();

  const getTypeLabel = (item: ExportIntegration) =>
    item.documentType === 'timesheet'
      ? LL.settings.exportIntegrationDocumentTypeTimesheet()
      : LL.settings.exportIntegrationDocumentTypeInvoice();
  const router = useRouter();
  const contentStyle = useBottomSafeAreaStyle(styles.listContent);
  const [integrations, setIntegrations] = useState<ExportIntegration[]>([]);

  const load = useCallback(async () => {
    const all = await getExportIntegrations();
    setIntegrations(all);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleDelete = (integration: ExportIntegration) => {
    Alert.alert(
      LL.settings.exportIntegrationDeleteTitle(),
      LL.settings.exportIntegrationDeleteMessage(),
      [
        { text: LL.common.cancel(), style: 'cancel' },
        {
          text: LL.common.delete(),
          style: 'destructive',
          onPress: async () => {
            await deleteExportIntegration(integration.id);
            await load();
          },
        },
      ],
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: LL.settings.exportIntegrationsTitle(),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/settings/export-integration-form')}
              style={styles.addButton}
              accessibilityRole="button"
              accessibilityLabel={LL.settings.exportIntegrationAddTitle()}
            >
              <IconSymbol name="plus" size={22} color={palette.tint} />
            </Pressable>
          ),
        }}
      />

      <FlatList
        data={integrations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={contentStyle}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: palette.cardBackground }]}>
            <Pressable
              style={styles.rowMain}
              onPress={() =>
                router.push({
                  pathname: '/settings/export-integration-form',
                  params: { integrationId: item.id },
                })
              }
            >
              <View style={styles.rowTitleRow}>
                <ThemedText type="defaultSemiBold" style={styles.rowTitle}>
                  {item.name}
                </ThemedText>
                <View style={[styles.typeBadge, { backgroundColor: palette.backgroundSubtle }]}>
                  <ThemedText style={[styles.typeBadgeText, { color: palette.textMuted }]}>
                    {getTypeLabel(item)}
                  </ThemedText>
                </View>
              </View>
              <ThemedText style={[styles.rowSubtitle, { color: palette.textMuted }]}>
                {item.description || LL.settings.exportIntegrationNoDescription()}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => handleDelete(item)}
              style={styles.deleteButton}
              accessibilityRole="button"
              accessibilityLabel={LL.common.delete()}
            >
              <IconSymbol name="trash" size={18} color={palette.destructive} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText style={[styles.emptyText, { color: palette.textMuted }]}>
              {LL.settings.exportIntegrationEmpty()}
            </ThemedText>
            <Pressable
              style={[styles.addFirstButton, { backgroundColor: palette.tint }]}
              onPress={() => router.push('/settings/export-integration-form')}
            >
              <ThemedText style={[styles.addFirstButtonText, { color: palette.onTint }]}>
                {LL.settings.exportIntegrationAddTitle()}
              </ThemedText>
            </Pressable>
          </View>
        }
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: palette.border }]} />
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: Spacing.sm,
  },
  addButton: {
    padding: 8,
  },
  row: {
    borderRadius: 12,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowTitle: {
    fontSize: 16,
  },
  typeBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: '500',
  },
  rowSubtitle: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  deleteButton: {
    padding: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 16,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  addFirstButton: {
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  addFirstButtonText: {
    fontWeight: '600',
    fontSize: 15,
  },
});
