/**
 * New Customer screen — Create a new customer in the field.
 * Requires allowCreateCustomer permission from the route config.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '../src/components/ui/TopBar';
import { colors, spacing, radii } from '../src/theme/tokens';

interface FormData {
  nombre: string;
  telefono: string;
  direccion: string;
  canal: string;
}

export default function NewCustomerScreen() {
  const [form, setForm] = useState<FormData>({
    nombre: '',
    telefono: '',
    direccion: '',
    canal: '',
  });

  function updateField(key: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Nuevo Cliente" showBack />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionIcon}>🔒</Text>
          <Text style={styles.permissionText}>
            Requiere permiso allowCreateCustomer
          </Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre del cliente o negocio"
            placeholderTextColor={colors.textDim}
            value={form.nombre}
            onChangeText={(v) => updateField('nombre', v)}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Telefono</Text>
          <TextInput
            style={styles.input}
            placeholder="10 digitos"
            placeholderTextColor={colors.textDim}
            keyboardType="phone-pad"
            value={form.telefono}
            onChangeText={(v) => updateField('telefono', v)}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Direccion</Text>
          <TextInput
            style={styles.input}
            placeholder="Calle, numero, colonia"
            placeholderTextColor={colors.textDim}
            value={form.direccion}
            onChangeText={(v) => updateField('direccion', v)}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Canal</Text>
          <TextInput
            style={styles.input}
            placeholder="Tienda, restaurante, mayoreo..."
            placeholderTextColor={colors.textDim}
            value={form.canal}
            onChangeText={(v) => updateField('canal', v)}
          />
        </View>

        <Text style={styles.hint}>
          El cliente se creara localmente y se sincronizara con el servidor en
          el proximo sync. El supervisor debera aprobar el alta.
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
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,107,53,0.08)',
    borderRadius: radii.button,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  permissionIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  permissionText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDim,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.card,
  },
  hint: {
    fontSize: 12,
    color: colors.textDim,
    lineHeight: 18,
    marginTop: spacing.md,
  },
});
