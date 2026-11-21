// Root of the app: loads the fonts, shared state, and the bottom tab bar
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BricolageGrotesque_600SemiBold } from "@expo-google-fonts/bricolage-grotesque/600SemiBold";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque/800ExtraBold";
import { InstrumentSans_400Regular } from "@expo-google-fonts/instrument-sans/400Regular";
import { InstrumentSans_500Medium } from "@expo-google-fonts/instrument-sans/500Medium";
import { InstrumentSans_600SemiBold } from "@expo-google-fonts/instrument-sans/600SemiBold";
import { InstrumentSans_700Bold } from "@expo-google-fonts/instrument-sans/700Bold";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { Ionicons, type IconName } from "@/components/ui";
import { colors, fonts } from "@/lib/theme";
import { Platform, View } from "react-native";
import AlertBanner from "@/components/AlertBanner";
import { AppStateProvider, useAppState } from "@/state/AppState";

// tab bar icons (color comes in typed loosely, Ionicons wants a string)
const tabIcon = (name: IconName) =>
  function TabIcon({ color, size }: { color: unknown; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_800ExtraBold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    JetBrainsMono_500Medium,
  });

  // wait for fonts so text doesn't jump. if they fail to load just carry on with system fonts
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <StatusBar style="dark" />
        <AppTabs />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

// separate component so it can read the shared state for the tab badges
function AppTabs() {
  const { watchCount, mission } = useAppState();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.pine,
          tabBarInactiveTintColor: colors.faint,
          tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 11, lineHeight: 14, flexShrink: 0 }, // flexShrink 0 so the label never gets squeezed and clipped
          tabBarStyle: {
            backgroundColor: colors.white,
            borderTopColor: colors.line,
            // the browser has no safe-area inset, so give the labels a bit more room there
            ...(Platform.OS === "web" ? { height: 58, paddingBottom: 6, paddingTop: 4 } : null),
          },
          tabBarBadgeStyle: { backgroundColor: colors.pine, color: colors.white, fontFamily: fonts.bodySemi, fontSize: 10 },
          sceneStyle: { backgroundColor: colors.mist },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon("pulse") }} />
        <Tabs.Screen
          name="find"
          options={{
            title: "Find",
            tabBarIcon: tabIcon("search"),
            // little dot while a search is running, so you know it's still going from other tabs
            tabBarBadge: mission.state.running ? "" : undefined,
            tabBarAccessibilityLabel: mission.state.running ? "Find, search running" : "Find",
          }}
        />
        <Tabs.Screen
          name="watchdog"
          options={{
            title: "Watchdog",
            tabBarIcon: tabIcon("notifications-outline"),
            tabBarBadge: watchCount > 0 ? watchCount : undefined,
          }}
        />
        <Tabs.Screen name="how-it-works" options={{ title: "How it works", tabBarIcon: tabIcon("information-circle-outline") }} />
        {/* not-found is a screen but shouldn't get its own tab */}
        <Tabs.Screen name="+not-found" options={{ href: null }} />
      </Tabs>
      <AlertBanner />
    </View>
  );
}
