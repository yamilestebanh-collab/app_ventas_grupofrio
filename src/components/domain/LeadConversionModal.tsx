/**
 * BLD-20260410-CRIT: Lead → Customer conversion modal (v2).
 *
 * Shown before a sale can be confirmed when the current stop is a lead
 * (customer_rank=0 or is_lead=true). Forces the vendor to complete the
 * minimum comercial data + (optional) datos fiscales so the lead becomes
 * a real customer in Odoo.
 *
 * Field set (alineado con requerimiento operativo 2026-04-10):
 *   Datos comerciales (siempre):
 *     - Nombre del propietario *
 *     - Email
 *     - Teléfono *
 *     - Capacidad de conservador (lt / kg de hielo)
 *     - Dirección (calle, colonia, ciudad)
 *   ¿Necesita factura?  (toggle)
 *     Si sí:
 *       - Razón social completa *
 *       - RFC *
 *       - Código postal *
 *       - Régimen fiscal (selector)
 *       - Uso de CFDI (selector)
 *
 * Pre-rellena lo que ya exista en res.partner.
 *
 * Al confirmar llama convertLeadToCustomer() que hace write a res.partner
 * fijando customer_rank=1 y persistiendo los campos fiscales. Si el
 * backend no expone todos los campos custom, los ignora sin romper la
 * promoción (es tolerante al esquema).
 *
 * Requiere online.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, Switch,
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
  // Comercial
  nombre: string;
  email: string;
  telefono: string;
  conservadorCapacidad: string; // libre: "120 lt" / "15 kg de hielo"
  calle: string;
  colonia: string;
  ciudad: string;
  referencia: string;
  // Fiscal
  necesitaFactura: boolean;
  razonSocial: string;
  rfc: string;
  codigoPostal: string;
  regimenFiscal: string;
  usoCfdi: string;
}

const EMPTY: FormData = {
  nombre: '',
  email: '',
  telefono: '',
  conservadorCapacidad: '',
  calle: '',
  colonia: '',
  ciudad: '',
  referencia: '',
  necesitaFactura: false,
  razonSocial: '',
  rfc: '',
  codigoPostal: '',
  regimenFiscal: '',
  usoCfdi: '',
};

// Regímenes fiscales más usados en MX (SAT).
const REGIMENES = [
  { code: '601', label: '601 · General Personas Morales' },
  { code: '603', label: '603 · Personas Morales sin fines de lucro' },
  { code: '605', label: '605 · Sueldos y Salarios' },
  { code: '612', label: '612 · Actividades Empresariales' },
  { code: '621', label: '621 · Incorporación Fiscal' },
  { code: '626', label: '626 · RESICO' },
];

// Usos CFDI más comunes.
const USOS = [
  { code: 'G01', label: 'G01 · Adquisición de mercancías' },
  { code: 'G03', label: 'G03 · Gastos en general' },
  { code: 'P01', label: 'P01 · Por definir' },
  { code: 'S01', label: 'S01 · Sin efectos fiscales' },
];

export function LeadConversionModal({
  visible, partnerId, initialName, onClose, onConfirmed,
}: Props) {
  const [form, setForm] = useState<FormData>({ ...EMPTY, nombre: initialName || '' });
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
          setForm((prev) => ({
            ...prev,
            nombre: p.name || initialName || '',
            telefono: p.phone || p.mobile || '',
            rfc: p.vat || '',
            calle: p.street || '',
            colonia: p.street2 || '',
            ciudad: p.city || '',
          }));
        }
      })
      .finally(() => setLoading(false));
  }, [visible, partnerId, initialName, isOnline]);

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleConfirm() {
    if (submitting) return;

    const name = form.nombre.trim();
    if (name.length < 3) {
      Alert.alert('Nombre requerido', 'Escribe el nombre del propietario (mínimo 3 caracteres).');
      return;
    }
    if (!form.telefono.trim()) {
      Alert.alert('Teléfono requerido', 'Captura un teléfono para convertir el lead en cliente.');
      return;
    }
    if (form.necesitaFactura) {
      if (form.razonSocial.trim().length < 3) {
        Alert.alert('Datos fiscales', 'Captura la razón social completa.');
        return;
      }
      if (form.rfc.trim().length < 12) {
        Alert.alert('Datos fiscales', 'El RFC es obligatorio (12 o 13 caracteres).');
        return;
      }
      if (form.codigoPostal.trim().length !== 5) {
        Alert.alert('Datos fiscales', 'El código postal debe tener 5 dígitos.');
        return;
      }
      if (!form.regimenFiscal) {
        Alert.alert('Datos fiscales', 'Selecciona el régimen fiscal.');
        return;
      }
      if (!form.usoCfdi) {
        Alert.alert('Datos fiscales', 'Selecciona el uso de CFDI.');
        return;
      }
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
      // Notes carry libre-text: capacidad conservador + referencia.
      const commentParts: string[] = [];
      if (form.conservadorCapacidad.trim()) {
        commentParts.push(`Conservador: ${form.conservadorCapacidad.trim()}`);
      }
      if (form.referencia.trim()) {
        commentParts.push(`Ref: ${form.referencia.trim()}`);
      }

      const updates: Record<string, unknown> = {
        name: form.necesitaFactura && form.razonSocial.trim()
          ? form.razonSocial.trim()
          : name,
        phone: form.telefono.trim(),
        street: form.calle.trim() || undefined,
        street2: form.colonia.trim() || undefined,
        city: form.ciudad.trim() || undefined,
        vat: form.necesitaFactura ? form.rfc.trim().toUpperCase() : undefined,
        comment: commentParts.join(' · '),
      };

      // Optional email
      if (form.email.trim()) {
        updates.email = form.email.trim();
      }

      // Fiscal fields — only sent when "necesita factura".
      // Backend may or may not have these custom fields; Odoo create/write
      // ignores unknown keys through create_update, so sending is safe.
      if (form.necesitaFactura) {
        updates.zip = form.codigoPostal.trim();
        updates.l10n_mx_edi_fiscal_regime = form.regimenFiscal;
        updates.l10n_mx_edi_usage = form.usoCfdi;
        updates.property_account_position_id = false; // force default
        updates.x_kold_requiere_factura = true;
      }

      // Store capacidad conservador in a custom field too (if backend supports it).
      if (form.conservadorCapacidad.trim()) {
        updates.x_kold_conservador_capacidad = form.conservadorCapacidad.trim();
      }

      const ok = await convertLeadToCustomer(partnerId, updates as any);

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
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={submitting}>
            <Text style={styles.close}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Convertir lead a cliente</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>
            Este contacto es un lead. Completa los datos mínimos comerciales
            (y, si procede, los fiscales) para convertirlo en cliente.
          </Text>

          {loading && (
            <View style={{ alignItems: 'center', marginVertical: spacing.md }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.hint, { marginTop: 6 }]}>Cargando datos del lead...</Text>
            </View>
          )}

          {/* ═══ Datos comerciales ═══ */}
          <Text style={styles.sectionTitle}>Datos del propietario</Text>

          <Field
            label="Nombre del propietario *"
            value={form.nombre}
            onChange={(v) => updateField('nombre', v)}
            disabled={submitting}
          />
          <Field
            label="Email"
            value={form.email}
            onChange={(v) => updateField('email', v)}
            disabled={submitting}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Teléfono *"
            value={form.telefono}
            onChange={(v) => updateField('telefono', v)}
            disabled={submitting}
            keyboardType="phone-pad"
            maxLength={15}
          />
          <Field
            label="Capacidad del conservador"
            value={form.conservadorCapacidad}
            onChange={(v) => updateField('conservadorCapacidad', v)}
            disabled={submitting}
            placeholder="Ej. 120 lt / 15 kg de hielo"
          />

          <Text style={styles.sectionTitle}>Dirección</Text>
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
            label="Referencia adicional"
            value={form.referencia}
            onChange={(v) => updateField('referencia', v)}
            disabled={submitting}
            multiline
          />

          {/* ═══ Factura toggle ═══ */}
          <View style={styles.factToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.factToggleLabel}>¿Necesita factura?</Text>
              <Text style={styles.factToggleHint}>
                Activa para capturar los datos fiscales (RFC, CP, régimen...).
              </Text>
            </View>
            <Switch
              value={form.necesitaFactura}
              onValueChange={(v) => updateField('necesitaFactura', v)}
              disabled={submitting}
              trackColor={{ true: colors.primary }}
            />
          </View>

          {form.necesitaFactura && (
            <>
              <Text style={styles.sectionTitle}>Datos fiscales</Text>
              <Field
                label="Razón social completa *"
                value={form.razonSocial}
                onChange={(v) => updateField('razonSocial', v)}
                disabled={submitting}
              />
              <Field
                label="RFC *"
                value={form.rfc}
                onChange={(v) => updateField('rfc', v.toUpperCase())}
                disabled={submitting}
                autoCapitalize="characters"
                maxLength={13}
              />
              <Field
                label="Código postal *"
                value={form.codigoPostal}
                onChange={(v) => updateField('codigoPostal', v.replace(/[^0-9]/g, ''))}
                disabled={submitting}
                keyboardType="phone-pad"
                maxLength={5}
              />

              <Text style={styles.label}>Régimen fiscal *</Text>
              <View style={styles.pickList}>
                {REGIMENES.map((r) => (
                  <TouchableOpacity
                    key={r.code}
                    style={[
                      styles.pickItem,
                      form.regimenFiscal === r.code && styles.pickItemActive,
                    ]}
                    onPress={() => updateField('regimenFiscal', r.code)}
                    disabled={submitting}
                  >
                    <Text style={[
                      styles.pickItemText,
                      form.regimenFiscal === r.code && styles.pickItemTextActive,
                    ]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { marginTop: spacing.md }]}>Uso de CFDI *</Text>
              <View style={styles.pickList}>
                {USOS.map((u) => (
                  <TouchableOpacity
                    key={u.code}
                    style={[
                      styles.pickItem,
                      form.usoCfdi === u.code && styles.pickItemActive,
                    ]}
                    onPress={() => updateField('usoCfdi', u.code)}
                    disabled={submitting}
                  >
                    <Text style={[
                      styles.pickItemText,
                      form.usoCfdi === u.code && styles.pickItemTextActive,
                    ]}>{u.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Button
            label={submitting ? 'Convirtiendo...' : 'Convertir y continuar venta'}
            onPress={handleConfirm}
            fullWidth
            disabled={submitting || loading || !isOnline}
            loading={submitting}
            style={{ marginTop: spacing.lg }}
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
  placeholder?: string;
}

function Field({
  label, value, onChange, disabled, multiline, keyboardType, autoCapitalize, maxLength, placeholder,
}: FieldProps) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { minHeight: 60 }]}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        placeholder={placeholder}
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
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    color: colors.primary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
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
  // Factura toggle
  factToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardLighter,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  factToggleLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  factToggleHint: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 2,
  },
  // Picklist for régimen / uso CFDI
  pickList: {
    gap: 6,
  },
  pickItem: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickItemActive: {
    backgroundColor: 'rgba(37,99,235,0.12)',
    borderColor: colors.primary,
  },
  pickItemText: { fontSize: 12, color: colors.text },
  pickItemTextActive: { color: colors.primary, fontWeight: '700' },
  hint: {
    fontSize: 11,
    color: colors.textDim,
    lineHeight: 16,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
});
