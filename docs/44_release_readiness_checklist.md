# 44 — Release Readiness Checklist

## Fecha: 2026-04-03
## Fix: Eliminacion de wrapRpc en endpoints REST de gfLogistics

---

### A. COMPILACION Y CODIGO

| # | Check | Estado | Notas |
|---|-------|--------|-------|
| A1 | TypeScript compila sin errores nuevos | PASS | 0 errores en archivos modificados |
| A2 | wrapRpc eliminado completamente | PASS | grep = 0 resultados |
| A3 | Imports no rotos | PASS | 4 consumidores verificados |
| A4 | Firmas de funciones sin cambios | PASS | Compatibilidad total |
| A5 | postRest/postRpc helpers creados | PASS | En api.ts |
| A6 | Documentacion inline en gfLogistics.ts | PASS | Bloque IMPORTANT |

### B. PROTECCION ANTI-REGRESION

| # | Check | Estado | Notas |
|---|-------|--------|-------|
| B1 | odooRpc.ts sin cambios | PASS | JSON-RPC intacto |
| B2 | useSyncStore.ts sin cambios | PASS | Cola offline intacta |
| B3 | useAuthStore.ts sin cambios | PASS | Login intacto |
| B4 | ranking.tsx sin cambios | PASS | JSON-RPC intacto |
| B5 | Consistencia gfLogistics vs useSyncStore | PASS | Ambos usan payload plano |

### C. HARDENING APLICADO

| # | Check | Estado | Notas |
|---|-------|--------|-------|
| C1 | Anti double-tap en check-in | PASS | checkingIn state guard |
| C2 | Anti double-tap en check-out | PASS | checkingOut state guard + loading |
| C3 | Guard concurrencia en loadPlan | PASS | isLoading early return |
| C4 | Logging mejorado en postRest | PASS | DEV-only status warning |

### D. PRUEBAS EN DISPOSITIVO REAL (pendientes)

| # | Check | Estado | Requiere |
|---|-------|--------|----------|
| D1 | Login exitoso | PENDIENTE | Dispositivo + backend |
| D2 | getMyPlan() devuelve plan | PENDIENTE | Empleado con plan activo |
| D3 | getPlanStops() devuelve stops | PENDIENTE | Plan con paradas |
| D4 | Mapa muestra markers | PENDIENTE | Dev build (expo run:android) |
| D5 | Polyline conecta paradas | PENDIENTE | 2+ stops con coordenadas |
| D6 | Check-in online funciona | PENDIENTE | Red + GPS |
| D7 | Check-out online funciona | PENDIENTE | Despues de check-in |
| D8 | Check-in offline se encola | PENDIENTE | Modo avion |
| D9 | Resync funciona al reconectar | PENDIENTE | Activar red |
| D10 | Navegacion externa abre Maps | PENDIENTE | Google Maps instalado |
| D11 | Usuario sin plan ve mensaje correcto | PENDIENTE | Empleado sin plan |
| D12 | Parada sin coordenadas permite check-in | PENDIENTE | Stop sin lat/lon |
| D13 | Error de red muestra feedback | PENDIENTE | Backend apagado |
| D14 | Double-tap no duplica checkin | PENDIENTE | Tap rapido |
| D15 | Performance: carga < 3s | PENDIENTE | Red normal |

### E. CRITERIO DE SALIDA

Para marcar READY TO PUSH:
- Seccion A: 100% PASS
- Seccion B: 100% PASS
- Seccion C: 100% PASS
- Seccion D: Al menos D1-D5 ejecutados en dispositivo real
