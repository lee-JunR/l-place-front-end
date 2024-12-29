// src/components/PaletteControls.jsx
import React from 'react';
import { PaletteToggleIcon } from './Icon'; // Icon 경로에 맞춰 수정

function PaletteControls({
  isPaletteVisible,
  togglePalette,
  selectedColor,
  onColorSelect,
  colorPalette // ex: COLOR_PALETTE 배열
}) {
  return (
    <div className="palette-controls">
      <button 
        className={`palette-toggle ${isPaletteVisible ? 'active' : ''}`}
        onClick={togglePalette}
        title={isPaletteVisible ? '팔레트 숨기기' : '팔레트 보기'}
      >
        <PaletteToggleIcon />
      </button>

      <div className={`color-picker ${!isPaletteVisible ? 'hidden' : ''}`}>
        {colorPalette.map((color) => (
          color === 'custom' ? (
            <div 
              key={color}
              className={`custom-color-button ${selectedColor === color ? 'selected' : ''}`}
            >
              <input
                type="color"
                className="custom-color-input"
                value={selectedColor}
                onChange={(e) => onColorSelect(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ) : (
            <div
              key={color}
              className={`color-swatch ${selectedColor === color ? 'selected' : ''}`}
              style={{ backgroundColor: color }}
              onClick={(e) => {
                e.stopPropagation();
                onColorSelect(color);
              }}
            />
          )
        ))}
      </div>
    </div>
  );
}

export default PaletteControls;