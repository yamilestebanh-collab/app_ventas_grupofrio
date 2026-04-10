/**
 * BLD-20260408-P0 / BLD-20260410: Off-route / lead / new customer entry screen.
 *
 * Three modes:
 *   - "Cliente"   → search res.partner where customer_rank > 0
 *   - "Lead"      → search res.partner where customer_rank = 0 (prospects)
 *   - "Nuevo"     → navigate to /newcustomer form
 *
 * On selection:
 *   - Customer: create virtual stop, startVisit, go straight to /sale
 *   - Lead: create virtual stop flagged as lead, go to /sale; the sale
 *           screen will force data completion before confirm.
 *
 * All search is online-only (uses odooRead under the hood).
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
import { searchPartners, PartnerSearchResult, PartnerSearchMode } from '../src/services/partners';
import { useRouteStore } from '../src/stores/useRouteStore';
import { useVisitStore } from '../src/stores/useVisitStore';
import { useSyncStore } from '../src/stores/useSyncStore';

type Mode = 'customers' | 'leads';

export default function OffRouteScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('customers');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PartnerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const addVirtualStop = useRouteStore((s) => s.addVirtualStop);
  const isOnline = useSyncStore((s) => s.isOnline);

  const doSearch = useCallback(async () => {
    const q = search.trim();
    if (q.length < 3) {
      Alert.alert('Busqueda', 'Escribe al menos 3 caracteres');
      return;
    }
    if (!isOnline) {
      Alert.alert('Sin conexión', 'La búsqueda de clientes requiere conexión a internet.');
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    try {
      const mapped: PartnerSearchMode = mode === 'leads' ? 'leads' : 'customers';
      const list = await searchPartners(q, mapped, 30);
      setResults(list);
    } catch (error) {
      console.warn('[offroute] Search failed:', error);
      Alert.alert('Error', 'No se pudo buscar. Verifica tu conexión.');
    } finally {
      setIsSearching(false);
    }
  }, [search, mode, isOnline]);

  function handleSelect(partner: PartnerSearchResult) {
    const isLead = mode === 'leads' || (partner.customer_rank ?? 0) === 0;

    // Create a virtual stop and mark its lead/offroute metadata.
    const virtualStopId = addVirtualStop(partner.id, partner.name, {
      is_lead: isLead,
      is_offroute: true,
      origin_lead_id: isLead ? partner.id : undefined,
    });

    // Start a visit for this virtual stop
    const visitStore = useVisitStore.getState();
    visitStore.resetVisit();
    visitStore.startVisit(
      {
        id: virtualStopId,
        customer_id: partner.id,
        customer_name: partner.name,
        state: 'in_progress',
        source_model: 'gf.route.stop',
        is_lead: isLead,
        is_offroute: true,
        origin_lead_id: isLead ? partner.id : undefined,
        customer_rank: partner.customer_rank,
      },
      0, 0,
    );

    router.push(`/sale/${virtualStopId}` as never);
  }

  function handleNewCustomer() {
    router.push('/newcustomer' as never);
  }

  function renderPartner({ item }: { item: PartnerSearchResult }) {
    const isLead = (item.customer_rank ?? 0) === 0;
    const subtitle = [item.street, item.city].filter(Boolean).join(', ');
    const contact = item.phone || item.mobile || '';

    return (
      <TouchableOpacity
        style={[styles.customerCard, isLead && styles.leadCard]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.customerName} numberOfLines={1}>{item.name}</Text>
            {isLead && <Text style={styles.leadBadge}>LEAD</Text>}
          </View>
          {subtitle ? (
            <Text style={styles.customerSubtitle} numberOfLines={1}>{subtitle}</Text>
          ) : null}
          {contact ? (
            <Text style={styles.customerContact}>{contact}</Text>
          ) : null}
          {item.vat ? (
            <Text style={styles.customerContact}>RFC: {item.vat}</Text>
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
        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'customers' && styles.modeBtnActive]}
            onPress={() => { setMode('customers'); setResults([]); setHasSearched(false); }}
          >
            <Text style={[styles.modeBtnText, mode === 'customers' && styles.modeBtnTextActive]}>
              Cliente
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'leads' && styles.modeBtnActive]}
            onPress={() => { setMode('leads'); setResults([]); setHasSearched(false); }}
          >
            <Text style={[styles.modeBtnText, mode === 'leads' && styles.modeBtnTextActive]}>
              Lead / Prospecto
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={mode === 'leads'
              ? 'Buscar lead por nombre, teléfono o RFC...'
              : 'Buscar cliente por nombre, teléfono o RFC...'}
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

        {/* New customer CTA */}
        <TouchableOpacity style={styles.newCustomerCta} onPress={handleNewCustomer}>
          <Text style={styles.newCustomerIcon}>＋</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.newCustomerTitle}>Dar de alta nuevo cliente</Text>
            <Text style={styles.newCustomerHint}>
              Si no existe todavía en el sistema
            </Text>
          </View>
          <Text style={styles.selectArrow}>{'>'}</Text>
        </TouchableOpacity>

        {/* Results */}
        {isSearching ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[typography.dim, { marginTop: 10 }]}>Buscando...</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            renderItem={renderPartner}
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
                    Prueba con otro nombre o cambia a {mode === 'leads' ? 'Cliente' : 'Lead'}
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
  // Mode toggle
  modeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    marginBottom: 10,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.button,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDim,
  },
  modeBtnTextActive: { color: '#FFF' },
  // Search
  searchRow: {
    flexDirection: 'row', gap: 8, marginBottom: 10,
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
  // New customer CTA
  newCustomerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.cardLighter,
    borderRadius: radii.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  newCustomerIcon: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '700',
    width: 28,
    textAlign: 'center',
  },
  newCustomerTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  newCustomerHint: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  // List
  list: { paddingBottom: 80 },
  customerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radii.card,
    padding: 14, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  leadCard: {
    borderLeftColor: colors.warning,
  },
  customerName: { fontSize: 14, fontWeight: '700', color: colors.text },
  leadBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.warning,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    letterSpacing: 0.4,
  },
  customerSubtitle: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  customerContact: { fontSize: 11, color: colors.primary, marginTop: 2 },
  selectArrow: { fontSize: 18, color: colors.textDim, marginLeft: 8 },
  emptyCard: {
    backgroundColor: colors.card, borderRadius: radii.card,
    padding: 30, alignItems: 'center', marginTop: 20,
  },
});
