import React, { useState, useEffect } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import './App.css';

function App() {
  const [canvasData, setCanvasData] = useState([]);
  const [selectedColor, setSelectedColor] = useState('#ff0000');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // WebSocket 설정
    const client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/ws'), // WebSocket 엔드포인트
      reconnectDelay: 5000, // 연결 실패 시 5초 후 재시도
      onConnect: () => {
        setIsConnected(true);
        console.log('WebSocket 연결 성공');
        client.subscribe('/topic/canvas', (message) => {
          const pixel = JSON.parse(message.body);
          setCanvasData((prevData) => {
            const updatedData = [...prevData];
            const index = updatedData.findIndex((p) => p.x === pixel.x && p.y === pixel.y);
            if (index !== -1) {
              updatedData[index] = pixel; // 이미 있는 픽셀 업데이트
            } else {
              updatedData.push(pixel); // 새로운 픽셀 추가
            }
            return updatedData;
          });
        });
      },
      onError: (error) => {
        setIsConnected(false);
        console.error('WebSocket 연결 실패:', error);
      },
    });

    client.activate();

    return () => {
      client.deactivate();
    };
  }, []);

  useEffect(() => {
    // 초기 캔버스 데이터 가져오기
    fetch('http://localhost:8080/api/canvas')
      .then((response) => response.json())
      .then((data) => setCanvasData(data))
      .catch((error) => console.error('Error fetching canvas data:', error));
  }, []);

  const handleCellClick = (x, y) => {
    const pixelDTO = { x, y, color: selectedColor };

    // 서버에 픽셀 업데이트 요청
    fetch('http://localhost:8080/api/pixel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pixelDTO),
    })
      .then((response) => response.json())
      .then((data) => {
        setCanvasData((prevData) => {
          const updatedData = [...prevData];
          const index = updatedData.findIndex((p) => p.x === data.x && p.y === data.y);
          if (index !== -1) {
            updatedData[index] = data; // 업데이트된 픽셀
          } else {
            updatedData.push(data); // 새로운 픽셀 추가
          }
          return updatedData;
        });
      })
      .catch((error) => console.error('Error updating pixel:', error));
  };

  return (
    <div>
      <h1>l/place</h1>
      <div>
        <label>Select Color: </label>
        <input
          type="color"
          value={selectedColor}
          onChange={(e) => setSelectedColor(e.target.value)}
        />
      </div>
      <div className="grid">
        {Array.from({ length: 20 }).map((_, rowIndex) =>
          Array.from({ length: 20 }).map((_, colIndex) => {
            const pixel = canvasData.find((p) => p.x === colIndex && p.y === rowIndex);
            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                className="cell"
                style={{ backgroundColor: pixel ? pixel.color : '#fff' }}
                onClick={() => handleCellClick(colIndex, rowIndex)}
              />
            );
          })
        )}
      </div>
      {!isConnected && <p>WebSocket 연결 실패</p>}
    </div>
  );
}

export default App;
