/**
 * The shop app's shared UI kit — Design System v1 (green). Import from here:
 *
 *   import { Button, Card, HeroHeader, ServiceTile } from '@/components/ui';
 *
 * Every piece reads `useAppTheme()` itself (light + dark follow the phone),
 * keeps touch targets ≥ 44 px, lets Hindi labels wrap, and uses the motion
 * helpers in `src/theme/motion.tsx` (reduce-motion aware).
 * Live gallery (dev builds only): open `/dev-ui-kit`.
 */
export { Button, type ButtonProps, type ButtonVariant } from './Button';
export { IconButton, type IconButtonVariant } from './IconButton';
export { Chip, ChipStrip } from './Chip';
export { Segmented, type SegmentOption } from './Segmented';
export { StatusBadge, LiveDot, StatusDot } from './StatusBadge';
export { Card, GlassCard, type CardTone } from './Card';
export { HeroHeader, HERO_RATIO, type HeroChipSpec } from './HeroHeader';
export { ServiceTile, TileGrid } from './ServiceTile';
export { ListRow } from './ListRow';
export { ProductCard, ProductGrid, QtyStepper } from './ProductCard';
export { BottomCartBar } from './BottomCartBar';
export { AreaChart } from './AreaChart';
export { Ring, ProgressRing } from './Ring';
// UX-P (2026-10-10, Option A + C): large titles, count-up, stage tabs, swipe rows,
// snap sheets, status dots, scanner sweep, stamp, illustrated empty states.
export { LargeTitle, LargeTitleBar, useLargeTitleScroll } from './LargeTitle';
export { CountUp } from './CountUp';
export { SegmentedTabs, type TabOption } from './SegmentedTabs';
export { SwipeAction, type SwipeActionItem } from './SwipeAction';
export { SnapSheet } from './SnapSheet';
export { ScanLine } from './ScanLine';
export { EmptyArt, type EmptyArtKind } from '../illustrations/EmptyArt';
export { MiniBars, type BarPoint } from '../charts/MiniBars';
export { EmptyState, ErrorState, Skeleton, SkeletonList, SkeletonGrid } from './States';
export { ToastProvider, useToast, type ToastInput, type ToastTone } from './Toast';
export { TextField, SearchField } from './Input';
export { Title, SectionTitle, Money, Detail } from './Typography';
export { FloatingTabBar, TAB_BAR_HEIGHT } from './FloatingTabBar';
export { Storefront } from '../illustrations/Storefront';
export { ProductArt, ArtBackdrop, type ProductArtKind } from '../illustrations/ProductArt';
// 1R (guard + shop lane): sign-in pieces, grouped lists, state feedback.
export { AuthHero, HERO_OVERLAP } from './AuthHero';
export { BrandWordmark } from './BrandWordmark';
export { OtpCells, type OtpCellsState } from './OtpCells';
export { ListGroup, GroupRow, ToggleRow } from './ListGroup';
export { useShake, SuccessCheck, Stamp } from './Feedback';
