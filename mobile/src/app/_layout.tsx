// Root of the app: shared state + the bottom tab bar
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons, type IconName } from "@/components/ui";
import { colors } from "@/lib/theme";
import { AppStateProvider } from "@/state/AppState";

// tab bar icons (color comes in typed loosely, Ionicons wants a string)
const tabIcon = (name: IconName) => ({ color, size }: { color: unknown; size: number }) => (
  <Ionicons name={name} color={color as string} size={size} />
);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <StatusBar style="dark" />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.pine600,
            tabBarInactiveTintColor: colors.slate400,
            tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.slate200 },
            sceneStyle: { backgroundColor: colors.paper },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{ title: "Home", tabBarIcon: tabIcon("home-outline") }}
          />
          <Tabs.Screen
            name="find"
            options={{ title: "Find", tabBarIcon: tabIcon("search") }}
          />
          <Tabs.Screen
            name="watchdog"
            options={{
              title: "Watchdog",
              tabBarIcon: tabIcon("notifications-outline"),
            }}
          />
          <Tabs.Screen
            name="how-it-works"
            options={{
              title: "How it works",
              tabBarIcon: tabIcon("information-circle-outline"),
            }}
          />
        </Tabs>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
