import React from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { useButtonPress } from '../../hooks/useButtonPress';

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline';
  style?: ViewStyle;
  labelStyle?: TextStyle;
  testID?: string;
}

/**
 * Primary call-to-action button that consolidates the design system:
 * LinearGradient fill, luminous brand-colored shadow, animated press
 * feedback (scale + translateY), and consistent typography.
 *
 * Use anywhere you'd previously written:
 *   <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.primary }]}>
 *     <Text style={styles.saveButtonText}>Salvar</Text>
 *   </TouchableOpacity>
 *
 * Variants:
 *   - primary  → LinearGradient + luminous shadow (default)
 *   - secondary → secondary gradient (teal) + matching shadow
 *   - outline  → transparent fill + primary border, no shadow
 */
export default function GradientButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
  labelStyle,
  testID,
}: Props) {
  const { theme } = useTheme();
  const press = useButtonPress();
  const isInactive = loading || disabled;

  const gradientColors =
    variant === 'secondary'
      ? (theme.secondaryGradient as unknown as string[])
      : (theme.primaryGradient as unknown as string[]);

  const shadowTint =
    variant === 'secondary' ? theme.secondary : theme.primary;

  if (variant === 'outline') {
    return (
      <Animated.View
        style={{
          transform: [
            { scale: press.scale },
            {
              translateY: press.translateY.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 2],
              }),
            },
          ],
          borderRadius: borderRadius.md,
        }}>
        <Pressable
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          onPress={onPress}
          disabled={isInactive}
          style={[
            styles.button,
            styles.outlineButton,
            { borderColor: theme.primary },
            isInactive && styles.disabled,
            style,
          ]}
          testID={testID}>
          {loading ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <Text style={[styles.label, { color: theme.primary }, labelStyle]}>
              {label}
            </Text>
          )}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={{
        transform: [
          { scale: press.scale },
          {
            translateY: press.translateY.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 2],
            }),
          },
        ],
        shadowColor: shadowTint,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.42,
        shadowRadius: 11,
        elevation: 7,
        borderRadius: borderRadius.md,
      }}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={onPress}
        disabled={isInactive}
        testID={testID}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.button,
            isInactive && styles.disabled,
            style,
          ]}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.label, styles.labelLight, labelStyle]}>{label}</Text>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  outlineButton: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    ...typography.button,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  labelLight: {
    color: '#ffffff',
  },
});
