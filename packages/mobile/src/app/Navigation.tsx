import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import CopilotScreen from '../screens/copilot/CopilotScreen';
import AmbulatoryScreen from '../screens/ambulatory/AmbulatoryScreen';
import PharmacyScreen from '../screens/pharmacy/PharmacyScreen';
import AcademicScreen from '../screens/academic/AcademicScreen';
import MoreScreen from '../screens/more/MoreScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import NotificationCenterScreen from '../screens/notifications/NotificationCenterScreen';
import AnamnesisTemplatesScreen from '../screens/ambulatory/AnamnesisTemplatesScreen';
import ConnectorsScreen from '../screens/connectors/ConnectorsScreen';
import { useTheme } from '../contexts/ThemeContext';
// NotificationContext kept for toast-only usage (bell removed to match web)
import { useDeviceClass } from '../hooks/useDeviceClass';
import { useUser } from '../contexts/UserContext';
import VerificationBanner from '../components/common/VerificationBanner';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import type {
  RootStackParamList,
  AuthStackParamList,
  MainTabParamList,
  MainDrawerParamList,
  MoreStackParamList,
} from '../navigation/types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
const MainDrawer = createDrawerNavigator<MainDrawerParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

// Tab/drawer icons as text (avoiding vector-icons native linking issues)
const TAB_ICONS: Record<string, string> = {
  Copilot: '🤖',
  Ambulatory: '🏥',
  Pharmacy: '💊',
  Academic: '🎓',
  More: '⋯',
  Profile: '👤',
};

// NotificationBellIcon removed — web uses toast-only notifications, no persistent bell

function AuthNavigator({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login">
        {(props) => <LoginScreen {...props} onLoginSuccess={onLoginSuccess} />}
      </AuthStack.Screen>
      <AuthStack.Screen name="Register">
        {(props) => <RegisterScreen {...props} onLoginSuccess={onLoginSuccess} />}
      </AuthStack.Screen>
      <AuthStack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
      />
    </AuthStack.Navigator>
  );
}

function MoreNavigator({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <MoreStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
      }}>
      <MoreStack.Screen
        name="MoreHome"
        component={MoreScreen}
        options={{
          headerShown: true,
          title: t('more', 'Mais'),
        }}
      />
      <MoreStack.Screen name="ProfileStack" options={{ title: '👤 Perfil' }}>
        {() => <ProfileScreen onLogout={onLogout} />}
      </MoreStack.Screen>
      <MoreStack.Screen
        name="NotificationCenter"
        component={NotificationCenterScreen}
        options={{ title: t('notifications', 'Notificações') }}
      />
      <MoreStack.Screen
        name="AnamnesisTemplates"
        component={AnamnesisTemplatesScreen}
        options={{ headerShown: true, title: t('anamnesisTemplates', 'Templates de Anamnese') }}
      />
      <MoreStack.Screen
        name="Connectors"
        component={ConnectorsScreen}
        options={{ headerShown: true, title: t('connectorsTitle', 'Conectores') }}
      />
    </MoreStack.Navigator>
  );
}

// Compact layout: Bottom tab navigator (phones)
function CompactNavigator({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <MainTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.surfaceBorder,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
      }}>
      <MainTab.Screen
        name="Copilot"
        component={CopilotScreen}
        options={{
          title: t('copilot', 'Copiloto'),
          tabBarIcon: () => <TabIcon name="Copilot" />,
        }}
      />
      <MainTab.Screen
        name="Ambulatory"
        component={AmbulatoryScreen}
        options={{
          title: t('ambulatory', 'Ambulatório'),
          tabBarIcon: () => <TabIcon name="Ambulatory" />,
        }}
      />
      <MainTab.Screen
        name="Pharmacy"
        component={PharmacyScreen}
        options={{
          title: t('pharmacy', 'Farmácia'),
          tabBarIcon: () => <TabIcon name="Pharmacy" />,
        }}
      />
      <MainTab.Screen
        name="Academic"
        component={AcademicScreen}
        options={{
          title: t('academic', 'Acadêmico'),
          tabBarIcon: () => <TabIcon name="Academic" />,
        }}
      />
      <MainTab.Screen
        name="More"
        options={{
          title: t('more', 'Mais'),
          tabBarIcon: () => <TabIcon name="More" />,
        }}>
        {() => <MoreNavigator onLogout={onLogout} />}
      </MainTab.Screen>
    </MainTab.Navigator>
  );
}

// Medium/Expanded layout: Drawer navigator (tablets, foldables)
function ExpandedNavigator({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <MainDrawer.Navigator
      screenOptions={{
        drawerType: 'permanent',
        headerShown: false,
        drawerStyle: {
          backgroundColor: theme.background,
          width: 80,
          borderRightColor: theme.surfaceBorder,
        },
        drawerItemStyle: {
          marginVertical: 4,
        },
        drawerActiveTintColor: theme.primary,
        drawerInactiveTintColor: theme.textMuted,
      }}>
      <MainDrawer.Screen
        name="Copilot"
        component={CopilotScreen}
        options={{
          title: t('copilot', 'Copiloto'),
          drawerIcon: () => <TabIcon name="Copilot" />,
        }}
      />
      <MainDrawer.Screen
        name="Ambulatory"
        component={AmbulatoryScreen}
        options={{
          title: t('ambulatory', 'Ambulatório'),
          drawerIcon: () => <TabIcon name="Ambulatory" />,
        }}
      />
      <MainDrawer.Screen
        name="Pharmacy"
        component={PharmacyScreen}
        options={{
          title: t('pharmacy', 'Farmácia'),
          drawerIcon: () => <TabIcon name="Pharmacy" />,
        }}
      />
      <MainDrawer.Screen
        name="Academic"
        component={AcademicScreen}
        options={{
          title: t('academic', 'Acadêmico'),
          drawerIcon: () => <TabIcon name="Academic" />,
        }}
      />
      <MainDrawer.Screen
        name="Profile"
        options={{
          title: t('profile', 'Perfil'),
          drawerIcon: () => <TabIcon name="Profile" />,
        }}>
        {() => <ProfileScreen onLogout={onLogout} />}
      </MainDrawer.Screen>
    </MainDrawer.Navigator>
  );
}

function TabIcon({ name }: { name: string }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 20 }}>{TAB_ICONS[name] || '•'}</Text>;
}

function MainNavigator({ onLogout }: { onLogout: () => void }) {
  const deviceClass = useDeviceClass();

  if (deviceClass === 'compact') {
    return <CompactNavigator onLogout={onLogout} />;
  }
  return <ExpandedNavigator onLogout={onLogout} />;
}

interface Props {
  isAuthenticated: boolean;
  onLoginSuccess: () => void;
  onLogout: () => void;
}

// Gate de onboarding + banner de verificação. Renderizado DENTRO do UserProvider (só
// no branch autenticado), então pode usar useUser(). Default SEGURO: enquanto carrega
// ou se o campo vier undefined, cai no app normal — o onboarding só dispara com
// onboarding_completed === false EXPLÍCITO (espelha o ProtectedRoute do web).
function AuthedRoot({ onLogout }: { onLogout: () => void }) {
  const { user, loading } = useUser();
  if (loading) {
    return null;
  }
  if (user && user.status === 'active' && user.onboarding_completed === false) {
    return <OnboardingScreen />;
  }
  return (
    <View style={{ flex: 1 }}>
      <MainNavigator onLogout={onLogout} />
      <VerificationBanner />
    </View>
  );
}

export default function Navigation({ isAuthenticated, onLoginSuccess, onLogout }: Props) {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <RootStack.Screen name="Main">
          {() => <AuthedRoot onLogout={onLogout} />}
        </RootStack.Screen>
      ) : (
        <RootStack.Screen name="Auth">
          {() => <AuthNavigator onLoginSuccess={onLoginSuccess} />}
        </RootStack.Screen>
      )}
    </RootStack.Navigator>
  );
}
