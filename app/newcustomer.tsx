/**
 * BLD-20260410: New Customer screen — create a customer in the field and
 * optionally jump straight into a sale with them.
 *
 * Flow:
 *   1. Vendor fills the minimum form (name + phone + address/ref).
 *   2. On submit we call createPartner() — requires online.
 *   3. On success, we create a virtual stop + start a visit and
 *      navigate to /sale/{virtualStopId}.
 *   4. If offline, we block with a clear message (pilot rule: partner
 *      creation is online-only to guarantee a valid partner_id for sync).
 *
 * Minimum required field: nombre. Todo lo demás es opcional pero se
 * recomienda para que el cliente quede usable en el sistema.
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, Alert,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TopBar } from '../src/components/ui/TopBar';
import { Button } from '../src/components/ui/Button';
import { colors, spacing, radii } from '../src/theme/tokens';
import { createPartner } from '../src/services/partners';
import { useRouteStore } from '../src/stores/useRouteStore';
import { useVisitStore } from '../src/stores/useVisitStore';
import { useSyncStore } from '../src/stores/useSyncStore';

interface FormData {
  nombre: string;
  telefono: string;
  rfc: string;
  calle: string;
  colonia: string;
  ciudad: string;
  referencia: string;
}

const EMPTY_FORM: FormData = {
  nombre: '',
  telefono: '',
  rfc: '',
  calle: '',
  colonia: '',
  ciudad: '',
  referencia: '',
};

export default function NewCustomerScreen() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const addVirtualStop = useRouteStore((s) => s.addVirtualStop);
  const isOnline = useSyncStore((s) => s.isOnline);

  function updateField(key: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (submitting) return;

    const name = form.nombre.trim();
    if (name.length < 3) {
      Alert.alert('Nombre requerido', 'Escribe el nombre o razón social del cliente (mínimo 3 caracteres).');
      return;
    }

    if (!isOnline) {
      Alert.alert(
        'Sin conexión',
        'Crear un cliente requiere conexión a internet. Conéctate y vuelve a intentar.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const partnerId = await createPartner({
        name,
        phone: form.telefono,
        street: form.calle,
        street2: form.colonia,
        city: form.ciudad,
        vat: form.rfc,
        comment: form.referencia,
      });

      if (!partnerId) {
        Alert.alert(
          'No se pudo crear',
          'El servidor rechazó la creación del cliente. Verifica los datos e intenta de nuevo.',
        );
        setSubmitting(false);
        return;
      }

      // Create virtual stop bound to the new partner and start a visit.
      const virtualStopId = addVirtualStop(partnerId, name, {
        is_lead: false,
        is_offroute: true,
      });

      const visitStore = useVisitStore.getState();
      visitStore.resetVisit();
      visitStore.startVisit(
        {
          id: virtualStopId,
          customer_id: partnerId,
          customer_name: name,
          state: 'in_progress',
          source_model: 'gf.route.stop',
          is_offroute: true,
          customer_rank: 1,
        },
        0, 0,
      );

      Alert.alert(
        'Cliente creado',
        `${name} quedó dado de alta. Continuamos con la venta.`,
        [
          {
            text: 'OK',
            // BLD-20260410-CRIT: use push (not replace) so the vendor can
            // use Android back to return to offroute / home if needed.
            onPress: () => router.push(`/sale/${virtualStopId}` as never),
          },
        ],
      );
    } catch (err) {
      console.warn('[newcustomer] submit failed:', err);
      Alert.alert('Error', 'Ocurrió un error creando el cliente. Intenta de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Nuevo Cliente" showBack />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Datos mínimos para dar de alta un cliente en campo. Solo el nombre es
          obligatorio; el resto recomendado para que quede usable en Odoo.
        </Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Nombre / Razón social *</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre del cliente o negocio"
            placeholderTextColor={colors.textDim}
            value={form.nombre}
            onChangeText={(v) => updateField('nombre', v)}
            editable={!submitting}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Teléfono</Text>
          <TextInput
            style={styles.input}
            placeholder="10 dígitos"
            placeholderTextColor={colors.textDim}
            keyboardType="phone-pad"
            value={form.telefono}
            onChangeText={(v) => updateField('telefono', v)}
            editable={!submitting}
            maxLength={15}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>RFC (opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Si es persona moral o solicita factura"
            placeholderTextColor={colors.textDim}
            autoCapitalize="characters"
            value={form.rfc}
            onChangeText={(v) => updateField('rfc', v)}
            editable={!submitting}
            maxLength={13}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Calle y número</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Av. Juárez 123"
            placeholderTextColor={colors.textDim}
            value={form.calle}
            onChangeText={(v) => updateField('calle', v)}
            editable={!submitting}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Colonia / Zona</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Centro"
            placeholderTextColor={colors.textDim}
            value={form.colonia}
            onChangeText={(v) => updateField('colonia', v)}
            editable={!submitting}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Ciudad</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Guadalajara"
            placeholderTextColor={colors.textDim}
            value={form.ciudad}
            onChangeText={(v) => updateField('ciudad', v)}
            editable={!submitting}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Referencia / Contacto</Text>
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            placeholder="Nombre de contacto, referencia del local, horario..."
            placeholderTextColor={colors.textDim}
            value={form.referencia}
            onChangeText={(v) => updateField('referencia', v)}
            editable={!submitting}
            multiline
          />
        </View>

        <Button
          label={submitting ? 'Creando...' : 'Crear y vender'}
          onPress={handleSubmit}
          fullWidth
          disabled={submitting || !isOnline}
          loading={submitting}
          style={{ marginTop: spacing.md }}
        />

        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineIcon}>⚠️</Text>
            <Text style={styles.offlineText}>
              Sin conexión. Conéctate para crear el cliente.
            </Text>
          </View>
        )}

        <Text style={styles.hint}>
          El cliente queda inmediatamente usable (customer_rank=1). La venta se
          vinculará automáticamente al nuevo partner_id.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  intro: {
    fontSize: 12,
    color: colors.textDim,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  fieldGroup: {
    marginBottom: spacing.md,
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
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: radii.button,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  offlineIcon: { fontSize: 18 },
  offlineText: { fontSize: 12, color: colors.warning, flex: 1 },
  hint: {
    fontSize: 11,
    color: colors.textDim,
    lineHeight: 16,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
});
