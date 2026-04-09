/**
 * BLD-20260408-P0: Off-route sale screen.
 * Allows searching for customers not in today's plan and initiating a sale.
 *
 * Flow:
 * 1. Driver searches for customer by name
 * 2. Selects customer from results
 * 3. Virtual stop is created in route store
 * 4. Navigates to standard sale screen with virtualStopId
 *
 * Uses odooRead to search res.partner.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TopBar } from '../src/components/ui/TopBar';
import { colors, spacing, radii } from '../src/theme/tokens';
import { typography } from '../src/theme/typography';
import { odooRead } from '../src/services/odooRpc';
import { useRouteStore } from '../src/stores/useRouteStore';
import { useAuthStore } from '../src/stores/useAuthStore';
import { useVisitStore } from '../src/stores/useVisitStore';

interface CustomerResult {
  id: number;
  name: string;
  street?: string;
  city?: string;
  phone?: string;
  mobile?: string;
  vat?: string;
}

const CUSTOMER_FIELDS = ['id', 'name', 'street', 'city', 'phone', 'mobile', 'vat'];

export default function OffRouteScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const addVirtualStop = useRouteStore((s) => s.addVirtualStop);
  const customerIds = useAuthStore((s) => s.customerIds);
  const allowFreeVisitsMode = useAuthStore((s) => s.allowFreeVisitsMode);

  const doSearch = useCallback(async () => {
    const q = search.trim();
    if (q.length < 3) {
      Alert.alert('Busqueda', 'Escribe al menos 3 caracteres');
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    try {
      // Search by name (ilike) — also try phone and vat
      const domain: unknown[] = [
        '&',
        ['customer_rank', '>', 0],
        '|', '|',
        ['name', 'ilike', q],
        ['phone', 'ilike', q],
        ['vat', 'ilike', q],
      ];

      const customers = await odooRead<CustomerResult>(
        'res.partner',
        domain,
        CUSTOMER_FIELDS,
        30,
      );

      setResults(customers);
    } catch (error) {
      console.warn('[offroute] Search failed:', error);
      Alert.alert('Error', 'No se pudo buscar clientes. Verifica tu conexion.');
    } finally {
      setIsSearching(false);
    }
  }, [search]);

  function handleSelect(customer: CustomerResult) {
    // Create a virtual stop and navigate to the sale screen
    const virtualStopId = addVirtualStop(customer.id, customer.name);

    // Start a visit for this virtual stop
    const visitStore = useVisitStore.getState();
    visitStore.resetVisit();
    visitStore.startVisit(
      {
        id: virtualStopId,
        customer_id: customer.id,
        customer_name: customer.name,
        state: 'in_progress',
        source_model: 'gf.route.stop',
      },
      0, 0, // lat/lon — GPS will provide real values if available
    );

    // Navigate to sale screen with virtualStopId
    router.push(`/sale/${virtualStopId}` as never);
  }

  function renderCustomer({ item }: { item: CustomerResult }) {
    const subtitle = [item.street, item.city].filter(Boolean).join(', ');
    const contact = item.phone || item.mobile || '';

    return (
      <TouchableOpacity
        style={styles.customerCard}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.customerName} numberOfLines={1}>{item.name}</Text>
          {subtitle ? (
            <Text style={styles.customerSubtitle} numberOfLines={1}>{subtitle}</Text>
          ) : null}
          {contact ? (
            <Text style={styles.customerContact}>{contact}</Text>
          ) : null}
        </View>
        <Text style={styles.selectArrow}>{'>'}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Venta Fuera de Ruta" showBack />

      <View style={styles.content}>
        {/* Search bar */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar cliente por nombre, telefono o RFC..."
            placeholderTextColor={colors.textDim}
            value={search}
            onChangeText={setSearch}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={doSearch}
          />
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={doSearch}
            disabled={isSearching}
          >
            <Text style={styles.searchBtnText}>
              {isSearching ? '...' : 'Buscar'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <Text style={styles.infoText}>
          Busca un cliente que no este en tu ruta de hoy para registrar una venta.
        </Text>

        {/* Results */}
        {isSearching ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[typography.dim, { marginTop: 10 }]}>Buscando...</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            renderItem={renderCustomer}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              hasSearched ? (
                <View style={styles.emptyCard}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>🔍</Text>
                  <Text style={typography.dim}>
                    Sin resultados para "{search}"
                  </Text>
                  <Text style={[typography.dim, { fontSize: 11, marginTop: 4 }]}>
                    Verifica el nombre o prueba con telefono/RFC
                  </Text>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: spacing.screenPadding },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchRow: {
    flexDirection: 'row', gap: 8, marginBottom: 8, marginTop: 4,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.button, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 14,
  },
  searchBtn: {
    backgroundColor: colors.primary, borderRadius: radii.button,
    paddingHorizontal: 18, justifyContent: 'center',
  },
  searchBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  infoText: {
    fontSize: 11, color: colors.textDim, marginBottom: 12,
    lineHeight: 16,
  },
  list: { paddingBottom: 80 },
  customerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radii.card,
    padding: 14, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  customerName: { fontSize: 14, fontWeight: '700', color: colors.text },
  customerSubtitle: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  customerContact: { fontSize: 11, color: colors.primary, marginTop: 2 },
  selectArrow: { fontSize: 18, color: colors.textDim, marginLeft: 8 },
  emptyCard: {
    backgroundColor: colors.card, borderRadius: radii.card,
    padding: 30, alignItems: 'center', marginTop: 20,
  },
});
