import { useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Press-feedback animation hook for primary CTAs.
 * Mirrors the web `.cta:hover` micro-interaction: scale down + translate
 * down slightly on press, spring back on release.
 *
 * Usage:
 *   const press = useButtonPress();
 *   <Animated.View style={{
 *     transform: [
 *       { scale: press.scale },
 *       { translateY: press.translateY.interpolate({ inputRange: [0,1], outputRange: [0,2] }) },
 *     ],
 *   }}>
 *     <Pressable onPressIn={press.onPressIn} onPressOut={press.onPressOut} ...>...</Pressable>
 *   </Animated.View>
 */
export function useButtonPress() {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const onPressIn = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }),
      Animated.spring(translateY, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 0 }),
    ]).start();
  };

  const onPressOut = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 30, bounciness: 6 }),
    ]).start();
  };

  return { scale, translateY, onPressIn, onPressOut };
}
