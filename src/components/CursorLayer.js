// src/components/CursorLayer.jsx

import React from 'react';

function CursorLayer({
  cursors,
  username,      // 현재 내 username
  viewport,
  cellSize,
}) {
  return (
    <>
      {Object.entries(cursors).map(([cursorUsername, position]) => {
        if (cursorUsername === username) {
          // 내 커서는 그리지 않는다면 (기존 로직 유지)
          return null;
        }

        const left = (position.x - viewport.x) * (cellSize / viewport.zoom);
        const top = (position.y - viewport.y) * (cellSize / viewport.zoom);

        return (
          <div
            key={cursorUsername}
            className="cursor"
            style={{ left, top }}
          >
            <div
              className="cursor-pointer"
              style={{ backgroundColor: position.color }}
            />
            <div
              className="cursor-username"
              style={{
                border: `2px solid ${position.color}`,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
              }}
            >
              {cursorUsername}
            </div>
          </div>
        );
      })}
    </>
  );
}

export default CursorLayer;