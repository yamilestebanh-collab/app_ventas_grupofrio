/**
 * BLD-20260410: Lead → Customer conversion modal.
 *
 * Shown before a sale can be confirmed when the current stop is a lead
 * (customer_rank=0 or is_lead=true). Forces the vendor to complete
 * minimum data so the lead becomes a usable customer in Odoo.
 *
 * On confirm:
 *   1. Calls convertLeadToCustomer() which updates the existing partner
 *      and flips customer_rank to 1.
 *   2. Notifies the parent (sale screen) via onConfirmed so the sale can
 *      proceed with the now-promoted partner.
 *
 * Requires online. If offline, blocks with a clear message.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radii } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { convertLeadToCustomer, getPartner } from '../../services/partners';
import { useSyncStore } from '../../stores/useSyncStore';

interface Props {
  visible: boolean;
  partnerId: number;
  initialName: string;
  onClose: () => void;
  onConfirmed: () => void;
}

interface FormData {
  nombre: string;
  telefono: string;
  rfc: string;
  calle: string;
  colonia: string;
  ciudad: string;
  referencia: string;
}

export function LeadConversionModal({
  visible, partnerId, initialName, onClose, onConfirmed,
}: Props) {
  const [form, setForm] = useState<FormData>({
    nombre: initialName || '',
    telefono: '',
    rfc: '',
    calle: '',
    colonia: '',
    ciudad: '',
    referencia: '',
  });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isOnline = useSyncStore((s) => s.isOnline);

  // Pre-fill with existing partner data when the modal opens.
  useEffect(() => {
    if (!visible || !partnerId) return;
    if (!isOnline) return;
    setLoading(true);
    getPartner(partnerId)
      .then((p) => {
        if (p) {
          setForm({
            nombre: p.name || initialName || '',
            telefono: p.phone || p.mobile || '',
            rfc: p.vat || '',
            calle: p.street || '',
            colonia: p.street2 || '',
            ciudad: p.city || '',
            referencia: '',
          });
        }
      })
      .finally(() => setLoading(false));
  }, [visible, partnerId, initialName, isOnline]);

  function updateField(key: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleConfirm() {
    if (submitting) return;

    const name = form.nombre.trim();
    if (name.length < 3) {
      Alert.alert('Nombre requerido', 'Escribe el nombre o razón social (mínimo 3 caracteres).');
      return;
    }
    if (!form.telefono.trim() && !form.calle.trim()) {
      Alert.alert(
        'Datos insuficientes',
        'Captura al menos el teléfono o la dirección para convertir el lead en cliente.',
      );
      return;
    }
    if (!isOnline) {
      Alert.alert(
        'Sin conexión',
        'La conversión de lead a cliente requiere conexión. Conéctate y reintenta.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const ok = await convertLeadToCustomer(partnerId, {
        name,
        phone: form.telefono,
        street: form.calle,
        street2: form.colonia,
        city: form.ciudad,
        vat: form.rfc,
        comment: form.referencia,
      });

      if (!ok) {
        Alert.alert(
          'No se pudo convertir',
          'El servidor rechazó la actualización del lead. Verifica los datos.',
        );
        setSubmitting(false);
        return;
      }

      onConfirmed();
    } catch (err) {
      console.warn('[LeadConversionModal] convert failed:', err);
      Alert.alert('Error', 'Ocurrió un error al convertir el lead. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={submitting}>
            <Text style={styles.close}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Completar datos del lead</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>
            Este contacto está marcado como lead. Completa los datos mínimos
            para convertirlo en cliente y continuar con la venta.
          </Text>

          {loading && (
            <View style={{ alignItems: 'center', marginVertical: spacing.md }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.hint, { marginTop: 6 }]}>Cargando datos del lead...</Text>
            </View>
          )}

          <Field
            label="Nombre / Razón social *"
            value={form.nombre}
            onChange={(v) => updateField('nombre', v)}
            disabled={submitting}
          />
          <Field
            label="Teléfono"
            value={form.telefono}
            onChange={(v) => updateField('telefono', v)}
            disabled={submitting}
            keyboardType="phone-pad"
            maxLength={15}
          />
          <Field
            label="RFC (opcional)"
            value={form.rfc}
            onChange={(v) => updateField('rfc', v)}
            disabled={submitting}
            autoCapitalize="characters"
            maxLength={13}
          />
          <Field
            label="Calle y número"
            value={form.calle}
            onChange={(v) => updateField('calle', v)}
            disabled={submitting}
          />
          <Field
            label="Colonia / Zona"
            value={form.colonia}
            onChange={(v) => updateField('colonia', v)}
            disabled={submitting}
          />
          <Field
            label="Ciudad"
            value={form.ciudad}
            onChange={(v) => updateField('ciudad', v)}
            disabled={submitting}
          />
          <Field
            label="Notas / Referencia"
            value={form.referencia}
            onChange={(v) => updateField('referencia', v)}
            disabled={submitting}
            multiline
          />

          <Button
            label={submitting ? 'Convirtiendo...' : 'Convertir y continuar venta'}
            onPress={handleConfirm}
            fullWidth
            disabled={submitting || loading || !isOnline}
            loading={submitting}
            style={{ marginTop: spacing.md }}
          />

          {!isOnline && (
            <Text style={[styles.hint, { marginTop: spacing.sm, color: colors.warning, textAlign: 'center' }]}>
              Sin conexión. Necesitas internet para convertir el lead.
            </Text>
          )}

          <Text style={styles.hint}>
            Tras convertir, el lead queda como cliente normal (customer_rank=1)
            y la venta continúa con el mismo partner_id.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'characters' | 'words' | 'sentences';
  maxLength?: number;
}

function Field({
  label, value, onChange, disabled, multiline, keyboardType, autoCapitalize, maxLength,
}: FieldProps) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { minHeight: 60 }]}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        placeholderTextColor={colors.textDim}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  close: { fontSize: 14, color: colors.primary, fontWeight: '600', width: 60 },
  content: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  intro: {
    fontSize: 12,
    color: colors.textDim,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textDim,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    fontSize: 11,
    color: colors.textDim,
    lineHeight: 16,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
});
