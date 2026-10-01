/**
 * expo-router, reduced to what a screen under test touches: navigation calls
 * are recorded on `router`, route params come from `setParams`, and
 * `<Redirect>` renders a marker a test can look for.
 */
import React, { useEffect } from 'react';
import { Text } from 'react-native';

let params: Record<string, string> = {};
export const setParams = (p: Record<string, string>) => { params = p; };

export const router = {
  push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(),
  dismiss: jest.fn(), dismissAll: jest.fn(), setParams: jest.fn(),
  canGoBack: jest.fn(() => true),
};

export const useRouter = () => router;
export const useLocalSearchParams = () => params;
export const useGlobalSearchParams = () => params;
export const usePathname = () => '/';
export const useSegments = () => [] as string[];
export const useNavigation = () => ({ setOptions: jest.fn(), addListener: jest.fn(() => () => {}), goBack: jest.fn() });
export const useFocusEffect = (effect: () => void | (() => void)) => { useEffect(effect, [effect]); };

export function Redirect({ href }: { href: unknown }) {
  return <Text testID="redirect">{`redirect:${typeof href === 'string' ? href : JSON.stringify(href)}`}</Text>;
}
export function Link({ children }: { children: React.ReactNode }) { return <>{children}</>; }

function StackBase() { return null; }
StackBase.Screen = function Screen() { return null; };
export const Stack = StackBase;
function TabsBase() { return null; }
TabsBase.Screen = function Screen() { return null; };
export const Tabs = TabsBase;
