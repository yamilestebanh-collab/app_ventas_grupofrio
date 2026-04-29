import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProductStore, TruckProduct } from '../../stores/useProductStore';
import { TopBar } from '../ui/TopBar';
import { colors, spacing, radii } from '../../theme/tokens';
import { typography, fonts } from '../../theme/typography';

interface GiftProductPickerProps {
  visible: boolean;
  excludedProductIds: number[];
  onClose: () => void;
  onSelect: (product: TruckProduct) => void;
}

function fuzzyMatch(text: string, query: string): boolean {
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return normalizedQuery.split(/\s+/).every((part) => normalizedText.includes(part));
}

export function GiftProductPicker({
  visible,
  excludedProductIds,
  onClose,
  onSelect,
}: GiftProductPickerProps) {
  const products = useProductStore((s) => s.products);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return products
      .filter((product) => !excludedProductIds.includes(product.id))
      .filter((product) => fuzzyMatch(`${product.name} ${product.default_code || ''}`, search))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [excludedProductIds, products, search]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar title="Seleccionar Producto" showBack onBack={onClose} />
        <View style={styles.content}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar producto..."
            placeholderTextColor={colors.textDim}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />

          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={(
              <View style={styles.emptyState}>
                <Text style={typography.dim}>Sin productos para mostrar</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.8}
                onPress={() => {
                  onSelect(item);
                  setSearch('');
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {item.default_code || 'Sin clave'} · Disponible: {item.qty_display}
                  </Text>
                </View>
                <Text style={styles.arrow}>{'>'}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: spacing.screenPadding },
  searchInput: {
    backgroundColor: colors.cardLighter,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
    marginBottom: 12,
  },
  list: { paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    marginBottom: 8,
  },
  name: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { fontSize: 11, color: colors.textDim, marginTop: 4 },
  arrow: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    color: colors.primary,
  },
  emptyState: {
    padding: 20,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    alignItems: 'center',
  },
});
