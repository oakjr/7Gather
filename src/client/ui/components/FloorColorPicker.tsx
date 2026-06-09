import React, { useCallback } from 'react';
import { FLOOR_COLORS } from '@shared/constants';

export interface FloorColorPickerProps {
  /** Index of the currently active floor color (0–17), or null if no color set. */
  currentColorIndex: number | null;
  /** Callback triggered when a color swatch is selected. */
  onSelectColor: (index: number) => void;
  /** Whether the user has a home room defined. Component does not render without one. */
  hasHomeRoom?: boolean;
}

/**
 * FloorColorPicker displays a grid of 18 color swatches allowing the home room
 * owner to choose a custom floor tint for their private room.
 *
 * Only renders when the user has a home room defined.
 * The active swatch is highlighted with a visible border (not color-only distinction).
 * Clicking a swatch calls onSelectColor which should send set_floor_color to the server
 * within 500ms.
 *
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5
 */
export const FloorColorPicker: React.FC<FloorColorPickerProps> = ({
  currentColorIndex,
  onSelectColor,
  hasHomeRoom = false,
}) => {
  const handleSwatchClick = useCallback(
    (index: number) => {
      onSelectColor(index);
    },
    [onSelectColor]
  );

  if (!hasHomeRoom) {
    return null;
  }

  return (
    <div
      className="floor-color-picker"
      role="group"
      aria-label="Cor do piso"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '6px',
        padding: '8px',
        maxWidth: '220px',
      }}
    >
      {FLOOR_COLORS.map((color, index) => {
        const isActive = currentColorIndex === index;
        return (
          <button
            key={index}
            type="button"
            onClick={() => handleSwatchClick(index)}
            aria-label={`Cor ${index + 1}`}
            aria-pressed={isActive}
            title={`Cor ${index + 1}`}
            style={{
              width: '28px',
              height: '28px',
              backgroundColor: color,
              border: isActive ? '2px solid white' : '2px solid transparent',
              borderRadius: '4px',
              cursor: 'pointer',
              outline: 'none',
              padding: 0,
              boxSizing: 'border-box',
            }}
          />
        );
      })}
    </div>
  );
};

export default FloorColorPicker;
