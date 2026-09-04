import { useWindowDimensions } from 'react-native';

export type DeviceClass = 'compact' | 'medium' | 'expanded';

/**
 * Returns the device class based on screen width (dp).
 * - compact: < 600dp (phone) → Bottom Tabs
 * - medium: 600-839dp (foldable, small tablet) → Navigation Rail
 * - expanded: >= 840dp (tablet 10"+) → Navigation Rail + multi-pane
 *
 * Re-renders automatically on rotation or fold/unfold.
 */
export function useDeviceClass(): DeviceClass {
  const { width } = useWindowDimensions();

  if (width >= 840) {
    return 'expanded';
  }
  if (width >= 600) {
    return 'medium';
  }
  return 'compact';
}
