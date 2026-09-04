import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { DrawerScreenProps } from '@react-navigation/drawer';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Auth stack (unauthenticated)
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

// Main tabs for compact layout (phones)
export type MainTabParamList = {
  Copilot: undefined;
  Ambulatory: undefined;
  Pharmacy: undefined;
  Academic: undefined;
  More: undefined;
};

// Drawer/rail for medium/expanded layout (tablets, foldables)
export type MainDrawerParamList = {
  Copilot: undefined;
  Ambulatory: undefined;
  Pharmacy: undefined;
  Academic: undefined;
  Profile: undefined;
};

// Stack inside "More" tab (compact only)
export type MoreStackParamList = {
  MoreHome: undefined;
  ProfileStack: undefined;
  SyncSettings: undefined;
  NotificationCenter: undefined;
  AnamnesisTemplates: undefined;
  Connectors: undefined;
};

// Root stack combining auth and main flows
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: undefined;
};

// Screen props helpers
export type AuthScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;

export type MainDrawerScreenProps<T extends keyof MainDrawerParamList> =
  CompositeScreenProps<
    DrawerScreenProps<MainDrawerParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;
