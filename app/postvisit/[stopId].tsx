import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopBar } from '../../src/components/ui/TopBar';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { typography } from '../../src/theme/typography';
import { useRouteStore } from '../../src/stores/useRouteStore';
import { useSyncStore } from '../../src/stores/useSyncStore';
import { buildPostvisitPayload } from '../../src/services/postvisitPayload';

const INTEREST_OPTIONS = [
  { value: 'high', label: 'Alto' },
  { value: 'medium', label: 'Medio' },
  { value: 'low', label: 'Bajo' },
] as const;

const FREEZER_OPTIONS = [
  { value: 'yes', label: 'Sí' },
  { value: 'no', label: 'No' },
] as const;

export default function ProspeccionScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const router = useRouter();
  const stop = useRouteStore((s) => s.stops.find((item) => item.id === Number(stopId)));
  const enqueue = useSyncStore((s) => s.enqueue);

  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [freezer, setFreezer] = useState<'yes' | 'no'>('no');
  const [interestLevel, setInterestLevel] = useState<'high' | 'medium' | 'low'>('medium');
  const [notes, setNotes] = useState('');

  const isLead = stop?._entityType === 'lead';
  const title = isLead ? 'Completar Lead' : 'Prospección';

  const canSave = useMemo(() => {
    return notes.trim().length > 0 || competitor.trim().length > 0 || contactName.trim().length > 0;
  }, [notes, competitor, contactName]);

  if (!stop) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar title="Prospección" showBack />
        <View style={styles.center}>
          <Text style={typography.dim}>Parada no encontrada</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentStop = stop;

  function handleSave() {
    if (!canSave) {
      Alert.alert('Faltan datos', 'Captura al menos contacto, competidor o notas.');
      return;
    }

    const payload = buildPostvisitPayload({
      stop: currentStop,
      form: {
        contactName,
        phone,
        email,
        competitor,
        freezer,
        interestLevel,
        notes,
      },
    });

    enqueue('prospection', {
      ...payload,
      timestamp: Date.now(),
    });

    Alert.alert(
      'Prospección guardada',
      isLead
        ? 'La actualización del lead quedó en cola de sincronización.'
        : 'La prospección quedó en cola de sincronización.',
      [
        {
          text: 'Continuar visita',
          onPress: () => router.replace(`/checkin/${currentStop.id}` as never),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title={title} showBack />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.headerTitle}>{currentStop.customer_name}</Text>
          <Text style={styles.headerSubtitle}>
            {isLead ? 'Actualiza la información comercial del lead.' : 'Registra información de prospección de la visita.'}
          </Text>
        </Card>

        <Text style={styles.inputLabel}>CONTACTO</Text>
        <TextInput
          style={styles.input}
          placeholder="Nombre del contacto"
          placeholderTextColor={colors.textDim}
          value={contactName}
          onChangeText={setContactName}
        />

        <Text style={styles.inputLabel}>TELÉFONO</Text>
        <TextInput
          style={styles.input}
          placeholder="Teléfono"
          placeholderTextColor={colors.textDim}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Text style={styles.inputLabel}>EMAIL</Text>
        <TextInput
          style={styles.input}
          placeholder="correo@ejemplo.com"
          placeholderTextColor={colors.textDim}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.inputLabel}>COMPETIDOR</Text>
        <TextInput
          style={styles.input}
          placeholder="Competidor detectado"
          placeholderTextColor={colors.textDim}
          value={competitor}
          onChangeText={setCompetitor}
        />

        <Text style={styles.inputLabel}>¿TIENE FREEZER?</Text>
        <View style={styles.chipRow}>
          {FREEZER_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, freezer === option.value && styles.chipSelected]}
              onPress={() => setFreezer(option.value)}
            >
              <Text style={[styles.chipText, freezer === option.value && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.inputLabel}>NIVEL DE INTERÉS</Text>
        <View style={styles.chipRow}>
          {INTEREST_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, interestLevel === option.value && styles.chipSelected]}
              onPress={() => setInterestLevel(option.value)}
            >
              <Text style={[styles.chipText, interestLevel === option.value && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.inputLabel}>NOTAS</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Observaciones de la visita"
          placeholderTextColor={colors.textDim}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
        />

        <Button
          label={isLead ? 'Guardar Lead' : 'Guardar Prospección'}
          onPress={handleSave}
          fullWidth
          disabled={!canSave}
          style={{ marginTop: 16 }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.screenPadding, paddingBottom: 100 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  headerSubtitle: { fontSize: 12, color: colors.textDim, marginTop: 6 },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textDim,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
  },
  textArea: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primaryAlpha12,
    borderColor: colors.primary,
  },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: colors.primary },
});
