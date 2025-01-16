import React, { useRef, useEffect, useCallback } from 'react';

function CanvasSection({
  canvasData,
  viewport,
  placedPixels,
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onCanvasClick,
  mainCanvasRef
}) {
  // wheel 이벤트 리스너 추가
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    // wheel 이벤트 핸들러
    const wheelHandler = (e) => {
      e.preventDefault();
      onWheel(e);
    };

    // wheel 이벤트 캡처 단계에서 처리
    canvas.addEventListener('wheel', wheelHandler, { 
      passive: false,
      capture: true  // 캡처 단계에서 이벤트 처리
    });
    
    // 클린업 함수
    return () => {
      canvas.removeEventListener('wheel', wheelHandler, { 
        capture: true  // 제거할 때도 동일한 옵션 필요
      });
    };
  }, [onWheel]);

  // 실제 캔버스를 그리는 함수
  const renderCanvas = useCallback(() => {
    const { CANVAS_SIZE, CELL_SIZE } = { CANVAS_SIZE: 256, CELL_SIZE: 16 }; // 상수 직접 사용 or import
    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas) return;

    const context = mainCanvas.getContext('2d');
    if (!context) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // 리사이즈 여부 확인
    if (mainCanvas.width !== width || mainCanvas.height !== height) {
      mainCanvas.width = width;
      mainCanvas.height = height;
    }

    // 배경색
    context.fillStyle = '#1a1a1a';
    context.fillRect(0, 0, width, height);

    const scaledCellSize = CELL_SIZE / viewport.zoom;
    const totalCanvasWidth = CANVAS_SIZE * scaledCellSize;
    const totalCanvasHeight = CANVAS_SIZE * scaledCellSize;
    const offsetX = (width - totalCanvasWidth) / 2;
    const offsetY = (height - totalCanvasHeight) / 2;

    // 픽셀 그리기
    for (let y = 0; y < CANVAS_SIZE; y++) {
      for (let x = 0; x < CANVAS_SIZE; x++) {
        const renderX = Math.floor(offsetX + (x - viewport.x) * scaledCellSize);
        const renderY = Math.floor(offsetY + (y - viewport.y) * scaledCellSize);
        const renderSize = Math.max(1, Math.ceil(scaledCellSize));

        const pixel = canvasData[y]?.[x];
        context.fillStyle = pixel?.color || '#ffffff';
        context.fillRect(renderX, renderY, renderSize, renderSize);
      }
    }

    // 픽셀 클릭 시 강조선
    context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    context.lineWidth = 2;
    placedPixels.forEach(pixel => {
      const renderX = Math.floor(offsetX + (pixel.x - viewport.x) * scaledCellSize);
      const renderY = Math.floor(offsetY + (pixel.y - viewport.y) * scaledCellSize);
      const renderSize = Math.max(1, Math.ceil(scaledCellSize));
      context.strokeRect(renderX, renderY, renderSize, renderSize);
    });

  }, [canvasData, viewport, placedPixels]);

  // 화면 업데이트 시 매번 캔버스 렌더링
  useEffect(() => {
    requestAnimationFrame(renderCanvas);
  }, [renderCanvas]);

  return (
    <canvas
      ref={mainCanvasRef}
      className="main-canvas"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onClick={onCanvasClick}
    />
  );
}

export default CanvasSection;