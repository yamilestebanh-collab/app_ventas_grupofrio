# 45 — Test Plan: Dispositivo Real

## Fecha: 2026-04-03
## Prerequisitos

- Android con dev build (`expo run:android`) — react-native-maps NO funciona en Expo Go
- Backend Odoo corriendo y accesible
- Empleado con plan de rutas asignado para hoy
- Google Maps instalado en el dispositivo
- GPS habilitado

---

## CASO 1: Login y carga de plan

**Nombre:** TC-01 Login y plan
**Severidad si falla:** CRITICA
**Precondiciones:** App recien instalada, backend accesible

**Pasos:**
1. Abrir la app
2. Ingresar URL del servidor, barcode y PIN del empleado
3. Presionar "Iniciar sesion"
4. Esperar a que cargue la pantalla principal

**Resultado esperado:**
- Login exitoso, pantalla Home visible
- Nombre del empleado visible en header
- Numero de paradas mostrado (ej: "8 paradas")
- Barra de progreso visible (0% si no hay paradas completadas)
- NO debe aparecer "Sin plan para hoy" si el empleado tiene plan

---

## CASO 2: Visualizacion del mapa con markers

**Nombre:** TC-02 Mapa con markers
**Severidad si falla:** CRITICA
**Precondiciones:** TC-01 pasado, empleado con plan que tenga stops con coordenadas

**Pasos:**
1. Desde Home, navegar al tab "Ruta"
2. Presionar boton "Ver Mapa" o navegar a pantalla de mapa
3. Observar el mapa

**Resultado esperado:**
- Mapa de Google visible (no gris, no vacio)
- Markers (pins) visibles en las ubicaciones de los clientes
- Cada marker muestra nombre y estado al presionarlo
- Barra de stats arriba del mapa: "X Paradas / Y Visitadas / Z Pendientes"
- Si hay stops sin coordenadas, aparece "N Sin GPS" en rojo

---

## CASO 3: Polyline de ruta

**Nombre:** TC-03 Polyline
**Severidad si falla:** ALTA
**Precondiciones:** TC-02 pasado, al menos 2 stops con coordenadas

**Pasos:**
1. En la pantalla de mapa, observar las lineas entre markers

**Resultado esperado:**
- Linea naranja punteada conectando los markers en orden de ruta
- La linea sigue la secuencia route_sequence (no es aleatoria)
- Si solo hay 1 stop con coordenadas, NO aparece linea (correcto)

---

## CASO 4: Check-in online con geofence

**Nombre:** TC-04 Check-in online
**Severidad si falla:** CRITICA
**Precondiciones:** TC-01 pasado, GPS activo, dentro del rango del cliente (50m)

**Pasos:**
1. Desde la lista de paradas, seleccionar una parada pendiente
2. Esperar a que el GPS se inicialice (icono de carga)
3. Verificar que el indicador muestre "A Xm del cliente" en verde
4. Presionar "Hacer Check-in"
5. Observar la transicion

**Resultado esperado:**
- Boton se deshabilita inmediatamente (anti double-tap)
- Pantalla cambia a estado "En visita"
- Timer comienza a correr (00:00, 00:01, ...)
- Barra verde con hora de check-in y coordenadas GPS
- Grid de acciones visible: Hacer Venta, No Venta, Prospeccion, Cobrar
- En la lista de rutas, la parada cambia a estado "En curso" (naranja)

---

## CASO 5: Check-in fuera de rango

**Nombre:** TC-05 Check-in fuera de rango
**Severidad si falla:** MEDIA
**Precondiciones:** TC-01 pasado, GPS activo, FUERA del rango del cliente (>50m)

**Pasos:**
1. Seleccionar una parada que este lejos
2. Esperar GPS
3. Verificar indicador rojo "A Xm — necesitas estar a <50m"
4. Intentar presionar el boton (debe estar deshabilitado)
5. Si logra presionar, verificar alerta

**Resultado esperado:**
- Boton deshabilitado y en rojo: "Fuera de rango (Xm)"
- Si se presiona de alguna forma, aparece Alert: "Fuera de rango"
- Check-in NO se ejecuta
- Boton "Actualizar ubicacion" visible para reintentar GPS

---

## CASO 6: Check-in sin coordenadas del cliente

**Nombre:** TC-06 Check-in libre
**Severidad si falla:** MEDIA
**Precondiciones:** TC-01 pasado, parada SIN customer_latitude/longitude

**Pasos:**
1. Seleccionar la parada sin coordenadas
2. Esperar GPS
3. Verificar mensaje "Cliente sin coordenadas (check-in libre)"
4. Presionar "Hacer Check-in"

**Resultado esperado:**
- Boton habilitado (check-in libre, sin geofence)
- Check-in exitoso con coordenadas del vendedor
- Transicion a estado "En visita"

---

## CASO 7: Check-out online

**Nombre:** TC-07 Check-out online
**Severidad si falla:** CRITICA
**Precondiciones:** TC-04 pasado (check-in realizado)

**Pasos:**
1. Desde la pantalla "En visita", presionar "Check-out · Terminar Visita"
2. En pantalla de checkout, verificar el resumen de visita
3. Presionar "Confirmar Check-out"
4. Observar la navegacion

**Resultado esperado:**
- Boton se deshabilita y muestra loading (anti double-tap)
- Resumen visible: venta, kg, foto, GPS
- Despues de confirmar, navega a siguiente parada o Home
- En lista de rutas, parada cambia a "Visitado" (verde)
- Timer se resetea

---

## CASO 8: Check-in offline

**Nombre:** TC-08 Check-in offline
**Severidad si falla:** CRITICA
**Precondiciones:** TC-01 pasado, GPS activo

**Pasos:**
1. Activar modo avion en el dispositivo
2. Seleccionar una parada pendiente
3. Esperar GPS (funciona sin red)
4. Presionar "Hacer Check-in"

**Resultado esperado:**
- Check-in se ejecuta localmente (timer inicia)
- Operacion encolada en la cola de sincronizacion
- Icono de sync pendiente visible (si existe en UI)
- Pantalla cambia a "En visita" normalmente
- NO aparece error de red

---

## CASO 9: Resincronizacion

**Nombre:** TC-09 Resync
**Severidad si falla:** CRITICA
**Precondiciones:** TC-08 pasado (operacion en cola)

**Pasos:**
1. Desactivar modo avion
2. Esperar 5-10 segundos
3. Verificar que la cola se procese

**Resultado esperado:**
- Cola de sync se vacia automaticamente
- Operaciones pendientes bajan a 0
- No hay errores en consola (si dev build con metro)
- Estado del stop en servidor coincide con el local

---

## CASO 10: Navegacion externa (Google Maps)

**Nombre:** TC-10 Navegacion
**Severidad si falla:** MEDIA
**Precondiciones:** TC-02 pasado, Google Maps instalado

**Pasos:**
1. En el mapa, presionar un marker
2. Presionar el callout (popup) del marker
3. Verificar que abre Google Maps

**Alternativa:**
1. Desde el mapa, verificar boton "Ir a #N ClienteX" abajo
2. Presionarlo

**Resultado esperado:**
- Google Maps se abre con destino en la ubicacion del cliente
- Navegacion GPS comienza automaticamente
- Si Google Maps no esta instalado, abre en navegador web

---

## CASO 11: Usuario sin plan

**Nombre:** TC-11 Sin plan
**Severidad si falla:** BAJA
**Precondiciones:** Empleado sin plan asignado para hoy

**Pasos:**
1. Login con empleado sin plan
2. Observar pantalla Home

**Resultado esperado:**
- Mensaje "Sin plan para hoy" o similar
- No se muestra error 400 ni crash
- App funcional (puede navegar a otras tabs)

---

## CASO 12: Error de red en carga de plan

**Nombre:** TC-12 Error de red
**Severidad si falla:** MEDIA
**Precondiciones:** Backend apagado o sin red

**Pasos:**
1. Apagar backend o activar modo avion ANTES de login
2. Intentar login → debe fallar con mensaje claro
3. O: login exitoso, luego cortar red, hacer pull-to-refresh

**Resultado esperado:**
- Mensaje de error claro: "Error de conexion" o "Error cargando plan"
- NO crash, NO pantalla blanca
- App sigue funcional si habia datos cacheados

---

## CASO 13: Double-tap en check-in

**Nombre:** TC-13 Double-tap checkin
**Severidad si falla:** ALTA
**Precondiciones:** TC-01 pasado, dentro de rango

**Pasos:**
1. Presionar "Hacer Check-in" dos veces rapido (< 200ms)

**Resultado esperado:**
- Solo UN check-in se envia al servidor
- Boton se deshabilita despues del primer tap
- Timer inicia solo una vez
- No hay errores en consola

---

## CASO 14: Double-tap en check-out

**Nombre:** TC-14 Double-tap checkout
**Severidad si falla:** ALTA
**Precondiciones:** Check-in realizado

**Pasos:**
1. En pantalla de checkout, presionar "Confirmar Check-out" dos veces rapido

**Resultado esperado:**
- Solo UN checkout se envia
- Boton muestra loading y se deshabilita
- Navegacion ocurre solo una vez
- No hay doble navegacion o screen flicker

---

## CASO 15: Performance basica

**Nombre:** TC-15 Performance
**Severidad si falla:** BAJA
**Precondiciones:** TC-01 pasado, red normal

**Pasos:**
1. Medir tiempo desde login hasta ver paradas
2. Medir tiempo desde abrir mapa hasta ver markers
3. Medir tiempo de check-in (tap a transicion)

**Resultado esperado:**
- Carga de plan: < 3 segundos
- Mapa con markers: < 2 segundos
- Check-in: < 1 segundo (respuesta local)
