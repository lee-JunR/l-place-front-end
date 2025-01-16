import React, { useMemo } from 'react';

function CursorLayer({ cursors, usernameRef, viewport, cellSize, getScreenCoords }) {
  // 커서들을 배열로 memoize하여 성능 최적화 (선택)
  const cursorEntries = useMemo(() => Object.entries(cursors), [cursors]);

  return (
    <>
      {cursorEntries.map(([cursorUsername, position]) => (
        usernameRef.current !== cursorUsername && (
          <div
            key={cursorUsername}
            className="cursor"
            style={getScreenCoords(position.x, position.y)}
          >
            <div 
              className="cursor-pointer"
              style={{ backgroundColor: position.color }}
            />
            <div 
              className="cursor-username"
              style={{ 
                border: `2px solid ${position.color}`,
                backgroundColor: 'rgba(0, 0, 0, 0.5)'
              }}
            >
              {cursorUsername}
            </div>
          </div>
        )
      ))}
    </>
  );
}

export default CursorLayer;