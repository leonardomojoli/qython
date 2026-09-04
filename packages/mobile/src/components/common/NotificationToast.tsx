import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';

interface Toast {
  id: number;
  title: string;
  body: string;
  type: 'success' | 'error' | 'warning' | 'info';
  data?: Record<string, string>;
}

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

const TYPE_COLORS: Record<string, string> = {
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#8B5CF6',
};

function ToastItem({ toast, index, onDismiss }: { toast: Toast; index: number; onDismiss: (id: number) => void }) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start();
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [translateY, opacity]);

  const color = TYPE_COLORS[toast.type] || TYPE_COLORS.info;

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          transform: [{ translateY }],
          opacity,
          top: 50 + index * 90,
          borderLeftColor: color,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.toastContent}
        onPress={() => onDismiss(toast.id)}
        activeOpacity={0.8}
      >
        <View style={[styles.dot, { backgroundColor: color }]} />
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>{toast.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{toast.body}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ToastOverlay({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((toast, index) => (
        <ToastItem key={toast.id} toast={toast} index={index} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    alignItems: 'center',
  },
  toast: {
    position: 'absolute',
    width: width - 32,
    backgroundColor: 'rgba(30, 30, 40, 0.95)',
    borderRadius: 12,
    borderLeftWidth: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  body: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
});
