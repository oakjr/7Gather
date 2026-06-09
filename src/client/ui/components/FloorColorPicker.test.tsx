import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FloorColorPicker } from './FloorColorPicker';

describe('FloorColorPicker', () => {
  it('renders exactly 18 color swatches', () => {
    const onSelectColor = vi.fn();
    render(
      <FloorColorPicker
        currentColorIndex={0}
        onSelectColor={onSelectColor}
        hasHomeRoom={true}
      />
    );

    const swatches = screen.getAllByRole('button');
    expect(swatches).toHaveLength(18);
  });

  it('each swatch has an aria-label with its color number', () => {
    const onSelectColor = vi.fn();
    render(
      <FloorColorPicker
        currentColorIndex={null}
        onSelectColor={onSelectColor}
        hasHomeRoom={true}
      />
    );

    const swatches = screen.getAllByRole('button');
    swatches.forEach((swatch, index) => {
      expect(swatch.style.backgroundColor).toBeTruthy();
      expect(swatch.getAttribute('aria-label')).toBe(`Cor ${index + 1}`);
    });
  });

  it('highlights active color with a white border', () => {
    const onSelectColor = vi.fn();
    render(
      <FloorColorPicker
        currentColorIndex={5}
        onSelectColor={onSelectColor}
        hasHomeRoom={true}
      />
    );

    const swatches = screen.getAllByRole('button');

    // Active swatch (index 5) should have white border
    expect(swatches[5].style.border).toBe('2px solid white');
    expect(swatches[5].getAttribute('aria-pressed')).toBe('true');

    // Inactive swatches should have transparent border
    expect(swatches[0].style.border).toBe('2px solid transparent');
    expect(swatches[0].getAttribute('aria-pressed')).toBe('false');
    expect(swatches[4].style.border).toBe('2px solid transparent');
    expect(swatches[4].getAttribute('aria-pressed')).toBe('false');
  });

  it('does not render when hasHomeRoom is false', () => {
    const onSelectColor = vi.fn();
    const { container } = render(
      <FloorColorPicker
        currentColorIndex={0}
        onSelectColor={onSelectColor}
        hasHomeRoom={false}
      />
    );

    expect(container.innerHTML).toBe('');
  });

  it('does not render when hasHomeRoom is not provided (defaults to false)', () => {
    const onSelectColor = vi.fn();
    const { container } = render(
      <FloorColorPicker
        currentColorIndex={0}
        onSelectColor={onSelectColor}
      />
    );

    expect(container.innerHTML).toBe('');
  });

  it('calls onSelectColor with correct index when a swatch is clicked', () => {
    const onSelectColor = vi.fn();
    render(
      <FloorColorPicker
        currentColorIndex={null}
        onSelectColor={onSelectColor}
        hasHomeRoom={true}
      />
    );

    const swatches = screen.getAllByRole('button');

    fireEvent.click(swatches[0]);
    expect(onSelectColor).toHaveBeenCalledWith(0);

    fireEvent.click(swatches[7]);
    expect(onSelectColor).toHaveBeenCalledWith(7);

    fireEvent.click(swatches[17]);
    expect(onSelectColor).toHaveBeenCalledWith(17);
  });

  it('no swatch is highlighted when currentColorIndex is null', () => {
    const onSelectColor = vi.fn();
    render(
      <FloorColorPicker
        currentColorIndex={null}
        onSelectColor={onSelectColor}
        hasHomeRoom={true}
      />
    );

    const swatches = screen.getAllByRole('button');
    swatches.forEach((swatch) => {
      expect(swatch.style.border).toBe('2px solid transparent');
      expect(swatch.getAttribute('aria-pressed')).toBe('false');
    });
  });

  it('renders with role group and proper aria-label', () => {
    const onSelectColor = vi.fn();
    render(
      <FloorColorPicker
        currentColorIndex={0}
        onSelectColor={onSelectColor}
        hasHomeRoom={true}
      />
    );

    const group = screen.getByRole('group');
    expect(group.getAttribute('aria-label')).toBe('Cor do piso');
  });
});
