import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

/**
 * The grouped list used by Settings and its sub-screens. Defined at module
 * scope: declared inside a screen, they were new component types every render,
 * so React remounted every row each time any state changed.
 */

/** The one row arrow used across Settings. */
export function Chevron({ className = 'text-brand-400' }: { className?: string }) {
  return <Text className={`${className} text-lg leading-5`}>›</Text>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2 px-1">{title}</Text>
      <View className="bg-surface-2 rounded-2xl overflow-hidden">{children}</View>
    </View>
  );
}

export function Row({
  label,
  right,
  onPress,
  danger,
}: {
  label: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      className="flex-row justify-between items-center px-4 py-3.5 border-b border-surface-3 last:border-0"
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Text className={danger ? 'text-danger font-medium' : 'text-white'}>{label}</Text>
      {right}
    </TouchableOpacity>
  );
}
