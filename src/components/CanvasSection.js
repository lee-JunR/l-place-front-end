// src/components/CanvasSection.jsx
import React, { useRef, useEffect } from 'react';

function CanvasSection({
  canvasData,
  viewport,
  cellSize,
  canvasSize,
  padding,
  // 이벤트 핸들러들
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
  // 가장 중요한: (x, y) 계산 후 부모에게 넘길 함수
  onPixelClick,
}) {
  const canvasRef = useRef(null);

  // 1) 캔버스 렌더링 함수
  const renderCanvas = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    // (1) 캔버스 크기 조정
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;

    // (2) 스케일링된 셀 크기
    const scaledCellSize = cellSize / viewport.zoom;

    // (3) 렌더링할 영역 계산
    const startX = Math.max(0, Math.floor(viewport.x - padding));
    const startY = Math.max(0, Math.floor(viewport.y - padding));
    const endX = Math.min(canvasSize, Math.ceil(viewport.x + canvas.width / scaledCellSize + padding));
    const endY = Math.min(canvasSize, Math.ceil(viewport.y + canvas.height / scaledCellSize + padding));

    // (4) 픽셀 렌더링
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const pixel = canvasData[y]?.[x];
        context.fillStyle = pixel?.color || '#ffffff';
        context.fillRect(
          (x - viewport.x) * scaledCellSize,
          (y - viewport.y) * scaledCellSize,
          scaledCellSize,
          scaledCellSize
        );
      }
    }
  };

  // 2) 캔버스가 업데이트될 때마다 렌더링
  useEffect(() => {
    requestAnimationFrame(renderCanvas);
    // eslint-disable-next-line
  }, [canvasData, viewport]);

  // 3) 내부 onClick → (x, y) 계산 → 부모의 onPixelClick 호출
  const handleClick = (e) => {
    if (!onPixelClick) return; // 콜백이 없으면 무시
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    // 배율 반영
    const scaledCellSize = cellSize / viewport.zoom;
    const clickedX = Math.floor((e.clientX - rect.left) / scaledCellSize + viewport.x);
    const clickedY = Math.floor((e.clientY - rect.top) / scaledCellSize + viewport.y);

    onPixelClick(clickedX, clickedY);
  };

  return (
    <canvas
      ref={canvasRef}
      className="canvas"
      // 크기는 내부에서 조정하므로 width/height 속성은 생략 가능
      onClick={handleClick}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
    />
  );
}

export default CanvasSection;