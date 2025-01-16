// apiService.js
const API_BASE_URL = 'http://localhost:8080';

export const fetchCanvasData = async (CANVAS_SIZE) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/canvas`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error('캔버스 데이터 가져오기 실패');

    const pixels = await response.json();

    const initialCanvas = Array.from({ length: CANVAS_SIZE }, (_, y) =>
      Array.from({ length: CANVAS_SIZE }, (_, x) => ({
        x,
        y,
        color: '#FFFFFF',
      }))
    );

    pixels.forEach(pixel => {
      if (
        pixel &&
        pixel.x >= 0 && pixel.x < CANVAS_SIZE &&
        pixel.y >= 0 && pixel.y < CANVAS_SIZE
      ) {
        initialCanvas[pixel.y][pixel.x] = {
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
        };
      }
    });

    return initialCanvas;
  } catch (error) {
    console.error('캔버스 데이터 가져오기 오류:', error);
    throw error;
  }
};

export const updatePixel = async (pixelDTO) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/pixel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(pixelDTO),
    });

    if (!response.ok) {
      throw new Error('픽셀 업데이트 실패');
    }

    const text = await response.text();
    if (!text) return null; // 같은 색이면 서버가 빈 응답

    return JSON.parse(text);
  } catch (error) {
    console.error('픽셀 업데이트 오류:', error);
    throw error;
  }
};
