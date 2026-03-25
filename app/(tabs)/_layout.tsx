/**
 * Bottom tab navigator — 5 tabs matching mockup .bn class.
 * From KOLD_FIELD_ADDENDUM.md Bloque 1.
 */

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, sizes } from '../../src/theme/tokens';

type TabIcon = keyof typeof Ionicons.glyphMap;

const tabs: { name: string; title: string; icon: TabIcon; iconActive: TabIcon }[] = [
  { name: 'index', title: 'Inicio', icon: 'home-outline', iconActive: 'home' },
  { name: 'route', title: 'Ruta', icon: 'map-outline', iconActive: 'map' },
  { name: 'inventory', title: 'Inventario', icon: 'cube-outline', iconActive: 'cube' },
  { name: 'sales', title: 'Ventas', icon: 'cart-outline', iconActive: 'cart' },
  { name: 'alerts', title: 'Alertas', icon: 'notifications-outline', iconActive: 'notifications' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: 'rgba(255,255,255,0.05)',
          borderTopWidth: 1,
          height: sizes.bottomNavHeight,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '600',
        },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? tab.iconActive : tab.icon}
                size={size || 22}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
