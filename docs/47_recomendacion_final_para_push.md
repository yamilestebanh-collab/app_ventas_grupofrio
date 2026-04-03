# 47 — Recomendacion Final para Push

## Fecha: 2026-04-03

---

## VEREDICTO

# READY WITH MANUAL DEVICE TEST

---

## JUSTIFICACION

### Lo que SI esta validado (confianza alta):

1. **Causa raiz confirmada con evidencia**
   - wrapRpc() aplicado a endpoints REST → error 400
   - useSyncStore.ts usa payload plano en los MISMOS endpoints → funciona
   - Fix: reemplazar wrapRpc con postRest (payload plano)

2. **Compilacion limpia**
   - TypeScript: 0 errores en archivos modificados
   - Errores pre-existentes (alerts.tsx, index.tsx): no relacionados

3. **Zero regresion en codigo**
   - odooRpc.ts: sin cambios (JSON-RPC intacto)
   - useSyncStore.ts: sin cambios (cola offline intacta)
   - useAuthStore.ts: sin cambios (login intacto)
   - ranking.tsx: sin cambios (JSON-RPC intacto)
   - Firmas de funciones: identicas

4. **Consistencia de protocolo verificada**
   - gfLogistics.ts ahora envia payload plano = igual que useSyncStore.ts
   - Todos los endpoints REST usan postRest()
   - Todos los endpoints JSON-RPC siguen usando envoltorio manual

5. **Hardening aplicado (bonus)**
   - Anti double-tap en check-in y check-out
   - Guard de concurrencia en loadPlan
   - Logging mejorado en postRest (DEV only)

### Lo que NO se puede validar sin dispositivo real:

1. **Respuesta real del backend**
   - No podemos confirmar que getMyPlan() devuelve un GFPlan valido
   - No podemos confirmar el formato exacto de la respuesta (result vs data directo)
   - Necesitamos ver la respuesta real para confirmar el parsing

2. **MapView con datos reales**
   - react-native-maps requiere dev build (expo run:android)
   - No funciona en Expo Go
   - Necesitamos ver markers reales en el mapa

3. **Geofence y GPS**
   - Requiere dispositivo fisico con GPS real
   - Emulador no da coordenadas reales

4. **Offline sync end-to-end**
   - Requiere alternar modo avion en dispositivo real

---

## QUE FALTA PARA PUSH

### Minimo requerido (bloquea push):

1. **Test TC-01 (Login):** Confirmar que login sigue funcionando
2. **Test TC-02 (Mapa con markers):** Confirmar que stops se cargan y markers aparecen
3. **Test TC-04 (Check-in):** Confirmar que checkIn() no devuelve error 400

### Altamente recomendado (no bloquea pero de alto riesgo si falla):

4. **Test TC-07 (Check-out):** Confirmar checkout funciona
5. **Test TC-08 (Offline):** Confirmar que cola sync sigue igual
6. **Test TC-09 (Resync):** Confirmar resincronizacion

### Nice to have:

7. Tests TC-05, TC-06, TC-10 a TC-15

---

## RIESGOS RESIDUALES

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|-------------|---------|------------|
| Backend devuelve formato inesperado | Baja | Alto | postRest usa fallback result ?? data |
| Coordenadas (0,0) enviadas al server | Media | Bajo | Backend debe validar server-side |
| Plan/stops viejos en cache | Baja | Bajo | Rehydrate verifica fecha |
| Errores TS pre-existentes (alerts) | Ya existe | Bajo | No relacionados al fix |

---

## ARCHIVOS MODIFICADOS (resumen para code review)

| Archivo | Tipo de cambio | Lineas |
|---------|---------------|--------|
| src/services/gfLogistics.ts | REESCRITURA — wrapRpc eliminado | ~118 |
| src/services/api.ts | ADICION — postRest + postRpc helpers | +40 |
| app/checkin/[stopId].tsx | HARDENING — anti double-tap | +5 |
| app/checkout/[stopId].tsx | HARDENING — anti double-tap | +6 |
| src/stores/useRouteStore.ts | HARDENING — guard concurrencia | +1 |

---

## PROCESO RECOMENDADO

1. Sebastian hace dev build: `expo run:android`
2. Ejecuta TC-01, TC-02, TC-04 como minimo
3. Si pasan → push a GitHub
4. Si fallan → revisar respuesta del backend (posible variacion en formato)

---

## NOTA SOBRE ERRORES PRE-EXISTENTES

Los 13 errores de TypeScript en `alerts.tsx` e `index.tsx` son del commit de Sebastian
(08758f1). Estan relacionados con `useKoldStore` que no expone `.alerts` como propiedad
directa. Estos errores:
- NO son causados por nuestro fix
- NO afectan los flujos de plan/mapa/checkin
- Deben corregirse por separado
